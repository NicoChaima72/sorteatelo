import { describe, expect, it } from "vitest";

import { componerNavDelHeader, chromeDefault } from "~/lib/pagebuilder/chrome";
import {
  ANCLAS_QUE_SON_RUTA,
  anclasSemanticas,
  derivarNav,
  hrefDeAncla,
  humanizarSlug,
  reanclarNavALaHome,
} from "~/lib/pagebuilder/nav";
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
    // `bases` es RUTA, no ancla de scroll (admin-bases-pdf D13): el ítem legal abre el PDF.
    expect(nav.map((i) => i.href)).toEqual(["#h", "#sorteo", "#autora", "/bases"]);
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
      // `bases` deriva a la RUTA `/bases` (D13), aunque su ancla DOM siga existiendo (arriba).
      { label: "Bases", href: "/bases" },
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

describe("nav — el ítem «Bases» abre SIEMPRE el PDF (admin-bases-pdf D13)", () => {
  // nav.bases.001 — la sección de bases navega a la RUTA `/bases`, no al ancla `#bases`
  // Decisión del usuario (D13): «Bases» del navbar debe abrir el PDF del sorteo activo, nunca
  // hacer scroll a una sección de la home. Es un enlace LEGAL (ADR-0008): tiene que llevar al
  // documento, no a un bloque de texto que el Organizador editó.
  it("`garantias_sorteo` y `texto_rico` marcados en el nav apuntan a `/bases`, no a `#bases`", () => {
    const nav = derivarNav([
      sec("garantias_sorteo", "g", { incluir: true }),
      sec("texto_rico", "t", { incluir: true }),
    ]);
    expect(nav).toEqual([
      { label: "Bases", href: "/bases" },
      { label: "Bases", href: "/bases" },
    ]);
  });

  // nav.bases.002 — una etiqueta personalizada no cambia el DESTINO (sigue siendo el PDF)
  it("con etiqueta propia conserva el destino `/bases` (el destino es de plataforma, no del texto)", () => {
    const nav = derivarNav([
      sec("garantias_sorteo", "g", { incluir: true, etiqueta: "Legal" }),
    ]);
    expect(nav).toEqual([{ label: "Legal", href: "/bases" }]);
  });

  // nav.bases.003 — el resto del nav NO se toca: las demás secciones siguen con scroll `#ancla`
  it("no afecta a las otras secciones (siguen con ancla de scroll)", () => {
    const nav = derivarNav([
      sec("catalogo", "c", { incluir: true }),
      sec("garantias_sorteo", "g", { incluir: true }),
      sec("como_funciona", "cf", { incluir: true }),
    ]);
    expect(nav).toEqual([
      { label: "Catálogo", href: "#catalogo" },
      { label: "Bases", href: "/bases" },
      { label: "Cómo funciona", href: "#como-funciona" },
    ]);
  });

  // nav.bases.004 — el ancla DOM `#bases` sigue emitiéndose (no rompe targets existentes)
  it("`anclasSemanticas` sigue emitiendo el ancla `bases` de la sección (target DOM intacto)", () => {
    expect(anclasSemanticas([sec("garantias_sorteo", "g")])).toEqual({ g: "bases" });
  });

  // nav.bases.005 — `hrefDeAncla` es la FUENTE ÚNICA de la regla (D14): la comparten el nav derivado,
  // el chrome (`hrefMenuItem`) y los CTA de los widgets. Antes cada superficie armaba `#${ancla}` por
  // su cuenta y «Bases» terminó con dos destinos distintos en la misma tienda.
  it("`hrefDeAncla` resuelve `bases` a la ruta y el resto al ancla de scroll", () => {
    expect(hrefDeAncla("bases")).toBe("/bases");
    expect(hrefDeAncla("catalogo")).toBe("#catalogo");
    expect(hrefDeAncla("sorteo")).toBe("#sorteo");
    // ancla desconocida (id de nodo, sección sin ancla semántica) ⇒ scroll, nunca una ruta inventada
    expect(hrefDeAncla("no-existe")).toBe("#no-existe");
    // la tabla es la MISMA que consume `derivarNav` (una sola entrada hoy)
    expect(Object.keys(ANCLAS_QUE_SON_RUTA)).toEqual(["bases"]);
  });
});

// ── Re-anclaje del nav fuera de la home (follow-up navbar de tema-paginas) ─────────────────────

describe("reanclarNavALaHome — el nav de la home usable desde /checkout", () => {
  // nav.reancla.001 — anclas de scroll pasan a rutas absolutas a la home
  it("re-ancla `#x` a `/#x` y deja rutas y URLs intactas", () => {
    expect(
      reanclarNavALaHome([
        { label: "El libro", href: "#beneficios" },
        { label: "Bases", href: "/bases" },
        { label: "IG", href: "https://instagram.com/x" },
      ]),
    ).toEqual([
      { label: "El libro", href: "/#beneficios" },
      { label: "Bases", href: "/bases" },
      { label: "IG", href: "https://instagram.com/x" },
    ]);
  });

  // nav.reancla.002 — idempotente: aplicarlo dos veces no double-prefija
  it("es idempotente", () => {
    const una = reanclarNavALaHome([{ label: "A", href: "#a" }]);
    expect(reanclarNavALaHome(una)).toEqual(una);
  });
});

describe("componerNavDelHeader — mismas reglas que la home", () => {
  const derivado = [{ label: "El libro", href: "#beneficios" }];
  const paginas = [{ label: "Sobre mi", href: "/sobre-mi" }];

  // nav.componer.001 — sin chrome: derivado + páginas enNav
  it("sin chrome compone derivado + páginas", () => {
    expect(componerNavDelHeader({ chrome: null, navDerivado: derivado, navPaginas: paginas })).toEqual([
      ...derivado,
      ...paginas,
    ]);
  });

  // nav.componer.002 — el menú del chrome MANDA sobre el derivado
  it("el menú del chrome manda", () => {
    const chrome = chromeDefault();
    chrome.header.menu = [{ etiqueta: "Solo esto", destino: { tipo: "ancla", ancla: "sorteo" } }];
    expect(
      componerNavDelHeader({ chrome, navDerivado: derivado, navPaginas: paginas }),
    ).toEqual([{ label: "Solo esto", href: "#sorteo" }]);
  });

  // nav.componer.003 — basesPdf agrega «Bases» al final venga de donde venga el resto
  it("basesPdf agrega Bases al final", () => {
    const chrome = chromeDefault();
    chrome.header.basesPdf = { tipo: "url", url: "https://r2.example.com/bases.pdf" };
    const nav = componerNavDelHeader({ chrome, navDerivado: derivado, navPaginas: [] });
    expect(nav[nav.length - 1]).toEqual({ label: "Bases", href: "https://r2.example.com/bases.pdf" });
  });
});
