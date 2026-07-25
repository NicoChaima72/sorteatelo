import {
  ActionIcon,
  Box,
  Card,
  Group,
  Menu,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";

import { FormProps } from "~/components/editor/form-props";
import {
  actualizarHojaProps,
  agregarHoja,
  cambiarReparto,
  crearHojaFila,
  moverHoja,
  quitarHoja,
} from "~/lib/pagebuilder/fila-edicion";
import {
  HOJAS_FILA,
  REPARTOS_FILA,
  WIDGET_META,
  WIDGET_REGISTRY,
  type FilaProps,
  type HojaFilaTipo,
  type RepartoFila,
} from "~/lib/pagebuilder/widgets";

type Obj = Record<string, unknown>;

/** Etiqueta legible de cada reparto (para el Select). */
const ETIQUETA_REPARTO: Record<RepartoFila, string> = {
  "50_50": "Dos iguales (50 / 50)",
  "66_33": "Ancha + angosta (66 / 33)",
  "33_66": "Angosta + ancha (33 / 66)",
  "33_33_33": "Tres iguales (33 / 33 / 33)",
};

/**
 * Editor de una `fila` (Tanda 3 F09/D15). Reemplaza al form-generator genérico para el nodo `fila` (cuyo
 * `columnas` es un array de arrays de nodos que el generator no sabe editar). Muestra la fila como una
 * SECCIÓN con sub-lista por columna: agregar hoja (galería FILTRADA por la whitelist `HOJAS_FILA` — nunca
 * ofrece `fila`, I-U4), quitar, reordenar (↑↓), y seleccionar una hoja para editar sus props con el MISMO
 * `FormProps`. TODO emite `update_section_props` del nodo fila COMPLETO (D15): `onChange` sube el `props`
 * nuevo al `PanelEdicion`, que lo auto-guarda; el server re-valida el documento entero (I3). Superficie
 * pura (I-I): cero lógica de dominio; los ids nuevos salen de `crypto.randomUUID()`.
 */
export function PanelFila({
  slug,
  valor,
  onChange,
}: {
  slug: string;
  valor: Obj;
  onChange: (props: Obj) => void;
}) {
  const props = valor as unknown as FilaProps;
  const columnas = Array.isArray(props.columnas) ? props.columnas : [];
  const [sel, setSel] = useState<{ col: number; idx: number } | null>(null);

  const emitir = (siguiente: FilaProps) => onChange(siguiente as unknown as Obj);

  // ── Editor de UNA hoja seleccionada (sus props, con el form-generator) ──
  if (sel) {
    const hoja = columnas[sel.col]?.[sel.idx];
    if (!hoja) {
      setSel(null);
      return null;
    }
    const propsSchema = WIDGET_REGISTRY[hoja.tipo].propsSchema;
    return (
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => setSel(null)} aria-label="Volver a la fila">
            <IconArrowLeft className="size-4" />
          </ActionIcon>
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{WIDGET_META[hoja.tipo].titulo}</Text>
            <Text size="xs" c="dimmed" truncate>
              Columna {sel.col + 1} · elemento {sel.idx + 1}
            </Text>
          </div>
        </Group>
        <FormProps
          propsSchema={propsSchema}
          valor={hoja.props as Obj}
          onChange={(p) => emitir(actualizarHojaProps(props, sel.col, sel.idx, p))}
          slug={slug}
        />
      </Stack>
    );
  }

  // ── Vista de la fila: reparto + columnas ──
  return (
    <Stack gap="md">
      <Select
        label="Distribución de columnas"
        data={REPARTOS_FILA.map((r) => ({ value: r, label: ETIQUETA_REPARTO[r] }))}
        value={props.reparto ?? "50_50"}
        onChange={(v) => v && emitir(cambiarReparto(props, v as RepartoFila))}
        allowDeselect={false}
      />

      {columnas.map((columna, col) => (
        <Box
          key={col}
          p="xs"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-sm)",
          }}
        >
          <Text size="sm" fw={600} mb={6}>
            Columna {col + 1}
          </Text>
          <Stack gap={6}>
            {columna.length === 0 && (
              <Text size="xs" c="dimmed">
                Vacía. Agrega un elemento abajo.
              </Text>
            )}
            {columna.map((hoja, idx) => (
              <Card
                key={hoja.id}
                withBorder
                padding="xs"
                radius="sm"
                style={{ cursor: "pointer" }}
                onClick={() => setSel({ col, idx })}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm" truncate>
                    {WIDGET_META[hoja.tipo].titulo}
                  </Text>
                  <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label="Subir elemento"
                      disabled={idx === 0}
                      onClick={() => emitir(moverHoja(props, col, idx, -1))}
                    >
                      <IconChevronUp className="size-4" />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label="Bajar elemento"
                      disabled={idx === columna.length - 1}
                      onClick={() => emitir(moverHoja(props, col, idx, 1))}
                    >
                      <IconChevronDown className="size-4" />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label="Quitar elemento"
                      onClick={() => emitir(quitarHoja(props, col, idx))}
                    >
                      <IconTrash className="size-4" />
                    </ActionIcon>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>

          {/* Galería FILTRADA por la whitelist (nunca ofrece `fila`, I-U4). */}
          <Menu shadow="md" width={220} position="bottom-start">
            <Menu.Target>
              <ActionIcon variant="light" size="sm" mt={8} aria-label="Agregar elemento a la columna">
                <IconPlus className="size-4" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Agregar a la columna {col + 1}</Menu.Label>
              {HOJAS_FILA.map((tipo: HojaFilaTipo) => (
                <Menu.Item
                  key={tipo}
                  onClick={() =>
                    emitir(agregarHoja(props, col, crearHojaFila(tipo, crypto.randomUUID())))
                  }
                >
                  {WIDGET_META[tipo].titulo}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Box>
      ))}
    </Stack>
  );
}
