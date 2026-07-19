import {
  ActionIcon,
  Box,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { type ChangeEvent } from "react";
import { type z } from "zod";

import { PickerImagen } from "~/components/editor/picker-imagen";
import { camposDeSchema, clasificarCampo } from "~/lib/editor/introspeccion";

/**
 * Generador de formularios desde el REGISTRO Zod (catálogo-v2 F10/D8). La INTROSPECCIÓN (qué control
 * corresponde a cada campo) vive en `~/lib/editor/introspeccion` (pura, testeable en node); acá solo se
 * RENDERIZA el descriptor: string→TextInput/Textarea por límite, enum→Select, boolean→Switch,
 * int→NumberInput, unión de literales→Select, array de objetos→repeater, `urlPublica`→picker de imagen.
 *
 * La fuente de verdad SIGUE siendo el schema (I3): el form produce un objeto laxo; si algo queda mal, el
 * `update_section_props` REVALIDA el documento completo server-side y devuelve INVALID (el editor lo
 * muestra) — el form NO es el borde de validación. Cuando la introspección no alcanza (p.ej.
 * discriminated-union de bloques de `texto_rico`), el campo cae a un aviso honesto (override por widget).
 */

type Valor = unknown;
type Obj = Record<string, Valor>;

/** Etiqueta legible desde el nombre de campo (`ctaTexto` ⇒ "Cta texto"). */
function etiqueta(campo: string): string {
  const s = campo.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Un campo del form (recursivo para arrays de objetos). Switchea sobre el descriptor de introspección. */
function Campo({
  campo,
  schema,
  valor,
  onChange,
  slug,
}: {
  campo: string;
  schema: z.ZodTypeAny;
  valor: Valor;
  onChange: (v: Valor) => void;
  slug: string;
}) {
  const label = etiqueta(campo);
  const c = clasificarCampo(schema);

  if (c.control === "imagen") {
    // `urlPublica` (u otra url larga) ⇒ picker de imagen (PageAsset, F08).
    return (
      <PickerImagen
        slug={slug}
        label={label}
        valor={typeof valor === "string" ? valor : ""}
        onChange={(url) => onChange(url || undefined)}
      />
    );
  }

  if (c.control === "texto" || c.control === "textoLargo") {
    const comun = {
      label,
      value: typeof valor === "string" ? valor : "",
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange(e.currentTarget.value || undefined),
    };
    return c.control === "textoLargo" ? (
      <Textarea {...comun} autosize minRows={2} maxRows={8} />
    ) : (
      <TextInput {...comun} />
    );
  }

  if (c.control === "opciones") {
    return (
      <Select
        label={label}
        data={c.opciones.map((o) => ({ value: o, label: o }))}
        value={typeof valor === "string" ? valor : null}
        onChange={(v) => onChange(v ?? undefined)}
        clearable
      />
    );
  }

  if (c.control === "opcionesLiteral") {
    return (
      <Select
        label={label}
        data={c.opciones.map((o) => ({ value: o, label: o }))}
        value={valor !== undefined ? String(valor as string | number) : null}
        onChange={(v) => onChange(v === null ? undefined : c.numerico ? Number(v) : v)}
      />
    );
  }

  if (c.control === "booleano") {
    return (
      <Switch
        label={label}
        checked={Boolean(valor)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  }

  if (c.control === "numero") {
    return (
      <NumberInput
        label={label}
        value={typeof valor === "number" ? valor : ""}
        onChange={(v) => onChange(v === "" ? undefined : Number(v))}
      />
    );
  }

  if (c.control === "lista") {
    return (
      <Repeater
        label={label}
        shape={c.shape}
        valor={Array.isArray(valor) ? (valor as Obj[]) : []}
        onChange={onChange}
        slug={slug}
      />
    );
  }

  // Tipo no soportado por la introspección (p.ej. discriminated-union de bloques) — aviso honesto.
  return (
    <Box>
      <Text size="sm" fw={500}>{label}</Text>
      <Text size="xs" c="dimmed">
        Este campo se edita por el asistente (chat) por ahora.
      </Text>
    </Box>
  );
}

/** Repeater de un array de objetos: add/remove + los campos de cada ítem (del `shape` introspectado). */
function Repeater({
  label,
  shape,
  valor,
  onChange,
  slug,
}: {
  label: string;
  shape: Record<string, z.ZodTypeAny>;
  valor: Obj[];
  onChange: (v: Obj[]) => void;
  slug: string;
}) {
  const setItem = (i: number, item: Obj) => {
    const copia = [...valor];
    copia[i] = item;
    onChange(copia);
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{label}</Text>
      {valor.map((item, i) => (
        <Box key={i} p="xs" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }}>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">#{i + 1}</Text>
            <ActionIcon variant="subtle" color="red" size="sm" aria-label="Quitar" onClick={() => onChange(valor.filter((_, j) => j !== i))}>
              <IconTrash className="size-4" />
            </ActionIcon>
          </Group>
          <Stack gap="xs">
            {Object.entries(shape).map(([campo, sub]) => (
              <Campo
                key={campo}
                campo={campo}
                schema={sub}
                valor={item[campo]}
                onChange={(v) => setItem(i, { ...item, [campo]: v })}
                slug={slug}
              />
            ))}
          </Stack>
        </Box>
      ))}
      <Button
        size="xs"
        variant="light"
        leftSection={<IconPlus className="size-4" />}
        onClick={() => onChange([...valor, {}])}
      >
        Agregar
      </Button>
    </Stack>
  );
}

/**
 * Formulario de props de un widget: recorre los campos del `propsSchema` (introspección) y produce un
 * objeto de props. Controlado desde el padre (`valor`/`onChange`); el submit lo maneja el panel
 * (update_section_props). Si el schema no es un objeto ⇒ aviso (se edita por el asistente).
 */
export function FormProps({
  propsSchema,
  valor,
  onChange,
  slug,
}: {
  propsSchema: z.ZodTypeAny;
  valor: Obj;
  onChange: (v: Obj) => void;
  slug: string;
}) {
  const campos = camposDeSchema(propsSchema);
  if (!campos) {
    return <Text size="sm" c="dimmed">Este widget se edita por el asistente por ahora.</Text>;
  }
  return (
    <Stack gap="sm">
      {campos.map(({ campo, schema }) => (
        <Campo
          key={campo}
          campo={campo}
          schema={schema}
          valor={valor[campo]}
          onChange={(v) => onChange({ ...valor, [campo]: v })}
          slug={slug}
        />
      ))}
    </Stack>
  );
}
