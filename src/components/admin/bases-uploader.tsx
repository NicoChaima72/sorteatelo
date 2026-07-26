import { Anchor, Badge, FileInput, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileText } from "@tabler/icons-react";
import { useState } from "react";

import {
  ACCEPT_BASES,
  useSubirBasesSorteo,
} from "~/components/admin/use-subir-bases";

/**
 * Uploader del **PDF de bases** de un sorteo YA creado (admin-bases-pdf F02, ADR-0008). Espeja el
 * modo "inmediato" del `AssetUploader` (sube apenas se elige el archivo: presigned PUT +
 * confirmación) con la vista previa cambiada: un PDF no se miniaturiza, así que el estado se muestra
 * como un badge «Bases cargadas» + un enlace para revisarlas, o el vacío honesto de que faltan.
 *
 * Para un sorteo que aún NO existe (form de creación) NO se usa este componente: la subida se
 * difiere a después de `crearSorteo`, porque la key es per-raffle y necesita el id (ver `sorteo.tsx`).
 */
export function BasesUploader({
  raffleId,
  urlActual,
  onSubido,
}: {
  raffleId: string;
  urlActual: string | null;
  /** Se llama tras subir OK (para invalidar la query que trae `urlActual`). */
  onSubido: () => void | Promise<void>;
}) {
  const { subir, subiendo } = useSubirBasesSorteo();
  const [file, setFile] = useState<File | null>(null);

  const onChange = async (elegido: File | null) => {
    setFile(elegido);
    if (!elegido) return;
    try {
      await subir(raffleId, elegido);
      notifications.show({ message: "Bases actualizadas.", color: "green" });
      await onSubido();
    } catch (e) {
      notifications.show({
        message: e instanceof Error ? e.message : "No se pudo subir el PDF de bases.",
        color: "red",
      });
    } finally {
      setFile(null);
    }
  };

  return (
    <Stack gap="xs">
      <FileInput
        label="Bases del sorteo (PDF)"
        description="Obligatorias para publicar tu tienda con el sorteo activo. La responsabilidad legal de su contenido es tuya."
        placeholder={urlActual ? "Reemplazar el PDF…" : "Elegir el archivo PDF"}
        accept={ACCEPT_BASES}
        clearable
        value={file}
        onChange={(f) => void onChange(f)}
        disabled={subiendo}
        leftSection={<IconFileText className="size-4" />}
      />
      <EstadoBases url={urlActual} />
    </Stack>
  );
}

/**
 * Estado de las bases: cargadas (con enlace para revisarlas) o faltantes. El color es FUNCIONAL, con
 * los tokens semánticos del theme (design.md §2): `exito` cuando están cargadas, `pendiente` cuando
 * faltan — porque faltar no es un error del Organizador, es un pendiente que bloquea publicar
 * (ADR-0008). Nunca `red`, reservado a error/destructivo. Espeja el badge de estado del PDF de
 * producto (`productos.tsx`), con los tokens del theme en vez de los colores crudos de Mantine.
 */
function EstadoBases({ url }: { url: string | null }) {
  if (!url) {
    return (
      <Group gap="xs" wrap="nowrap">
        <Badge
          variant="light"
          color="pendiente"
          leftSection={<IconFileText className="size-3" />}
          styles={{ root: { width: "fit-content" }, label: { textTransform: "none" } }}
        >
          Bases pendientes
        </Badge>
        <Text size="xs" c="dimmed">
          Te las pediremos antes de publicar.
        </Text>
      </Group>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Badge
        variant="light"
        color="exito"
        leftSection={<IconFileText className="size-3" />}
        styles={{ root: { width: "fit-content" }, label: { textTransform: "none" } }}
      >
        Bases cargadas
      </Badge>
      <Anchor href={url} target="_blank" rel="noreferrer" size="xs" c="dimmed">
        Ver el PDF
      </Anchor>
    </Group>
  );
}
