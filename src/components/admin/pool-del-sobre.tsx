import {
  ActionIcon,
  Badge,
  FileButton,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconFileMusic,
  IconFileText,
  IconFileZip,
  IconPhoto,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { type ProductFileType } from "@prisma/client";
import { useState } from "react";

import {
  ACCEPT_ARCHIVO_PRODUCTO,
  AVISO_ARCHIVO,
  useSubirArchivoDeProducto,
} from "~/components/admin/use-subir-archivo-producto";
import {
  formatearPeso,
  validarArchivoDeProducto,
} from "~/lib/archivos/tiposArchivo";
import { api, type RouterOutputs } from "~/utils/api";

type Producto = RouterOutputs["panel"]["listarProductos"][number];
type Archivo = Producto["archivos"][number];

/**
 * La **colección** (pool) de un sobre sorpresa: los archivos entre los que se sortea lo que le toca a
 * cada compra (productos-tipos-digitales F06, D2/D4).
 *
 * A diferencia del archivo de un producto ESTANDAR —donde subir uno nuevo REEMPLAZA al anterior— acá
 * cada subida SUMA al pool. La misma pareja de mutations hace las dos cosas: lo que decide reemplazar
 * o sumar es la `modalidad` del producto, server-side (`confirmarArchivoProducto`). El cliente no
 * elige esa semántica, solo sube.
 *
 * Nunca se muestra la `key` del bucket: el listado del panel no la trae (I2/ADR-0002).
 */

/** Ícono por familia de archivo. `Record` a propósito: un tipo nuevo en el enum sin ícono no compila. */
const ICONO_TIPO: Record<ProductFileType, typeof IconFileText> = {
  PDF: IconFileText,
  EPUB: IconFileText,
  IMAGEN: IconPhoto,
  AUDIO: IconFileMusic,
  ZIP: IconFileZip,
};

/**
 * PRESENTACIÓN PURA: no declara hooks de mutation propios porque eso sería "un hook por fila", que
 * frontend-conventions § Data fetching prohíbe — el borrado vive una sola vez en `PoolDelSobre` y acá
 * llega como callback, con el `loading` aislado por id. Mismo patrón que `FilaCampo` en
 * `campos-checkout.tsx`.
 */
function FilaArchivo({
  archivo,
  onBorrar,
  borrando,
}: {
  archivo: Archivo;
  onBorrar: (fileId: string) => void;
  borrando: boolean;
}) {
  const Icono = ICONO_TIPO[archivo.tipo];

  const confirmarBorrado = () =>
    modals.openConfirmModal({
      title: "Eliminar archivo de la colección",
      children: (
        <Text size="sm">
          <Text component="span" fw={600}>
            {archivo.nombreArchivo}
          </Text>{" "}
          dejará de entrar en los sorteos de las próximas compras. Si ya le tocó
          a alguien, no se puede eliminar: esa descarga es una promesa.
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => onBorrar(archivo.id),
    });

  return (
    // Inset por fila (sin borde), el patrón del panel para filas compuestas — precedente
    // `campos-checkout.tsx`.
    <Paper p="xs" radius="md" bg="var(--mantine-color-default-hover)">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" className="min-w-0">
          <Icono className="size-4 shrink-0 text-[var(--mantine-color-dimmed)]" />
          <Text size="sm" truncate>
            {archivo.nombreArchivo}
          </Text>
          {archivo.bytes !== null && (
            <Text size="xs" c="dimmed" className="shrink-0 tabular-nums">
              {formatearPeso(archivo.bytes)}
            </Text>
          )}
        </Group>
        <ActionIcon
          variant="subtle"
          color="red"
          // Identifica el archivo (precedente `campos-checkout.tsx`): con una colección de 12, un
          // "Eliminar archivo" repetido 12 veces no le sirve a nadie que use lector de pantalla.
          aria-label={`Eliminar ${archivo.nombreArchivo}`}
          loading={borrando}
          onClick={confirmarBorrado}
        >
          <IconTrash className="size-4" />
        </ActionIcon>
      </Group>
    </Paper>
  );
}

/**
 * Bloque de la colección del sobre: cuántos archivos tiene, la lista con su botón de eliminar, y el
 * subidor múltiple.
 */
export function PoolDelSobre({ producto }: { producto: Producto }) {
  const utils = api.useUtils();
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(
    null,
  );

  const { subir } = useSubirArchivoDeProducto();

  // UNA sola mutation para toda la lista (nunca una por fila): el `loading` se aísla por id con
  // `variables`, que es el patrón "mutation por-fila" de frontend-conventions § Data fetching.
  const borrar = api.panel.borrarArchivoDeProducto.useMutation({
    onSuccess: async () => {
      await utils.panel.listarProductos.invalidate();
      notifications.show({ message: "Archivo eliminado.", color: "green" });
    },
    // El server rechaza con mensaje humano cuando el archivo ya le tocó a alguien que pagó, o cuando
    // sacarlo dejaría el sobre a la venta sin poder armar su pack más grande (D4/I7).
    onError: (e) => notifications.show({ message: e.message, color: "red" }),
  });

  /**
   * Sube N archivos al pool, uno por uno (presigned PUT directo a R2: los bytes no pasan por nuestro
   * server). SECUENCIAL y no en paralelo a propósito: son subidas de hasta 20 MB cada una y el
   * paralelismo desde una conexión doméstica las hace competir entre sí y timeoutear. Un fallo a
   * mitad NO tira abajo las anteriores — cada archivo confirmado ya es parte del pool.
   */
  const subirAlPool = async (files: File[]) => {
    // Validación cliente ANTES de empezar (D7): el rechazo se explica con el peso real y no se sube
    // nada de la tanda que no vaya a pasar. El server re-valida tipo y peso igual (I4).
    const validos: File[] = [];
    for (const file of files) {
      const validacion = validarArchivoDeProducto(file);
      if (validacion.ok) {
        validos.push(file);
      } else {
        notifications.show({
          message: `${file.name}: ${validacion.mensaje}`,
          color: "red",
        });
      }
    }
    if (validos.length === 0) return;

    setSubiendo(true);
    setProgreso({ hecho: 0, total: validos.length });
    let subidos = 0;
    try {
      for (const file of validos) {
        // El pipeline presign → PUT → confirmación vive UNA sola vez (I5): el mismo hook que usa el
        // campo de archivo único del form de producto.
        await subir(producto.id, file);
        subidos += 1;
        setProgreso({ hecho: subidos, total: validos.length });
      }
      notifications.show({
        message:
          subidos === 1
            ? "Archivo agregado a la colección."
            : `${subidos} archivos agregados a la colección.`,
        color: "green",
      });
    } catch (e) {
      // Un fallo a mitad NO tira abajo los anteriores: cada archivo confirmado ya es parte del pool,
      // y decirlo evita que el Organizador vuelva a subir toda la tanda.
      const detalle =
        e instanceof Error ? e.message : "No se pudo completar la subida.";
      notifications.show({
        message:
          subidos > 0
            ? `${detalle} Los ${subidos} anteriores sí quedaron.`
            : detalle,
        color: "red",
      });
    } finally {
      setSubiendo(false);
      setProgreso(null);
      // Refresca igual si falló a mitad: lo que sí se confirmó ya está en el pool.
      await utils.panel.listarProductos.invalidate();
    }
  };

  const total = producto.archivos.length;

  return (
    <Stack gap="sm">
      <div>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="sm" fw={500}>
            Colección del sobre
          </Text>
          <Badge
            variant="light"
            color="gray"
            styles={{ root: { flexShrink: 0 }, label: { textTransform: "none" } }}
          >
            <span className="tabular-nums">{total}</span>{" "}
            {total === 1 ? "archivo" : "archivos"}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Entre estos se sortea lo que recibe cada compra. {AVISO_ARCHIVO}
        </Text>
      </div>

      {total > 0 ? (
        <Stack gap={6}>
          {producto.archivos.map((archivo) => (
            <FilaArchivo
              key={archivo.id}
              archivo={archivo}
              onBorrar={(fileId) => borrar.mutate({ fileId })}
              // Solo la fila que se está borrando muestra spinner, no las 12.
              borrando={
                borrar.isPending && borrar.variables?.fileId === archivo.id
              }
            />
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          Todavía no subes archivos. Sube varios de una vez.
        </Text>
      )}

      <Group gap="sm" wrap="nowrap">
        <FileButton
          multiple
          accept={ACCEPT_ARCHIVO_PRODUCTO}
          onChange={(files) => void subirAlPool(files)}
          disabled={subiendo}
        >
          {(props) => (
            <Button
              {...props}
              variant="default"
              loading={subiendo}
              leftSection={<IconUpload className="size-4" />}
            >
              Subir archivos
            </Button>
          )}
        </FileButton>
        {progreso !== null && (
          <Text size="xs" c="dimmed" className="tabular-nums">
            {/*
              `hecho + 1` es el archivo EN VUELO, no los completados: con 0 confirmados se está
              subiendo el 1 de N. No "corregir" el +1 sin cambiar también qué cuenta `hecho`.
            */}
            Subiendo {progreso.hecho + 1} de {progreso.total}…
          </Text>
        )}
      </Group>
    </Stack>
  );
}
