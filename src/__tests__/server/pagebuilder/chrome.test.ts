import { describe, expect, it } from "vitest";

import {
  ChromeSchema,
  chromeDefault,
  hrefMenuItem,
  leerChromeParaRender,
} from "~/lib/pagebuilder/chrome";

/**
 * Tests del CHROME global (Tanda 3 F06/D10/D11, ADR-0021 propuesto). `ChromeSchema` Zod `.strict()`:
 * header/footer con enums + menú `MenuItem` (etiqueta + DestinoLink tipado, un solo vocabulario de
 * destinos con los runs). `chromeJson null` ⇒ null (header/footer actual, byte-idéntico I-U8); podrido ⇒
 * default tolerante (I9). Los PINNED (carrito/sesión/atribución/Bases) NO existen en el schema ⇒ no hay
 * input que los quite (I-U2, no-borrables por construcción). Puro Zod, sin DB, sin render.
 */

const chromeValido = () => ({
  schemaVersion: 1,
  header: {
    layout: "izquierda",
    sticky: "fijo",
    fondo: "vidrio",
    menu: [
      { etiqueta: "Inicio", destino: { tipo: "ancla", ancla: "catalogo" } },
      { etiqueta: "Sobre mí", destino: { tipo: "pagina", slug: "sobre-mi" } },
      { etiqueta: "Instagram", destino: { tipo: "url", url: "https://instagram.com/x" } },
    ],
  },
  footer: {
    columnas: "dos",
    links: [{ etiqueta: "Bases legales", destino: { tipo: "pagina", slug: "bases" } }],
    texto: "Hecho con cariño.",
  },
});

describe("pagebuilder/chrome — ChromeSchema (F06/D10)", () => {
  // page.chrome.001 — un chrome válido con menú de los 3 tipos de destino parsea
  it("parsea header/footer con menú discriminado (ancla|pagina|url) y footer con links+texto", () => {
    expect(ChromeSchema.safeParse(chromeValido()).success).toBe(true);
  });

  // page.chrome.002 — url no-https / etiqueta >20 / campo extra / item extra ⇒ rechazo (.strict)
  it("rechaza url no-https, etiqueta >20, campos extra (.strict)", () => {
    const httpMenu = chromeValido();
    httpMenu.header.menu[2] = { etiqueta: "X", destino: { tipo: "url", url: "http://inseguro.cl" } };
    expect(ChromeSchema.safeParse(httpMenu).success).toBe(false);

    const etiquetaLarga = chromeValido();
    etiquetaLarga.header.menu[0] = { etiqueta: "x".repeat(21), destino: { tipo: "ancla", ancla: "catalogo" } };
    expect(ChromeSchema.safeParse(etiquetaLarga).success).toBe(false);

    // campo extra en el header ⇒ rechazo
    const headerExtra = chromeValido() as Record<string, unknown>;
    (headerExtra.header as Record<string, unknown>).colorHex = "#fff";
    expect(ChromeSchema.safeParse(headerExtra).success).toBe(false);
  });

  // page.chrome.003 — PINNED por construcción: no hay campo para carrito/sesión/atribución/bases ⇒
  // intentar "apagarlos" es un campo extra ⇒ rechazo (I-U2: no existe input que los quite)
  it("no admite campos para apagar los pinned (carrito/sesión/atribución/bases) — .strict los rechaza", () => {
    const conCarrito = chromeValido() as Record<string, unknown>;
    (conCarrito.header as Record<string, unknown>).mostrarCarrito = false;
    expect(ChromeSchema.safeParse(conCarrito).success).toBe(false);

    const conBases = chromeValido() as Record<string, unknown>;
    (conBases.footer as Record<string, unknown>).ocultarBases = true;
    expect(ChromeSchema.safeParse(conBases).success).toBe(false);
  });

  // page.chrome.004 — un chrome {} rellena TODOS los defaults (header/footer actuales, no-op)
  it("un chrome {} parsea y rellena los defaults (header/footer actuales)", () => {
    const def = ChromeSchema.parse({});
    expect(def.header.fondo).toBe("vidrio"); // = el blur actual
    expect(def.header.sticky).toBe("fijo");
    expect(def.header.menu).toEqual([]);
    expect(def.footer.columnas).toBe("auto");
    expect(def.footer.links).toEqual([]);
    expect(chromeDefault().header.layout).toBe("izquierda");
  });
});

describe("pagebuilder/chrome — leerChromeParaRender (tolerante, I9)", () => {
  // page.chrome.005 — null ⇒ null (byte-idéntico); podrido ⇒ default; válido ⇒ se conserva
  it("null ⇒ null; chrome podrido ⇒ default tolerante (nunca lanza); válido ⇒ intacto", () => {
    expect(leerChromeParaRender(null)).toBeNull();
    expect(leerChromeParaRender(undefined)).toBeNull();
    // podrido ⇒ default (no lanza)
    const podrido = leerChromeParaRender({ header: { fondo: "neon-imposible", menu: "no-es-array" } });
    expect(podrido?.header.fondo).toBe("vidrio");
    // válido ⇒ conserva el menú
    const ok = leerChromeParaRender(chromeValido());
    expect(ok?.header.menu).toHaveLength(3);
  });
});

describe("pagebuilder/chrome — hrefMenuItem (resolución de destino)", () => {
  // page.chrome.006 — cada tipo de destino resuelve a su href (mismo criterio que los links de runs)
  it("resuelve ancla→#, pagina→/slug, url→href", () => {
    expect(hrefMenuItem({ tipo: "ancla", ancla: "sorteo" })).toBe("#sorteo");
    expect(hrefMenuItem({ tipo: "pagina", slug: "sobre-mi" })).toBe("/sobre-mi");
    expect(hrefMenuItem({ tipo: "url", url: "https://x.cl" })).toBe("https://x.cl");
  });

  /**
   * D13 (admin-bases-pdf): «Bases» en el navbar abre SIEMPRE el PDF. `derivarNav` ya lo cumplía, pero
   * el chrome resuelve sus destinos por ACÁ — y los dos caminos que pasan por este helper
   * (`header.basesPdf` y un `header.menu` configurado) esquivaban la regla, así que en la data real el
   * ítem seguía haciendo scroll. La normalización vive en el resolver, no en cada call site.
   */
  // page.chrome.007 — un destino `ancla:"bases"` es la RUTA `/bases`, venga del menú o de `basesPdf`
  it("un ancla `bases` resuelve a la RUTA `/bases`, nunca al scroll `#bases` (D13)", () => {
    expect(hrefMenuItem({ tipo: "ancla", ancla: "bases" })).toBe("/bases");
  });

  // page.chrome.008 — la excepción es SOLO `bases`: las demás anclas siguen siendo scroll
  it("no afecta a las otras anclas del chrome (siguen con scroll `#ancla`)", () => {
    expect(hrefMenuItem({ tipo: "ancla", ancla: "catalogo" })).toBe("#catalogo");
    expect(hrefMenuItem({ tipo: "ancla", ancla: "como-funciona" })).toBe("#como-funciona");
  });
});
