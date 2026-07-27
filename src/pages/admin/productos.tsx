import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconDice3,
  IconFileText,
  IconGift,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconStack2,
  IconUpload,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useEffect, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { VistaPreviaAsset } from "~/components/admin/asset-uploader";
import { PanelCard } from "~/components/admin/panel-card";
import { PoolDelSobre } from "~/components/admin/pool-del-sobre";
import {
  ACCEPT_ARCHIVO_PRODUCTO,
  AVISO_ARCHIVO,
  useSubirArchivoDeProducto,
} from "~/components/admin/use-subir-archivo-producto";
import {
  ACCEPT_IMAGEN,
  useSubirImagenMarca,
} from "~/components/admin/use-subir-imagen";
import {
  formatearPeso,
  validarArchivoDeProducto,
} from "~/lib/archivos/tiposArchivo";
import { clp } from "~/lib/formato";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import { api, type RouterOutputs } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // Matriz de acceso del panel scopeado por subdominio (ADR-0022): redirige al login del apex,
  // al storefront o a la primera tienda, o responde 404 neutral, según host + sesión + membresía.
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
  return { props: {} };
};

type Producto = RouterOutputs["panel"]["listarProductos"][number];
type Modalidad = Producto["modalidad"];

/** De dónde salen los archivos que entrega el producto (ENMIENDA v2, E13/E16). */
type OrigenArchivos = "propios" | "otroProducto";

interface ProductoForm {
  titulo: string;
  descripcion: string;
  precio: string; // dinero SIEMPRE string (I2): CLP entero ⇒ Decimal en el server.
  activo: boolean;
  participaEnSorteo: boolean; // opt-in al sorteo (ADR-0012/D1)
  modalidad: Modalidad; // F06/D2 — se elige al crear y no se edita (ver `crearProductoInput`)
  origen: OrigenArchivos; // E16 — «los subo yo» vs «los entrega otro producto»
  fuenteId: string | null; // solo si origen = otroProducto; inmutable tras crear (V-I1c)
  unidadesPorPack: number; // cuántas unidades de la fuente entrega este pack
}

const VALORES_INICIALES: ProductoForm = {
  titulo: "",
  descripcion: "",
  precio: "3000",
  activo: false, // un producto nace como borrador (sin archivo no hay venta, F03/I7)
  participaEnSorteo: false, // opt-in: no entra al sorteo sin que el Organizador lo decida (D1)
  modalidad: "ESTANDAR", // lo común; la colección es la elección deliberada
  origen: "propios", // lo común: el producto entrega su propio archivo
  fuenteId: null,
  unidadesPorPack: 1,
};

/**
 * Las dos formas de venta de un producto que entrega archivos PROPIOS (F06/D2). El Organizador NO
 * elige el tipo de archivo (eso lo deriva el server del MIME, D9): elige la FORMA de vender.
 *
 * Este control NO se muestra cuando el producto es un pack: en un pack la modalidad no significa
 * nada —la entrega la decide la de su FUENTE— y el server la fuerza a `ESTANDAR` (V-I7). Mostrarlo
 * ofrecería una combinación que no existe.
 */
const OPCIONES_MODALIDAD: Array<{
  value: Modalidad;
  label: string;
  description: string;
}> = [
  {
    value: "ESTANDAR",
    label: "Un archivo",
    description: "Todas reciben el mismo archivo.",
  },
  {
    value: "SOBRE",
    label: "Una colección (se entrega al azar)",
    description:
      "Subes varios archivos y los packs que vendas entregan algunos al azar. La colección no se vende suelta.",
  },
];

/**
 * El selector que hace posible el modelo v2 (E13/E16): un pack es un producto más, y lo único que lo
 * distingue es que sus archivos salen de OTRO producto.
 */
const OPCIONES_ORIGEN: Array<{
  value: OrigenArchivos;
  label: string;
  description: string;
}> = [
  {
    value: "propios",
    label: "Los subo yo",
    description: "Este producto tiene sus propios archivos.",
  },
  {
    value: "otroProducto",
    label: "Los entrega otro producto",
    description:
      "Vende varias unidades de otro producto tuyo. Ej.: «Pack 4 libros» entrega 4 del libro.",
  },
];

function iniciales(titulo: string) {
  return titulo
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ProductoFormModal({
  open,
  onOpenChange,
  producto,
  productos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Producto | null;
  /** Catálogo completo del panel: de acá salen las FUENTES que se pueden elegir (E16). */
  productos: Producto[];
}) {
  const esEdicion = producto !== null;
  const utils = api.useUtils();

  // El archivo nuevo a subir (opcional): en crear lo adjunta; en editar REEMPLAZA al anterior
  // (`confirmarArchivoProducto` borra el previo en la misma `$tx` — un ESTANDAR tiene exactamente 1).
  const [archivo, setArchivo] = useState<File | null>(null);
  // La portada nueva a subir (opcional, imagen). Se sube DESPUÉS de crear/actualizar (necesita el
  // productId para la key per-recurso). El asset se persiste por el flujo de subida, no por el form.
  const [portadaFile, setPortadaFile] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const { subir: subirImagen } = useSubirImagenMarca();

  const form = useForm<ProductoForm>({
    initialValues: VALORES_INICIALES,
    validate: {
      titulo: (v) => (v.trim() === "" ? "El título es obligatorio" : null),
      // El precio viaja como string (I2); validamos que sea un entero CLP > 0 en el cliente,
      // el server vuelve a validar. Jamás aritmética con number.
      precio: (v) =>
        /^\d+$/.test(v.trim()) && Number(v) > 0
          ? null
          : "Ingresa un precio válido en pesos",
    },
  });

  // Rehidratar el form cada vez que se abre con un target distinto.
  useEffect(() => {
    if (!open) return;
    form.setValues({
      titulo: producto?.titulo ?? "",
      descripcion: producto?.descripcion ?? "",
      precio: producto?.precio ?? "3000",
      // La portada NO es campo del form (D4/I6): es un asset que se sube aparte (portadaFile).
      activo: producto?.activo ?? false,
      participaEnSorteo: producto?.participaEnSorteo ?? false,
      modalidad: producto?.modalidad ?? "ESTANDAR",
      origen: producto?.fuente ? "otroProducto" : "propios",
      fuenteId: producto?.fuente?.id ?? null,
      unidadesPorPack: producto?.unidadesPorPack ?? 1,
    });
    form.resetDirty();
    setArchivo(null);
    setPortadaFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto]);

  const onDone = async () => {
    await Promise.all([
      utils.panel.listarProductos.invalidate(),
      // el KPI "Productos activos" del dashboard también depende de esto
      utils.panel.getResumenTienda.invalidate(),
    ]);
    notifications.show({
      message: esEdicion ? "Cambios guardados." : "Producto agregado.",
      color: "green",
    });
    onOpenChange(false);
  };

  const onError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Ocurrió un error. Vuelve a intentar.";
    notifications.show({ message, color: "red" });
  };

  const crear = api.panel.crearProducto.useMutation();
  const actualizar = api.panel.actualizarProducto.useMutation();
  // El pipeline presign → PUT → confirmación vive UNA sola vez (I5), compartido con el subidor
  // múltiple de la colección del sobre (`pool-del-sobre.tsx`).
  const { subir: subirArchivo, subiendo: subiendoArchivo } =
    useSubirArchivoDeProducto();

  const enviando =
    crear.isPending || actualizar.isPending || subiendoArchivo || subiendo;

  /** Sube la portada (imagen) de un producto ya creado (key per-recurso `.../portada`). */
  const subirPortada = async (productId: string, file: File) => {
    setSubiendo(true);
    try {
      await subirImagen({ destino: "portada", productId }, file);
    } finally {
      setSubiendo(false);
    }
  };

  // El producto tiene archivo entregable si ya lo tenía (edición) o si se adjuntó uno ahora.
  // Para una COLECCIÓN y para un PACK, `tieneArchivo` ya es la regla completa que el server calcula
  // con `esProductoEntregable` (para el pack, mirando su FUENTE): acá no se re-deriva.
  const tieneArchivoListo = producto?.tieneArchivo === true || archivo !== null;
  const esPack = form.values.origen === "otroProducto";
  const esSobre = !esPack && form.values.modalidad === "SOBRE";

  /**
   * Las fuentes que se pueden elegir. `puedeSerFuente` lo computa el SERVER (entrega lo suyo + ya
   * tiene archivos) para que el desplegable no re-derive la regla y ofrezca algo que el submit
   * rechazaría. Se excluye el producto que se está editando: no puede ser su propia fuente.
   */
  const fuentes = productos.filter(
    (p) => p.puedeSerFuente && p.id !== producto?.id,
  );
  /** La fuente seleccionada en el form (o la ya guardada, en edición): decide el copy de «al azar». */
  const fuenteElegida = esEdicion
    ? producto.fuente
    : (fuentes.find((f) => f.id === form.values.fuenteId) ?? null);

  /**
   * Valida el archivo elegido ANTES de aceptarlo en el form (F04/D7). El rechazo se explica con
   * notificación —incluyendo el PESO real cuando el problema es el tamaño— y el input queda vacío,
   * así el Organizador no llega al submit creyendo que adjuntó algo.
   *
   * Esto es UX, no seguridad: el server re-valida tipo y peso igual (I4), porque `File.type` y
   * `File.size` los reporta el navegador y no son confiables.
   */
  const elegirArchivo = (file: File | null) => {
    if (file === null) {
      setArchivo(null);
      return;
    }
    const validacion = validarArchivoDeProducto(file);
    if (!validacion.ok) {
      notifications.show({ message: validacion.mensaje, color: "red" });
      setArchivo(null);
      return;
    }
    setArchivo(file);
  };

  const submit = form.onSubmit(async (valores) => {
    try {
      if (esEdicion) {
        // Si hay archivo nuevo, subir ANTES de actualizar: así el guard del server permite activar
        // (el producto ya tendrá su `ProductFile` confirmado). Espeja el guard I7 acá para UX
        // inmediata — el server lo re-chequea con `archivosParaEntrega` de todas formas.
        if (archivo) await subirArchivo(producto.id, archivo);
        if (valores.activo && !tieneArchivoListo) {
          notifications.show({
            message: "Sube el archivo antes de poner el producto a la venta.",
            color: "red",
          });
          return;
        }
        // `portadaUrl` viaja SIN cambio (la URL actual); la portada nueva la escribe la subida.
        // `modalidad` y `fuenteId` NO se mandan: se eligen al crear y no se editan (F06/D2, V-I1c)
        // — el input del server tampoco las acepta, así que enumerar los campos deja explícito lo
        // que sí viaja.
        await actualizar.mutateAsync({
          id: producto.id,
          titulo: valores.titulo,
          descripcion: valores.descripcion,
          precio: valores.precio,
          activo: valores.activo,
          participaEnSorteo: valores.participaEnSorteo,
          unidadesPorPack: valores.unidadesPorPack,
        });
        // Subir la portada nueva DESPUÉS del update (la sobrescribe con la URL fresca, D4/I6).
        if (portadaFile) await subirPortada(producto.id, portadaFile);
      } else {
        // Crear nace como borrador SIN archivo ni portada (el server fuerza portadaUrl null +
        // activo false). La portada se sube como asset tras crear (necesita el productId, D4/I6).
        const creado = await crear.mutateAsync({
          titulo: valores.titulo,
          descripcion: valores.descripcion,
          precio: valores.precio,
          participaEnSorteo: valores.participaEnSorteo,
          // En un pack la modalidad no significa nada y el server la fuerza a ESTANDAR (V-I7);
          // se manda el valor del form igual para no inventar una segunda regla acá.
          modalidad: valores.modalidad,
          fuenteId: esPack ? valores.fuenteId : null,
          unidadesPorPack: esPack ? valores.unidadesPorPack : 1,
        });
        // Si se adjuntó un archivo, subirlo y confirmarlo (queda listo para activar después).
        if (archivo) await subirArchivo(creado.id, archivo);
        // Si se adjuntó una portada, subirla (key per-recurso con el id recién creado).
        if (portadaFile) await subirPortada(creado.id, portadaFile);
      }
      await onDone();
    } catch (e) {
      onError(e);
    }
  });

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={esEdicion ? "Editar producto" : "Agregar producto"}
      size="lg"
    >
      <Text size="sm" c="dimmed" mb="md">
        {esEdicion
          ? "Modifica los datos del producto y guarda los cambios."
          : "Completa los datos del producto que quieres poner a la venta."}
      </Text>

      <form onSubmit={submit}>
        <div className="grid gap-4">
          {/*
            La modalidad se elige al CREAR y después queda fija (F06/D2): cambiarla sobre un sobre que
            ya tiene colección y packs rompería el invariante "archivo único ⇒ exactamente 1 archivo"
            y dejaría packs huérfanos. En edición se muestra como dato, sin control.
          */}
          {/*
            E13/E16 — «un pack es un producto más»: lo ÚNICO que lo distingue es de dónde salen sus
            archivos. Por eso este selector va PRIMERO y el resto del form es el de siempre. En
            edición no se ofrece: `fuenteId` es inmutable (V-I1c), así que se muestra como dato.
          */}
          {esEdicion ? (
            <Text size="sm" c="dimmed">
              {producto.fuente ? (
                <>
                  Entrega{" "}
                  <Text component="span" fw={500} c="var(--mantine-color-text)">
                    {producto.unidadesPorPack}{" "}
                    {producto.unidadesPorPack === 1 ? "unidad" : "unidades"}
                  </Text>{" "}
                  de{" "}
                  <Text component="span" fw={500} c="var(--mantine-color-text)">
                    {producto.fuente.titulo}
                  </Text>
                  {producto.fuente.modalidad === "SOBRE" && " (al azar)"}. El
                  producto del que salen no se puede cambiar después de crear;
                  cuántas entrega, sí.
                </>
              ) : (
                <>
                  Entrega:{" "}
                  <Text component="span" fw={500} c="var(--mantine-color-text)">
                    {esSobre ? "una colección (al azar)" : "un archivo"}
                  </Text>
                  . No se puede cambiar después de crear el producto.
                </>
              )}
            </Text>
          ) : null}

          {/*
            `unidadesPorPack` SÍ es editable (E15): subir un «Pack 4 libros» a 6 es un cambio de
            producto normal, y la historia la protege el snapshot del OrderItem. En el alta este
            control vive junto al selector de fuente, más abajo.
          */}
          {esEdicion && producto.fuente && (
            <NumberInput
              label="¿Cuántas entrega?"
              description={
                producto.fuente.modalidad === "SOBRE"
                  ? "Se eligen al azar de la colección, sin repetir."
                  : undefined
              }
              // `hideControls` en vez de `min`/`max`: el rango (1..50) vive en el Zod del server y
              // espejarlo acá serían dos verdades. Con el `clampBehavior: "blur"` por default de
              // Mantine, un `max={50}` además REESCRIBE en silencio el 100 que alguien tipeó — la
              // conventions lo prohíbe explícitamente y lo resolvió igual en el NÚMERO del checkout.
              // `allowDecimal={false}` sí se queda: no espeja un rango, impide tipear un imposible.
              hideControls
              allowDecimal={false}
              value={form.values.unidadesPorPack}
              onChange={(v) =>
                form.setFieldValue(
                  "unidadesPorPack",
                  typeof v === "number" ? v : 1,
                )
              }
            />
          )}

          {!esEdicion && (
            <>
              <Select
                label="¿De dónde salen los archivos?"
                description={
                  OPCIONES_ORIGEN.find((o) => o.value === form.values.origen)
                    ?.description
                }
                data={OPCIONES_ORIGEN.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                allowDeselect={false}
                value={form.values.origen}
                onChange={(v) => {
                  if (v === "propios" || v === "otroProducto") {
                    form.setFieldValue("origen", v);
                  }
                }}
              />

              {esPack ? (
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Producto del que salen"
                    placeholder={
                      fuentes.length === 0
                        ? "Todavía no tienes productos con archivos"
                        : "Elige un producto"
                    }
                    description={
                      fuentes.length === 0
                        ? "Primero crea un producto (o una colección) y súbele sus archivos."
                        : undefined
                    }
                    disabled={fuentes.length === 0}
                    data={fuentes.map((f) => ({
                      value: f.id,
                      label:
                        f.modalidad === "SOBRE"
                          ? `${f.titulo} (colección)`
                          : f.titulo,
                    }))}
                    searchable
                    value={form.values.fuenteId}
                    onChange={(v) => form.setFieldValue("fuenteId", v)}
                  />
                  <NumberInput
                    label="¿Cuántas entrega?"
                    description={
                      fuenteElegida?.modalidad === "SOBRE"
                        ? "Se eligen al azar de la colección, sin repetir."
                        : undefined
                    }
                    // Ver el gemelo de la edición: el rango es del server, acá solo `hideControls`.
                    hideControls
                    allowDecimal={false}
                    value={form.values.unidadesPorPack}
                    onChange={(v) =>
                      form.setFieldValue(
                        "unidadesPorPack",
                        typeof v === "number" ? v : 1,
                      )
                    }
                  />
                </div>
              ) : (
                <Select
                  label="¿Qué entrega?"
                  description={
                    OPCIONES_MODALIDAD.find(
                      (o) => o.value === form.values.modalidad,
                    )?.description
                  }
                  data={OPCIONES_MODALIDAD.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                  allowDeselect={false}
                  value={form.values.modalidad}
                  onChange={(v) => {
                    if (v === "ESTANDAR" || v === "SOBRE") {
                      form.setFieldValue("modalidad", v);
                    }
                  }}
                />
              )}
            </>
          )}

          <TextInput
            label="Título"
            placeholder="Ej. Cómo enriquecer a tu idol favorito"
            {...form.getInputProps("titulo")}
          />

          <Textarea
            label="Descripción"
            placeholder="Un par de líneas que enganchen a tu lectora."
            minRows={3}
            autosize
            {...form.getInputProps("descripcion")}
          />

          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label="Precio (CLP)"
              // En una COLECCIÓN este número no se cobra nunca: la colección no se vende suelta, se
              // vende a través de los packs que la usan, y cada pack tiene SU precio (E15/V-I5). Sin
              // este aviso el Organizador llena el campo creyendo que fija un precio de venta.
              // En un PACK, en cambio, este número ES lo que se cobra — un número que tipea y listo.
              description={
                esSobre
                  ? "Esta colección no se vende suelta: lo que se cobra es el precio de cada pack que la use."
                  : undefined
              }
              leftSection="$"
              inputMode="numeric"
              classNames={{ input: "tabular-nums" }}
              {...form.getInputProps("precio")}
            />
            {esEdicion && (
              <Select
                label="Estado"
                data={[
                  { value: "activo", label: "A la venta" },
                  { value: "borrador", label: "Borrador" },
                ]}
                allowDeselect={false}
                value={form.values.activo ? "activo" : "borrador"}
                onChange={(v) => form.setFieldValue("activo", v === "activo")}
              />
            )}
          </div>

          <div>
            <Text size="sm" fw={500} mb={4}>
              Portada (imagen, opcional)
            </Text>
            <Group gap="md" align="flex-start" wrap="nowrap">
              <VistaPreviaAsset url={producto?.portadaUrl ?? null} />
              <FileInput
                className="flex-1"
                placeholder={
                  producto?.portadaUrl
                    ? "Reemplazar portada…"
                    : "Elegir imagen (PNG, JPG o WebP)"
                }
                description="La imagen que se ve en el catálogo. Sin portada se muestra un degradado con tu color."
                accept={ACCEPT_IMAGEN}
                clearable
                value={portadaFile}
                onChange={setPortadaFile}
                leftSection={<IconPhoto className="size-4" />}
              />
            </Group>
          </div>

          <Switch
            label="Participa en el sorteo"
            description="Si tu tienda tiene un sorteo activo, comprar este producto genera participaciones: un ticket por cada unidad comprada."
            {...form.getInputProps("participaEnSorteo", { type: "checkbox" })}
          />

          {/*
            El archivo se administra distinto según de dónde salga:
            - PACK: NO hay sección de subida. Sus archivos son los de la fuente (V-I1d), y el server
              rechaza presignar una subida contra un pack — ofrecer el control acá sería ofrecer algo
              que va a fallar.
            - UN ARCHIVO: un `FileInput`; subir uno nuevo REEMPLAZA al anterior.
            - COLECCIÓN: varios archivos que SUMAN. Necesita el `productId`, así que solo aparece en
              edición — al crear, la colección nace vacía y el Organizador la llena enseguida, que es
              también el orden en que el gate se lo va a pedir.
          */}
          {esPack ? (
            <Text size="sm" c="dimmed">
              Este producto no lleva archivos propios: entrega los del producto
              que elegiste.
            </Text>
          ) : esSobre ? (
            esEdicion ? (
              <PoolDelSobre producto={producto} />
            ) : (
              <Text size="sm" c="dimmed">
                Cuando guardes la colección vas a poder subirle sus archivos.
                Después creas los packs que la venden, cada uno como un producto
                más.
              </Text>
            )
          ) : (
          <FileInput
            label={esEdicion ? "Reemplazar archivo" : "Archivo del producto"}
            placeholder={
              esEdicion && producto.tieneArchivo
                ? "Elegir un archivo nuevo (opcional)"
                : "Elegir el archivo"
            }
            // El aviso de tipos + peso va ANTES de elegir (D7): el Organizador se entera del límite
            // mientras decide, no después de esperar una subida que iba a fallar.
            description={`${
              esEdicion
                ? producto.tieneArchivo
                  ? "El producto ya tiene su archivo. Sube uno nuevo solo si quieres reemplazarlo."
                  : "Este producto todavía no tiene archivo: súbelo para poder ponerlo a la venta."
                : "El archivo que la compradora descargará. Puedes agregarlo ahora o más tarde."
            } ${AVISO_ARCHIVO}`}
            accept={ACCEPT_ARCHIVO_PRODUCTO}
            clearable
            value={archivo}
            onChange={elegirArchivo}
            leftSection={<IconFileText className="size-4" />}
          />
          )}

          {esEdicion && !esSobre && !esPack && (
            <Badge
              variant="light"
              // Tokens semánticos del theme, no colores crudos (design.md §9): "pendiente" es ámbar
              // y NUNCA rojo — que un producto no tenga archivo todavía no es un error.
              color={producto.tieneArchivo || archivo ? "exito" : "pendiente"}
              leftSection={<IconUpload className="size-3" />}
              styles={{ root: { width: "fit-content" }, label: { textTransform: "none" } }}
            >
              {archivo
                ? `Archivo nuevo listo para subir (${formatearPeso(archivo.size)})`
                : producto.tieneArchivo
                  ? "Archivo subido"
                  : "Archivo pendiente"}
            </Badge>
          )}
        </div>

        <Group justify="flex-end" mt="lg" gap="sm">
          <Button
            variant="default"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={enviando}>
            {esEdicion ? "Guardar cambios" : "Agregar producto"}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

function FilasSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Table.Tr key={i}>
          <Table.Td className="pl-6">
            <Group gap="sm" wrap="nowrap">
              <Skeleton height={40} width={40} radius="md" />
              <div className="space-y-1.5">
                <Skeleton height={16} width={160} />
                <Skeleton height={12} width={224} />
              </div>
            </Group>
          </Table.Td>
          <Table.Td className="text-right">
            <Skeleton height={16} width={64} className="ml-auto" />
          </Table.Td>
          <Table.Td>
            <Skeleton height={20} width={80} />
          </Table.Td>
          <Table.Td className="pr-6" />
        </Table.Tr>
      ))}
    </>
  );
}

export default function ProductosPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Producto | null>(null);
  const productos = api.panel.listarProductos.useQuery(undefined, {
    retry: false,
  });

  function openNew() {
    setEditTarget(null);
    setFormOpen(true);
  }
  function openEdit(producto: Producto) {
    setEditTarget(producto);
    setFormOpen(true);
  }

  const lista = productos.data ?? [];

  return (
    <AdminLayout
      title="Productos"
      description="Agrega, edita y administra los productos de tu catálogo."
      actions={
        <Button onClick={openNew} leftSection={<IconPlus className="size-4" />}>
          <span className="hidden sm:inline">Agregar producto</span>
        </Button>
      }
    >
      <PanelCard padding={0}>
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="pl-6">Producto</Table.Th>
                <Table.Th className="text-right">Precio</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th className="pr-6 text-right">Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {productos.isLoading ? (
                <FilasSkeleton />
              ) : productos.isError ? (
                <Table.Tr>
                  <Table.Td colSpan={4} className="py-12 text-center">
                    <Text size="sm" c="red">
                      No pudimos cargar tus productos.
                    </Text>
                    <Button
                      variant="default"
                      size="xs"
                      mt="sm"
                      onClick={() => void productos.refetch()}
                    >
                      Reintentar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ) : lista.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4} className="py-12 text-center" c="dimmed">
                    Todavía no tienes productos. Agrega el primero con el botón
                    de arriba.
                  </Table.Td>
                </Table.Tr>
              ) : (
                lista.map((producto) => (
                  <Table.Tr key={producto.id}>
                    <Table.Td className="pl-6">
                      <Group gap="sm" wrap="nowrap">
                        <Avatar radius="md" color="gray" size={40}>
                          {iniciales(producto.titulo)}
                        </Avatar>
                        <div className="min-w-0">
                          <Group gap={6} wrap="nowrap">
                            <Text fw={500} truncate>
                              {producto.titulo}
                            </Text>
                            {/*
                              El badge dice el ROL real del producto (E16), que bajo v2 son tres:
                              colección (contenedor que no se vende), pack (entrega N de otro) y
                              producto normal (sin badge). `gray` a propósito, NO `amarillo`:
                              design.md §2 reserva el amarillo para «el momento de triunfo» (el
                              número ganador, el plumón, la barra de hoy del chart), y un rol de
                              producto no es eso. La distinción visual la cargan los íconos.
                            */}
                            {producto.modalidad === "SOBRE" && (
                              <Badge
                                variant="light"
                                color="gray"
                                size="xs"
                                leftSection={<IconDice3 className="size-3" />}
                                styles={{
                                  root: { flexShrink: 0 },
                                  label: { textTransform: "none" },
                                }}
                              >
                                Colección
                              </Badge>
                            )}
                            {producto.fuente && (
                              <Badge
                                variant="light"
                                color="gray"
                                size="xs"
                                leftSection={<IconStack2 className="size-3" />}
                                styles={{
                                  root: { flexShrink: 0 },
                                  label: { textTransform: "none" },
                                }}
                              >
                                {producto.unidadesPorPack} de{" "}
                                {producto.fuente.titulo}
                              </Badge>
                            )}
                            {producto.participaEnSorteo && (
                              <Badge
                                variant="light"
                                size="xs"
                                leftSection={<IconGift className="size-3" />}
                                styles={{
                                  root: { flexShrink: 0 },
                                  label: { textTransform: "none" },
                                }}
                              >
                                Sorteo
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed" className="max-w-[280px]" truncate>
                            {producto.descripcion}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums">
                      {/*
                        Una COLECCIÓN no se vende suelta (E15): su `Product.precio` no se cobra en
                        ninguna parte, así que mostrarlo sería mostrar un precio que nadie paga. Lo
                        que se cobra es el precio de cada pack, y cada pack es su propia fila de esta
                        misma tabla — con su precio en esta misma columna.
                      */}
                      {producto.modalidad === "SOBRE" ? (
                        <Text size="xs" c="dimmed">
                          {producto.packsActivos > 0
                            ? `${producto.packsActivos} ${producto.packsActivos === 1 ? "pack la vende" : "packs la venden"}`
                            : "Sin packs"}
                        </Text>
                      ) : (
                        clp(producto.precio)
                      )}
                    </Table.Td>
                    <Table.Td>
                      {/*
                        Una COLECCIÓN no se vende, así que «A la venta»/«Borrador» no significan nada
                        para ella (E16): lo único que importa es si ya tiene con qué cumplirle a los
                        packs que la usan. Y «Sin archivo» aparece solo si el pool está DE VERDAD
                        vacío — antes decía eso también con el pool lleno pero sin opciones de pack,
                        que era el badge contradictorio que reportó el feature-tester.
                      */}
                      {producto.modalidad === "SOBRE" ? (
                        <Badge
                          variant="outline"
                          color={producto.tieneArchivo ? "exito" : "pendiente"}
                          styles={{
                            label: { fontWeight: 400, textTransform: "none" },
                          }}
                        >
                          {producto.tieneArchivo
                            ? `${producto.archivos.length} ${producto.archivos.length === 1 ? "archivo" : "archivos"}`
                            : "Sin archivo"}
                        </Badge>
                      ) : producto.activo ? (
                        <Badge
                          variant="light"
                          styles={{ label: { textTransform: "none" } }}
                        >
                          A la venta
                        </Badge>
                      ) : !producto.tieneArchivo ? (
                        <Badge
                          variant="outline"
                          // `pendiente` (ámbar), no `orange` crudo: design.md §9 reserva el rojo
                          // para errores y prohíbe pintar "pendiente" como si lo fuera.
                          color="pendiente"
                          styles={{ label: { fontWeight: 400, textTransform: "none" } }}
                        >
                          Sin archivo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          color="gray"
                          styles={{ label: { fontWeight: 400, textTransform: "none" } }}
                        >
                          Borrador
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td className="pr-6">
                      <Group justify="flex-end" gap={4}>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label="Editar"
                          onClick={() => openEdit(producto)}
                        >
                          <IconPencil className="size-4" />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </PanelCard>

      <ProductoFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        producto={editTarget}
        productos={lista}
      />
    </AdminLayout>
  );
}
