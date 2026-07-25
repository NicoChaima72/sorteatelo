import { describe, expect, it } from "vitest";

import {
  OverlayNodeSchema,
  PageDocumentSchema,
  SeccionNodeSchema,
} from "~/lib/pagebuilder/schema";
import {
  TIPOS_OVERLAY,
  TIPOS_SECCION,
  WIDGET_REGISTRY,
  type WidgetTipo,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests del `PageDocumentSchema` + registro de widgets (F02, ADR-0016/0018). Puro Zod, sin DB.
 * Verifica: (1) el documento semilla completo parsea; (2) rechazos duros — tipo desconocido, props
 * fuera de límite, campos extra, y el intento de un widget HTML/embed crudo (no existe en la union);
 * (3) test GENERATIVO sobre el registro (los defaultProps de cada widget parsean); (4) separación
 * secciones/overlays.
 */

/** Documento golden: root + una de cada sección semilla + overlays vacío. */
const GOLDEN = {
  schemaVersion: 1,
  root: { props: {} },
  secciones: [
    { id: "sec-hero", tipo: "hero", v: 3, props: { titulo: { children: [{ t: "Hola" }] }, ctaAncla: "catalogo", mostrarBadgeSorteo: true } },
    { id: "sec-catalogo", tipo: "catalogo", v: 1, props: { titulo: "Catálogo", modo: "todos", columnas: 3 } },
    { id: "sec-sorteo", tipo: "sorteo_vitrina", v: 1, props: { mostrarBases: true, estiloConteo: "badge" } },
    { id: "sec-como", tipo: "como_funciona", v: 1, props: { titulo: "Cómo funciona" } },
  ],
  overlays: [],
};

describe("pagebuilder/schema — PageDocumentSchema", () => {
  // page.doc.001 — el documento semilla completo (golden) parsea OK
  it("parsea el documento semilla completo (golden doc)", () => {
    const res = PageDocumentSchema.safeParse(GOLDEN);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.secciones).toHaveLength(4);
      expect(res.data.overlays).toEqual([]);
    }
  });

  // page.doc.002 — rechazos duros: tipo desconocido, prop fuera de límite, campo extra, HTML/embed
  it("rechaza tipo desconocido", () => {
    const doc = { ...GOLDEN, secciones: [{ id: "x", tipo: "banner_html", v: 1, props: {} }] };
    expect(PageDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rechaza props fuera de límite (titulo demasiado largo)", () => {
    const doc = {
      ...GOLDEN,
      secciones: [{ id: "x", tipo: "hero", v: 1, props: { titulo: "a".repeat(121) } }],
    };
    expect(PageDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rechaza campos extra en props (.strict)", () => {
    const doc = {
      ...GOLDEN,
      secciones: [{ id: "x", tipo: "hero", v: 1, props: { titulo: "ok", loQueSea: 1 } }],
    };
    expect(PageDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rechaza campos extra a nivel documento y nivel nodo (.strict)", () => {
    expect(PageDocumentSchema.safeParse({ ...GOLDEN, extra: true }).success).toBe(false);
    const conNodoExtra = {
      ...GOLDEN,
      secciones: [{ id: "x", tipo: "hero", v: 1, props: {}, html: "<script>alert(1)</script>" }],
    };
    expect(PageDocumentSchema.safeParse(conNodoExtra).success).toBe(false);
  });

  it("no admite ningún widget de HTML/embed crudo (html/embedCode/iframeSrc no existen en la union)", () => {
    for (const tipo of ["html", "embedCode", "iframeSrc", "custom_css"]) {
      const doc = {
        ...GOLDEN,
        secciones: [{ id: "x", tipo, v: 1, props: { contenido: "<b>x</b>" } }],
      };
      expect(PageDocumentSchema.safeParse(doc).success).toBe(false);
    }
    // Y aunque metan la prop peligrosa dentro de un tipo válido, .strict la rechaza.
    const heroConHtml = {
      ...GOLDEN,
      secciones: [{ id: "x", tipo: "hero", v: 1, props: { iframeSrc: "https://evil.example" } }],
    };
    expect(PageDocumentSchema.safeParse(heroConHtml).success).toBe(false);
  });

  // page.doc.003 — GENERATIVO: los defaultProps de CADA widget del registro parsean contra su schema
  it("los defaultProps de cada widget del registro parsean contra su propio propsSchema", () => {
    for (const tipo of Object.keys(WIDGET_REGISTRY) as WidgetTipo[]) {
      const def = WIDGET_REGISTRY[tipo];
      const res = def.propsSchema.safeParse(def.defaultProps);
      expect(res.success, `defaultProps de "${tipo}" debe parsear`).toBe(true);
    }
  });

  it("exhaustividad: cada TIPO_SECCION del registro es aceptado por la union de secciones y viceversa", () => {
    // Cada tipo de sección del registro produce un nodo válido con sus defaultProps.
    for (const tipo of TIPOS_SECCION) {
      const def = WIDGET_REGISTRY[tipo];
      const nodo = { id: `n-${tipo}`, tipo, v: def.v, props: def.propsSchema.parse(def.defaultProps) };
      const res = SeccionNodeSchema.safeParse(nodo);
      expect(res.success, `la union debe aceptar "${tipo}"`).toBe(true);
    }
    // Un tipo que NO está en el registro no es aceptado (la union no tiene ramas huérfanas).
    expect(SeccionNodeSchema.safeParse({ id: "x", tipo: "inexistente", v: 1, props: {} }).success).toBe(false);
  });

  // page.doc.004 — separación: overlays[] solo overlays; secciones[] solo secciones
  it("overlays[] admite tipos de overlay (F10) y rechaza un tipo de sección", () => {
    expect([...TIPOS_OVERLAY].sort()).toEqual(["aviso_barra", "whatsapp_flotante"]);
    expect(PageDocumentSchema.safeParse({ ...GOLDEN, overlays: [] }).success).toBe(true);
    // Un overlay válido (aviso_barra) ⇒ OK.
    const conOverlay = {
      ...GOLDEN,
      overlays: [{ id: "ov", tipo: "aviso_barra", v: 2, props: { mensajes: ["Envío gratis"] } }],
    };
    expect(PageDocumentSchema.safeParse(conOverlay).success).toBe(true);
    // Un widget de SECCIÓN metido en overlays ⇒ rechazo.
    const seccionEnOverlay = {
      ...GOLDEN,
      overlays: [{ id: "o", tipo: "hero", v: 1, props: {} }],
    };
    expect(PageDocumentSchema.safeParse(seccionEnOverlay).success).toBe(false);
    expect(OverlayNodeSchema.safeParse({ id: "o", tipo: "hero", v: 1, props: {} }).success).toBe(false);
  });

  it("secciones[] rechaza un nodo sin id o sin tipo válido", () => {
    expect(PageDocumentSchema.safeParse({ ...GOLDEN, secciones: [{ tipo: "hero", v: 1, props: {} }] }).success).toBe(false);
    expect(PageDocumentSchema.safeParse({ ...GOLDEN, secciones: [{ id: "x", v: 1, props: {} }] }).success).toBe(false);
  });
});
