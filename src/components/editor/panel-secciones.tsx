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
  IconCopy,
  IconGripVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { WIDGET_META } from "~/lib/pagebuilder/widgets";

/**
 * Panel de SECCIONES del editor (catálogo-v2 F09; dock en F11): lista ordenada de las secciones del
 * Borrador con reordenar, eliminar (`remove_section`) y un botón que abre la WidgetGallery (panel
 * hermano "Agregar"). Click en una sección ⇒ scroll de la preview + abre su panel de edición. Cero
 * lógica de dominio: solo arma `MutacionPagina` y las emite (I-I).
 *
 * Reordenar (builder-tanda-1 F11/D15): drag & drop NATIVO (HTML5) SOLO en esta lista — al soltar emite
 * UN `move_section` con la posición final. Los botones ↑↓ se CONSERVAN como fallback accesible (teclado/
 * touch). Sin librería nueva: la lista es corta, vertical y de un solo contenedor ⇒ el DnD nativo basta;
 * `@dnd-kit` quedaría justificado solo si hiciera falta a11y de teclado avanzada (no es el caso: ↑↓ ya la
 * cubren). El canvas NUNCA es drag-libre (D9 del plan v2).
 */

/**
 * Posición destino de un reordenamiento por arrastre (PURO). `move_section` quita el nodo y lo inserta
 * en `aPosicion` del array YA sin el nodo; para "soltar sobre el índice visual `hasta`" eso coincide con
 * `aPosicion = hasta` en AMBAS direcciones. Soltar sobre sí mismo (o índice inválido) ⇒ `null` (no-op).
 */
export function destinoReordenamiento(
  desde: number,
  hasta: number,
  total: number,
): number | null {
  if (desde === hasta) return null;
  if (hasta < 0 || hasta >= total || desde < 0 || desde >= total) return null;
  return hasta;
}

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
  const [arrastrado, setArrastrado] = useState<number | null>(null);
  const [encima, setEncima] = useState<number | null>(null);

  const soltarEn = (hasta: number) => {
    if (arrastrado === null) return;
    const destino = destinoReordenamiento(arrastrado, hasta, secciones.length);
    const id = secciones[arrastrado]?.id;
    if (destino !== null && id) onAplicar({ accion: "move_section", id, aPosicion: destino });
    setArrastrado(null);
    setEncima(null);
  };

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
            const esObjetivo = encima === i && arrastrado !== null && arrastrado !== i;
            return (
              <Card
                key={s.id}
                withBorder
                padding="xs"
                radius="md"
                draggable
                onDragStart={(e) => {
                  setArrastrado(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault(); // permite el drop
                  e.dataTransfer.dropEffect = "move";
                  if (encima !== i) setEncima(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  soltarEn(i);
                }}
                onDragEnd={() => {
                  setArrastrado(null);
                  setEncima(null);
                }}
                style={{
                  cursor: "pointer",
                  opacity: arrastrado === i ? 0.5 : 1,
                  borderColor: esObjetivo
                    ? "var(--mantine-primary-color-filled)"
                    : activa
                      ? "var(--mantine-primary-color-filled)"
                      : undefined,
                  borderTopWidth: esObjetivo ? 2 : undefined,
                }}
                onClick={() => onSeleccionar(s.id)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <IconGripVertical
                      className="size-4 shrink-0"
                      style={{ color: "var(--mantine-color-dimmed)", cursor: "grab" }}
                      aria-hidden
                    />
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>{meta.titulo}</Text>
                      <Text size="xs" c="dimmed" truncate>{meta.descripcion}</Text>
                    </Box>
                  </Group>
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
                    <Tooltip label="Duplicar">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="Duplicar sección"
                        onClick={() => onAplicar({ accion: "duplicate_section", id: s.id })}
                      >
                        <IconCopy className="size-4" />
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
