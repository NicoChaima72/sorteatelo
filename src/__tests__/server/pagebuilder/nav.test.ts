import { describe, expect, it } from "vitest";

import { anclasSemanticas, derivarNav, humanizarSlug } from "~/lib/pagebuilder/nav";
import {
  OverlayNodeSchema,
  SeccionNodeSchema,
  type SeccionNode,
} from "~/lib/pagebuilder/schema";
import { CTA_ANCLAS, heroProps } from "~/lib/pagebuilder/widgets";

/**
 * Tests del nav auto-derivado (builder-tanda-1 F05/D8): derivación PURA desde el envelope `nav`,
 * anclas semánticas por primera-sección-de-tipo, y expansión ADITIVA de `CTA_ANCLAS`. La regla de oro
 * es la degradación no-op (I-H): sin ninguna sección marcada, `derivarNav` devuelve `[]` ⇒ el header
 * cae al nav actual.
 */

/** Sección mínima para las funciones puras (solo leen `tipo`/`id`/`nav`). */
const sec = (
  tipo: string,
  id: string,
  nav?: { incluir: boolean; etiqueta?: string },
): SeccionNode =>
  ({ tipo, id, v: 1, props: {}, ...(nav ? { nav } : {}) }) as unknown as SeccionNode;

describe("nav — derivarNav (F05/D8)", () => {
  // nav.derive.001 — sin ningún `nav.incluir` ⇒ [] (el header usa el nav hardcodeado actual, I-H).
  it("sin ninguna sección marcada devuelve [] (degradación no-op)", () => {
    const nav = derivarNav([sec("hero", "h"), sec("catalogo", "c"), sec("como_funciona", "cf")]);
    expect(nav).toEqual([]);
  });

  // nav.derive.002 — secciones marcadas ⇒ items en ORDEN del documento con etiqueta explícita o default.
  it("deriva items en orden con etiqueta explícita o la del mapa por tipo", () => {
    const nav = derivarNav([
      sec("hero", "h", { incluir: true, etiqueta: "El libro" }),
      sec("catalogo", "c"), // NO marcada ⇒ no entra
      sec("bloque_ticket_promo", "b", { incluir: true }), // default "Sorteo"
      sec("perfil_autora", "a", { incluir: true }), // default "Autora"
      sec("garantias_sorteo", "g", { incluir: true }), // default "Bases"
    ]);
    expect(nav.map((i) => i.label)).toEqual(["El libro", "Sorteo", "Autora", "Bases"]);
    expect(nav.map((i) => i.href)).toEqual(["#h", "#sorteo", "#autora", "#bases"]);
  });

  // nav.derive.003 — la 1ª sección de un tipo apunta al ancla semántica; la 2ª del mismo tipo, a su id.
  it("href = ancla semántica para la primera del tipo, id del nodo para la segunda", () => {
    const nav = derivarNav([
      sec("catalogo", "c1", { incluir: true }),
      sec("catalogo", "c2", { incluir: true, etiqueta: "Más" }),
    ]);
    expect(nav).toEqual([
      { label: "Catálogo", href: "#catalogo" },
      { label: "Más", href: "#c2" },
    ]);
  });
});

describe("nav — anclasSemanticas (F05/D8)", () => {
  // nav.anclas.001 — la 1ª sección de cada tipo navegable recibe su ancla; la 2ª del mismo tipo, no
  // (evita ids DOM duplicados). Tipos no navegables no aportan ancla.
  it("emite el ancla por la primera sección de cada tipo navegable, sin duplicar ids", () => {
    const anclas = anclasSemanticas([
      sec("hero", "h"), // no navegable ⇒ sin ancla
      sec("catalogo", "c1"),
      sec("catalogo", "c2"), // segunda del tipo ⇒ sin ancla
      sec("perfil_autora", "a"),
      sec("garantias_sorteo", "g"),
    ]);
    expect(anclas).toEqual({ c1: "catalogo", a: "autora", g: "bases" });
  });

  // nav.anclas.002 — sorteo_vitrina y bloque_ticket_promo comparten el ancla "sorteo": solo la 1ª la emite.
  it("tipos que comparten ancla (sorteo) solo la emiten una vez", () => {
    const anclas = anclasSemanticas([
      sec("sorteo_vitrina", "sv"),
      sec("bloque_ticket_promo", "bt"),
    ]);
    expect(anclas).toEqual({ sv: "sorteo" });
  });

  // nav.anclas.003 (F13) — beneficios_grid y texto_rico ganan ancla semántica (antes caían a `#<uuid>`):
  // el nav "El libro"/"Bases" del mockup ahora apunta a un slug estable en vez del id del nodo.
  it("beneficios_grid → #beneficios y texto_rico → #bases (anclas semánticas nuevas)", () => {
    const anclas = anclasSemanticas([
      sec("beneficios_grid", "bg"),
      sec("texto_rico", "tr"),
    ]);
    expect(anclas).toEqual({ bg: "beneficios", tr: "bases" });
    // y el nav derivado usa esos slugs (no el id del nodo) para la 1ª sección del tipo
    const nav = derivarNav([
      sec("beneficios_grid", "bg", { incluir: true, etiqueta: "El libro" }),
      sec("texto_rico", "tr", { incluir: true, etiqueta: "Bases" }),
    ]);
    expect(nav).toEqual([
      { label: "El libro", href: "#beneficios" },
      { label: "Bases", href: "#bases" },
    ]);
  });
});

describe("nav — envelope schema (F05/D8)", () => {
  // nav.schema.001 — `nav {incluir, etiqueta}` parsea en el envelope de sección; etiqueta >20 y campo
  // extra ⇒ rechazo (.strict); un doc SIN nav parsea igual (no-op, I-H).
  it("el envelope de sección admite nav estricto; etiqueta >20 y extra ⇒ rechazo", () => {
    // `hero` tiene todas sus props con default ⇒ `props:{}` parsea; aislamos el efecto del envelope `nav`.
    const base = { id: "s", tipo: "hero", v: 2, props: {} };
    expect(SeccionNodeSchema.safeParse(base).success).toBe(true); // sin nav ⇒ OK (no-op)
    expect(SeccionNodeSchema.safeParse({ ...base, nav: { incluir: true } }).success).toBe(true);
    expect(
      SeccionNodeSchema.safeParse({ ...base, nav: { incluir: true, etiqueta: "Autora" } }).success,
    ).toBe(true);
    // etiqueta >20 ⇒ rechazo
    expect(
      SeccionNodeSchema.safeParse({ ...base, nav: { incluir: true, etiqueta: "x".repeat(21) } }).success,
    ).toBe(false);
    // campo extra en nav ⇒ rechazo (.strict)
    expect(
      SeccionNodeSchema.safeParse({ ...base, nav: { incluir: true, url: "http://x" } }).success,
    ).toBe(false);
  });

  // nav.schema.002 — los OVERLAYS (nodo pelado) NO admiten `nav`.
  it("los overlays rechazan un campo nav (envelope pelado)", () => {
    expect(
      OverlayNodeSchema.safeParse({
        id: "o",
        tipo: "aviso_barra",
        v: 2,
        props: { mensajes: ["Hola"] },
        nav: { incluir: true },
      }).success,
    ).toBe(false);
  });
});

describe("nav — CTA_ANCLAS ampliado (F05/D8, aditivo)", () => {
  // nav.cta.001 — los valores viejos (catalogo/sorteo) siguen; los nuevos (autora/bases/…) parsean.
  it("CTA_ANCLAS conserva los viejos y suma los nuevos; el hero parsea con un ancla nueva", () => {
    expect([...CTA_ANCLAS]).toContain("catalogo");
    expect([...CTA_ANCLAS]).toContain("sorteo");
    expect([...CTA_ANCLAS]).toContain("autora");
    expect([...CTA_ANCLAS]).toContain("bases");
    // el hero acepta un ctaAncla nuevo (docs viejos con catalogo/sorteo siguen válidos)
    expect(heroProps.safeParse({ ctaAncla: "bases" }).success).toBe(true);
    expect(heroProps.safeParse({ ctaAncla: "catalogo" }).success).toBe(true);
    expect(heroProps.safeParse({ ctaAncla: "inexistente" }).success).toBe(false);
  });
});

describe("nav — humanizarSlug (multi-página F04/D9)", () => {
  // nav.humanizar.001 — slug kebab → etiqueta humana (guiones a espacios, capitaliza)
  it("convierte un slug de página a una etiqueta de menú legible", () => {
    expect(humanizarSlug("sobre-mi")).toBe("Sobre mi");
    expect(humanizarSlug("preguntas-frecuentes")).toBe("Preguntas frecuentes");
    expect(humanizarSlug("bases")).toBe("Bases");
  });
});
