import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { WIDGET_META } from "~/lib/pagebuilder/widgets";

/**
 * Panel de SECCIONES del editor (catálogo-v2 F09; dock en F11): lista ordenada de las secciones del
 * Borrador con reordenar (↑↓ vía `move_section`), eliminar (`remove_section`) y un botón que abre la
 * WidgetGallery (panel hermano "Agregar", F11 — reemplaza el modal). Click en una sección ⇒ scroll de
 * la preview + abre su panel de edición (F10). Tema e Historial ahora son paneles del dock (rail). Cero
 * lógica de dominio: solo arma `MutacionPagina` y las emite (I-I).
 */
export function PanelSecciones({
  documento,
  seleccion,
  onSeleccionar,
  onAplicar,
  onAbrirGaleria,
}: {
  documento: PageDocument;
  seleccion: string | null;
  onSeleccionar: (id: string) => void;
  onAplicar: (mutacion: MutacionPagina) => void;
  /** Abre el panel "Agregar" (WidgetGallery) del dock. */
  onAbrirGaleria: () => void;
}) {
  const secciones = documento.secciones;

  return (
    <Stack gap="sm" p="md">
      <Group justify="space-between">
        <Text fw={600}>Secciones</Text>
        <Button size="xs" leftSection={<IconPlus className="size-4" />} onClick={onAbrirGaleria}>
          Agregar
        </Button>
      </Group>

      {secciones.length === 0 ? (
        <Text size="sm" c="dimmed">
          Tu página no tiene secciones todavía. Toca “Agregar” para empezar.
        </Text>
      ) : (
        <Stack gap={6}>
          {secciones.map((s, i) => {
            const meta = WIDGET_META[s.tipo];
            const activa = s.id === seleccion;
            return (
              <Card
                key={s.id}
                withBorder
                padding="xs"
                radius="md"
                style={{
                  cursor: "pointer",
                  borderColor: activa ? "var(--mantine-primary-color-filled)" : undefined,
                }}
                onClick={() => onSeleccionar(s.id)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>{meta.titulo}</Text>
                    <Text size="xs" c="dimmed" truncate>{meta.descripcion}</Text>
                  </Box>
                  <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                    <Tooltip label="Subir">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="Subir sección"
                        disabled={i === 0}
                        onClick={() => onAplicar({ accion: "move_section", id: s.id, aPosicion: i - 1 })}
                      >
                        <IconChevronUp className="size-4" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Bajar">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="Bajar sección"
                        disabled={i === secciones.length - 1}
                        onClick={() => onAplicar({ accion: "move_section", id: s.id, aPosicion: i + 1 })}
                      >
                        <IconChevronDown className="size-4" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Eliminar">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        aria-label="Eliminar sección"
                        onClick={() => onAplicar({ accion: "remove_section", id: s.id })}
                      >
                        <IconTrash className="size-4" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
