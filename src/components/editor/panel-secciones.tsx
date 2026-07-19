import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconHistory,
  IconPaint,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { TIPOS_SECCION, WIDGET_META } from "~/lib/pagebuilder/widgets";

/**
 * Panel de SECCIONES del editor (catálogo-v2 F09): lista ordenada de las secciones del Borrador con
 * reordenar (↑↓ vía `move_section`), eliminar (`remove_section`) y agregar desde un catálogo visual
 * (`add_section` con los defaultProps del registro). Click en una sección ⇒ scroll de la preview +
 * abre su panel de edición (F10). Cero lógica de dominio: solo arma `MutacionPagina` y las emite (I-I).
 */
export function PanelSecciones({
  documento,
  seleccion,
  onSeleccionar,
  onAplicar,
  onEditarTema,
  onVerHistorial,
}: {
  documento: PageDocument;
  seleccion: string | null;
  onSeleccionar: (id: string) => void;
  onAplicar: (mutacion: MutacionPagina) => void;
  onEditarTema: () => void;
  onVerHistorial: () => void;
}) {
  const [catalogo, setCatalogo] = useState(false);
  const secciones = documento.secciones;

  return (
    <Stack gap="sm" p="md">
      <Group gap="xs" grow>
        <Button size="xs" variant="default" leftSection={<IconPaint className="size-4" />} onClick={onEditarTema}>
          Tema
        </Button>
        <Button size="xs" variant="default" leftSection={<IconHistory className="size-4" />} onClick={onVerHistorial}>
          Historial
        </Button>
      </Group>
      <Group justify="space-between">
        <Text fw={600}>Secciones</Text>
        <Button size="xs" leftSection={<IconPlus className="size-4" />} onClick={() => setCatalogo(true)}>
          Agregar
        </Button>
      </Group>

      {secciones.length === 0 ? (
        <Text size="sm" c="dimmed">
          Tu página no tiene secciones todavía. Agrega la primera para empezar.
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

      {/* Catálogo visual de widgets: agregar una sección con sus defaultProps (add_section). */}
      <Modal opened={catalogo} onClose={() => setCatalogo(false)} title="Agregar una sección" size="lg" centered>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {TIPOS_SECCION.map((tipo) => {
            const meta = WIDGET_META[tipo];
            return (
              <Card
                key={tipo}
                withBorder
                padding="sm"
                radius="md"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  onAplicar({ accion: "add_section", tipo });
                  setCatalogo(false);
                }}
              >
                <Text size="sm" fw={600}>{meta.titulo}</Text>
                <Text size="xs" c="dimmed">{meta.descripcion}</Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </Modal>
    </Stack>
  );
}
