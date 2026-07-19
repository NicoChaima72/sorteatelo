import { type z } from "zod";

/**
 * Introspección PURA del registro Zod para el generador de formularios del editor (catálogo-v2 F10/D8).
 * Cliente+server safe (sin React): clasifica cada campo de un `propsSchema` en un CONTROL de UI, y el
 * componente (`form-props.tsx`) solo RENDERIZA el descriptor — la decisión vive acá. Extraer esta capa
 * la hace testeable en node (jsdom no instalado): el test generativo recorre TODO el registro y verifica
 * que cada campo mapea a un control soportado (o a un override documentado), sin renderizar componentes.
 *
 * La fuente de verdad sigue siendo el schema (I3): el form solo produce props laxas que el use case
 * REVALIDA server-side. Este módulo NO valida; solo describe la FORMA para elegir el control de edición.
 */

/**
 * Forma PARCIAL del `_def` interno de Zod que leemos para introspeccionar. NO es API pública de Zod
 * (por eso se aísla acá, en un solo módulo tipado, en vez de esparcir `any` por el form). Cada campo es
 * opcional: distintos tipos de schema pueblan distintas claves.
 */
interface ZodDefInterno {
  typeName?: string;
  innerType?: z.ZodTypeAny; // ZodOptional/ZodNullable/ZodDefault
  type?: z.ZodTypeAny; // ZodArray (tipo del elemento)
  values?: readonly string[]; // ZodEnum
  options?: readonly z.ZodTypeAny[]; // ZodUnion
  value?: unknown; // ZodLiteral
  checks?: { kind: string; value?: number }[]; // ZodString
  shape?: () => Record<string, z.ZodTypeAny>; // ZodObject
}

/** Lee el `_def` interno de un schema como una forma tipada (o `{}` si no hay). Único punto de acceso. */
function def(s: z.ZodTypeAny | undefined): ZodDefInterno {
  return (s as { _def?: ZodDefInterno } | undefined)?._def ?? {};
}

/** Desenvuelve Optional/Default/Nullable y reporta el tipo base + si el campo es opcional. */
export function pelar(schema: z.ZodTypeAny): { base: z.ZodTypeAny; opcional: boolean } {
  let s = schema;
  let opcional = false;
  for (;;) {
    const t = def(s).typeName;
    const inner = def(s).innerType;
    if (t === "ZodOptional" || t === "ZodNullable") {
      opcional = true;
      if (!inner) break;
      s = inner;
    } else if (t === "ZodDefault") {
      if (!inner) break;
      s = inner;
    } else {
      break;
    }
  }
  return { base: s, opcional };
}

/** `typeName` del `_def` (p.ej. "ZodString", "ZodEnum"). "" si no se puede leer. */
export function nombreTipo(s: z.ZodTypeAny): string {
  return def(s).typeName ?? "";
}

/** Máximo declarado de un ZodString (para elegir texto vs textarea y detectar `urlPublica`). */
export function maxDeString(s: z.ZodTypeAny): { max: number | null; esUrl: boolean } {
  const checks = def(s).checks ?? [];
  const max = checks.find((c) => c.kind === "max")?.value ?? null;
  const esUrl = checks.some((c) => c.kind === "url");
  return { max, esUrl };
}

/**
 * Descriptor del control de UI de un campo. Discriminado por `control`; el renderer switchea sobre él.
 * `no-soportado` = la introspección no alcanza (p.ej. discriminated-union de bloques): el campo cae a un
 * aviso "editar por el asistente" y necesita un override manual por widget (documentado en el test).
 */
export type ControlCampo =
  | { control: "texto"; max: number | null }
  | { control: "textoLargo"; max: number }
  | { control: "imagen" }
  | { control: "opciones"; opciones: string[] }
  | { control: "opcionesLiteral"; opciones: string[]; numerico: boolean }
  | { control: "booleano" }
  | { control: "numero" }
  | { control: "lista"; shape: Record<string, z.ZodTypeAny> }
  | { control: "no-soportado" };

/**
 * Clasifica un campo (por su schema) en el control de UI que lo edita. Espeja EXACTAMENTE las ramas del
 * `<Campo>` de `form-props.tsx` — es su única fuente de decisión. Heurísticas:
 *  - string `.url()` con max grande (≥2048, patrón de `urlPublica`) ⇒ picker de imagen (PageAsset).
 *  - string con max > 160 ⇒ textarea; el resto ⇒ input de una línea.
 *  - enum ⇒ select; unión de SOLO literales (p.ej. columnas 2|3) ⇒ select de esos literales.
 *  - boolean ⇒ switch; number ⇒ input numérico; array de objetos ⇒ repeater (con el shape del ítem).
 */
export function clasificarCampo(schema: z.ZodTypeAny): ControlCampo {
  const { base } = pelar(schema);
  const tipo = nombreTipo(base);

  if (tipo === "ZodString") {
    const { max, esUrl } = maxDeString(base);
    if (esUrl && (max ?? 0) >= 2048) return { control: "imagen" };
    if (max !== null && max > 160) return { control: "textoLargo", max };
    return { control: "texto", max };
  }

  if (tipo === "ZodEnum") {
    return { control: "opciones", opciones: [...(def(base).values ?? [])] };
  }

  if (tipo === "ZodBoolean") return { control: "booleano" };
  if (tipo === "ZodNumber") return { control: "numero" };

  if (tipo === "ZodUnion") {
    const opciones = def(base).options ?? [];
    const literales = opciones
      .map((o) => def(o).value)
      .filter((v): v is string | number => v !== undefined);
    if (literales.length === opciones.length && literales.length > 0) {
      return {
        control: "opcionesLiteral",
        opciones: literales.map((v) => String(v)),
        numerico: typeof literales[0] === "number",
      };
    }
  }

  if (tipo === "ZodArray") {
    const { base: elemBase } = pelar(def(base).type ?? base);
    if (nombreTipo(elemBase) === "ZodObject") {
      const shape = def(elemBase).shape?.() ?? {};
      return { control: "lista", shape };
    }
  }

  return { control: "no-soportado" };
}

/**
 * Lista los campos editables de un `propsSchema` de widget (o el shape de un ítem de repeater). Devuelve
 * `null` si el schema no es un objeto (p.ej. un widget con props no-objeto ⇒ se edita por el asistente).
 */
export function camposDeSchema(
  propsSchema: z.ZodTypeAny,
): { campo: string; schema: z.ZodTypeAny }[] | null {
  const { base } = pelar(propsSchema);
  if (nombreTipo(base) !== "ZodObject") return null;
  const shape = def(base).shape?.() ?? {};
  return Object.entries(shape).map(([campo, schema]) => ({ campo, schema }));
}
