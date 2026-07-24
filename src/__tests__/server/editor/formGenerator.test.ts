import { describe, expect, it } from "vitest";

import { camposDeSchema, clasificarCampo } from "~/lib/editor/introspeccion";
import { WIDGET_META, WIDGET_REGISTRY, type WidgetTipo } from "~/lib/pagebuilder/widgets";

/**
 * Tests del GENERADOR DE FORMULARIOS del editor (catálogo-v2 F10/D8). El form se arma por introspección
 * pura del registro Zod (`~/lib/editor/introspeccion`); acá se verifica generativamente sobre TODO el
 * registro que (a) cada campo de cada widget mapea a un control soportado —salvo overrides documentados—
 * y (b) la metadata display (titulo/descripcion) existe para cada widget. El BORDE de validación sigue
 * siendo el use case (no el form): eso lo cubre `mutaciones.test.ts::page.mut.005`.
 */

const TIPOS = Object.keys(WIDGET_REGISTRY) as WidgetTipo[];

/**
 * Campos que la introspección NO alcanza a mapear a un control (⇒ "editar por el asistente"): cada uno
 * es un override CONSCIENTE con su razón. Un campo nuevo no listado que caiga acá HACE FALLAR el test —
 * la señal de que un widget nuevo necesita soporte de form o un override manual (nunca queda mudo).
 */
const OVERRIDES_CONOCIDOS = new Set<string>([
  // `texto_rico.bloques`: discriminated-union de bloques (subtitulo/parrafo/cita/lista) — D8: override
  // manual, hoy se edita por el asistente MCP hasta que el form tenga un editor de bloques dedicado.
  "texto_rico.bloques",
  // `hero.ctaSecundario`: objeto anidado OPCIONAL `{ texto, ancla }`. La introspección declarada en D8
  // cubre arrays DE objetos (repeater), no objetos anidados sueltos con toggle presente/ausente. El CTA
  // PRIMARIO (ctaTexto/ctaAncla) sí es editable por el form; el secundario, por el asistente.
  "hero.ctaSecundario",
  // `catalogo.productoIds`: array de REFERENCIAS a productos (cuids, I2). Requiere un picker de productos
  // (data-bound: trae el catálogo del tenant + multiselect), fuera del alcance de la introspección
  // genérica (el picker de D8 es de imágenes/PageAsset). Con `modo:'todos'` (default) ni se usa.
  "catalogo.productoIds",
  // `compartir_sorteo.canales`: array de ENUM (multiselect). D8 declara "array de objetos→repeater", no
  // array-de-enum. Tiene default sensato (whatsapp/copiar/x); afinarlo va por el asistente por ahora.
  "compartir_sorteo.canales",
  // `cinta_texto.mensajes` (F12): array de STRINGS (no de objetos) — la introspección declarada (D8)
  // cubre array-de-objetos→repeater, no array-de-string. Tiene default sensato; se afina por el
  // asistente hasta que el form tenga un editor de lista-de-strings dedicado (REVISABLE).
  "cinta_texto.mensajes",
]);

describe("editor/formGenerator — F10-1: generador de forms cubre el registro (generativo)", () => {
  // page.editor.form.001 — cada campo de cada widget mapea a un control soportado (o override documentado)
  it("cada campo de cada widget mapea a un control soportado, salvo overrides documentados", () => {
    const noSoportados: string[] = [];
    for (const tipo of TIPOS) {
      const campos = camposDeSchema(WIDGET_REGISTRY[tipo].propsSchema);
      expect(campos, `${tipo}: propsSchema debe ser un objeto introspectable`).not.toBeNull();
      for (const { campo, schema } of campos!) {
        if (clasificarCampo(schema).control === "no-soportado") {
          noSoportados.push(`${tipo}.${campo}`);
        }
      }
    }
    // Todo campo no soportado tiene que ser un override CONOCIDO (documentado arriba con su razón).
    const inesperados = noSoportados.filter((c) => !OVERRIDES_CONOCIDOS.has(c));
    expect(inesperados, `campos sin control ni override documentado: ${inesperados.join(", ")}`).toEqual([]);
  });

  // page.editor.form.002 — los defaultProps (semilla del form al agregar una sección) parsean: un form
  // sin tocar produce props válidas contra su propsSchema (el form parte de props que ya parsean).
  it("los defaultProps de cada widget parsean contra su propsSchema (semilla del form)", () => {
    for (const tipo of TIPOS) {
      const r = WIDGET_REGISTRY[tipo].propsSchema.safeParse(WIDGET_REGISTRY[tipo].defaultProps);
      expect(r.success, `${tipo}: defaultProps no parsea — ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });
});

describe("editor/formGenerator — F10-3: metadata display del registro (generativo)", () => {
  // page.editor.meta.001 — WIDGET_META tiene titulo + descripcion no vacíos para CADA widget del registro
  it("la metadata display (titulo + descripcion) existe y no está vacía para cada widget", () => {
    for (const tipo of TIPOS) {
      const meta = WIDGET_META[tipo];
      expect(meta, `${tipo}: falta metadata`).toBeDefined();
      expect(meta.titulo.trim().length, `${tipo}: titulo vacío`).toBeGreaterThan(0);
      expect(meta.descripcion.trim().length, `${tipo}: descripcion vacía`).toBeGreaterThan(0);
      // El editor NUNCA muestra el `tipo` snake_case crudo (I-I / UX): el titulo no es el id.
      expect(meta.titulo).not.toBe(tipo);
    }
  });
});
