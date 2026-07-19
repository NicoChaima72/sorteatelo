import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  bannerCtaProps,
  beneficiosGridProps,
  espaciadorProps,
  imagenDestacadaProps,
  separadorProps,
  textoRicoProps,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests de los widgets [mvp-v2] lote contenido/estructura (catálogo-v2 F04, síntesis §2/§6):
 * `beneficios_grid`, `texto_rico`, `imagen_destacada`, `separador`, `espaciador`, `banner_cta`.
 * Verifican el CHECKLIST INVARIANTE de cada uno: props `.strict()` (rechazo de HTML/campo extra),
 * enums cerrados, límites de cantidad/longitud, y que el nodo parsea contra la union de secciones.
 * Puro Zod, sin DB. La degradación visual y el render se validan en runtime/E2E (F04 E2E checkbox).
 */

describe("pagebuilder/widgets contenido (F04) — beneficios_grid", () => {
  // page.cont.001 — beneficios_grid: íconos ∈ ICONOS_BENEFICIO, 2–6 items, .strict()
  it("beneficios_grid valida íconos del enum, 2–6 items y rechaza campos extra", () => {
    const ok = { columnas: 3, items: [{ icono: "descarga", titulo: "Descarga inmediata" }, { icono: "pago", titulo: "Pago seguro" }] };
    expect(beneficiosGridProps.safeParse(ok).success).toBe(true);
    // ícono fuera del enum ⇒ rechazo
    expect(beneficiosGridProps.safeParse({ items: [{ icono: "inventado", titulo: "X" }, { icono: "pago", titulo: "Y" }] }).success).toBe(false);
    // menos de 2 / más de 6 items ⇒ rechazo
    expect(beneficiosGridProps.safeParse({ items: [{ icono: "descarga", titulo: "X" }] }).success).toBe(false);
    expect(beneficiosGridProps.safeParse({ items: Array(7).fill({ icono: "descarga", titulo: "X" }) }).success).toBe(false);
    // HTML/campo extra ⇒ rechazo (.strict)
    expect(beneficiosGridProps.safeParse({ items: [{ icono: "descarga", titulo: "X", html: "<b>x</b>" }, { icono: "pago", titulo: "Y" }] }).success).toBe(false);
    // el nodo parsea contra la union de secciones
    expect(
      SeccionNodeSchema.safeParse({ id: "bg", tipo: "beneficios_grid", v: 1, props: ok }).success,
    ).toBe(true);
  });
});

describe("pagebuilder/widgets contenido (F04) — texto_rico (bloques tipados, sin HTML)", () => {
  // page.cont.002 — texto_rico: solo bloques de la discriminated-union; bloque desconocido ⇒ rechazo
  it("texto_rico acepta subtitulo/parrafo/cita/lista y rechaza bloque desconocido/HTML", () => {
    const ok = {
      bloques: [
        { tipo: "subtitulo", texto: "Título" },
        { tipo: "parrafo", texto: "Un párrafo." },
        { tipo: "cita", texto: "Una cita.", autor: "Alguien" },
        { tipo: "lista", estilo: "numerada", items: ["uno", "dos"] },
      ],
    };
    expect(textoRicoProps.safeParse(ok).success).toBe(true);
    // un bloque de tipo desconocido ⇒ rechazo (discriminated-union cerrada)
    expect(textoRicoProps.safeParse({ bloques: [{ tipo: "html", texto: "<b>x</b>" }] }).success).toBe(false);
    // parrafo con HTML es texto plano permitido, pero campo extra en el bloque ⇒ rechazo (.strict)
    expect(textoRicoProps.safeParse({ bloques: [{ tipo: "parrafo", texto: "ok", clase: "x" }] }).success).toBe(false);
    // límites: subtitulo ≤120, lista ≤12 items, min 1 bloque
    expect(textoRicoProps.safeParse({ bloques: [] }).success).toBe(false);
    expect(textoRicoProps.safeParse({ bloques: [{ tipo: "subtitulo", texto: "x".repeat(121) }] }).success).toBe(false);
    expect(textoRicoProps.safeParse({ bloques: [{ tipo: "lista", items: Array(13).fill("x") }] }).success).toBe(false);
    expect(
      SeccionNodeSchema.safeParse({ id: "tr", tipo: "texto_rico", v: 1, props: ok }).success,
    ).toBe(true);
  });
});

describe("pagebuilder/widgets contenido (F04) — imagen_destacada", () => {
  // page.cont.003 — imagen_destacada: url + alt obligatorios, ratio enum, .strict
  it("imagen_destacada exige url válida y alt, valida ratio y rechaza campos extra", () => {
    const ok = { imagenUrl: "https://cdn.example/x.jpg", alt: "Una imagen" };
    expect(imagenDestacadaProps.safeParse(ok).success).toBe(true);
    // sin alt ⇒ rechazo (accesibilidad obligatoria)
    expect(imagenDestacadaProps.safeParse({ imagenUrl: "https://cdn.example/x.jpg" }).success).toBe(false);
    // url no-url ⇒ rechazo
    expect(imagenDestacadaProps.safeParse({ imagenUrl: "no-es-url", alt: "x" }).success).toBe(false);
    // ratio fuera del enum ⇒ rechazo
    expect(imagenDestacadaProps.safeParse({ ...ok, ratio: "21:9" }).success).toBe(false);
    // campo extra ⇒ rechazo (.strict)
    expect(imagenDestacadaProps.safeParse({ ...ok, iframeSrc: "https://evil" }).success).toBe(false);
    expect(
      SeccionNodeSchema.safeParse({ id: "im", tipo: "imagen_destacada", v: 1, props: ok }).success,
    ).toBe(true);
  });
});

describe("pagebuilder/widgets contenido (F04) — separador + espaciador (estructurales)", () => {
  // page.cont.004 — separador: estilo/tamano de enum cerrado, .strict
  it("separador valida estilo/tamano del enum y rechaza campos extra", () => {
    expect(separadorProps.safeParse({ estilo: "perforacion", tamano: "l" }).success).toBe(true);
    expect(separadorProps.safeParse({}).success).toBe(true); // todo default
    expect(separadorProps.safeParse({ estilo: "estrella" }).success).toBe(false);
    expect(separadorProps.safeParse({ estilo: "linea", css: "x" }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "sp", tipo: "separador", v: 1, props: {} }).success).toBe(true);
  });

  // page.cont.005 — espaciador: alto de enum cerrado, .strict
  it("espaciador valida alto del enum y rechaza campos extra", () => {
    expect(espaciadorProps.safeParse({ alto: "xl" }).success).toBe(true);
    expect(espaciadorProps.safeParse({}).success).toBe(true); // default m
    expect(espaciadorProps.safeParse({ alto: "gigante" }).success).toBe(false);
    expect(espaciadorProps.safeParse({ alto: "m", px: 200 }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "es", tipo: "espaciador", v: 1, props: {} }).success).toBe(true);
  });
});

describe("pagebuilder/widgets contenido (F04) — banner_cta", () => {
  // page.cont.006 — banner_cta: ctaAncla ∈ CTA_ANCLAS, overlayOscuridad step-clamp, sin imagen ⇒ OK
  it("banner_cta valida ancla/overlay, exige titulo+ctaTexto y parsea sin imagen (degradación)", () => {
    const sinImagen = { titulo: "Participa", ctaTexto: "Ver" };
    expect(bannerCtaProps.safeParse(sinImagen).success).toBe(true); // sin imagen ⇒ el render pinta gradiente de marca
    // ctaAncla fuera de CTA_ANCLAS ⇒ rechazo
    expect(bannerCtaProps.safeParse({ ...sinImagen, ctaAncla: "externo" }).success).toBe(false);
    // overlayOscuridad fuera de 0–90 o no-entero ⇒ rechazo (step-clamp)
    expect(bannerCtaProps.safeParse({ ...sinImagen, overlayOscuridad: 120 }).success).toBe(false);
    expect(bannerCtaProps.safeParse({ ...sinImagen, overlayOscuridad: 44.5 }).success).toBe(false);
    // faltan required ⇒ rechazo
    expect(bannerCtaProps.safeParse({ titulo: "Solo título" }).success).toBe(false);
    // imagenFondoUrl no-url ⇒ rechazo
    expect(bannerCtaProps.safeParse({ ...sinImagen, imagenFondoUrl: "no-url" }).success).toBe(false);
    // campo extra ⇒ rechazo (.strict)
    expect(bannerCtaProps.safeParse({ ...sinImagen, html: "<b>x</b>" }).success).toBe(false);
    expect(
      SeccionNodeSchema.safeParse({ id: "bc", tipo: "banner_cta", v: 1, props: sinImagen }).success,
    ).toBe(true);
  });
});
