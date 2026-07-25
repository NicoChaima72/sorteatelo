import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { PageDocumentSchema } from "~/lib/pagebuilder/schema";

/**
 * Tests de la factory pura `documentoInicial` (F03, ADR-0016). Verifica: pureza/determinismo,
 * que reproduce las 4 secciones semilla, la degradación elegante (branding vacío) y que su salida
 * SIEMPRE parsea contra `PageDocumentSchema`.
 */

const brandingCompleto = {
  heroTitulo: "Historias que enamoran",
  heroSubtitulo: "Guías digitales listas para descargar.",
  heroImageUrl: "https://pub.r2.dev/autora/hero?v=2",
};

const brandingVacio = { heroTitulo: null, heroSubtitulo: null, heroImageUrl: null };

describe("pagebuilder/factory — documentoInicial", () => {
  // page.factory.001 — reproduce las 4 secciones semilla en orden, con el hero desde branding
  it("reproduce las 4 secciones semilla (hero desde branding, orden estable)", () => {
    const doc = documentoInicial(brandingCompleto);
    expect(doc.secciones.map((s) => s.tipo)).toEqual([
      "hero",
      "catalogo",
      "sorteo_vitrina",
      "como_funciona",
    ]);
    const hero = doc.secciones[0]!;
    expect(hero.tipo).toBe("hero");
    if (hero.tipo === "hero") {
      // Tanda 3 F02/D4: titulo/subtitulo son RichTexto (el override de branding se envuelve en un run plano).
      expect(hero.props.titulo?.children.map((r) => r.t).join("")).toBe("Historias que enamoran");
      expect(hero.props.subtitulo?.children.map((r) => r.t).join("")).toBe("Guías digitales listas para descargar.");
      expect(hero.props.imagenUrl).toBe("https://pub.r2.dev/autora/hero?v=2");
    }
    expect(doc.overlays).toEqual([]);
    expect(doc.schemaVersion).toBe(1);
  });

  // page.factory.002 — PURA/DETERMINISTA: misma entrada ⇒ misma salida byte a byte (ids fijos)
  it("es pura y determinista (mismo branding ⇒ documento idéntico, ids estables)", () => {
    const a = documentoInicial(brandingCompleto);
    const b = documentoInicial(brandingCompleto);
    expect(a).toEqual(b);
    expect(a.secciones.map((s) => s.id)).toEqual([
      "sec-hero",
      "sec-catalogo",
      "sec-sorteo",
      "sec-como-funciona",
    ]);
  });

  // page.factory.003 — degradación elegante: branding vacío ⇒ hero sin overrides (render cae al Tenant)
  it("con branding vacío degrada elegante: el hero no persiste overrides (I2/I11)", () => {
    const doc = documentoInicial(brandingVacio);
    const hero = doc.secciones[0]!;
    if (hero.tipo === "hero") {
      expect(hero.props.titulo).toBeUndefined();
      expect(hero.props.subtitulo).toBeUndefined();
      expect(hero.props.imagenUrl).toBeUndefined();
      // Pero los defaults SÍ están (ctaAncla/mostrarBadgeSorteo).
      expect(hero.props.ctaAncla).toBe("catalogo");
      expect(hero.props.mostrarBadgeSorteo).toBe(true);
    }
  });

  // page.factory.004 — la salida SIEMPRE parsea; textos largos se recortan, imagenUrl inválida se descarta
  it("nunca produce un documento inválido: recorta textos largos y descarta imagenUrl corrupta", () => {
    const doc = documentoInicial({
      heroTitulo: "T".repeat(500),
      heroSubtitulo: "S".repeat(1000),
      heroImageUrl: "no-es-una-url",
    });
    // Parsea sin lanzar (la factory ya parsea; revalidamos por las dudas).
    expect(PageDocumentSchema.safeParse(doc).success).toBe(true);
    const hero = doc.secciones[0]!;
    if (hero.tipo === "hero") {
      // Recortado al límite ANTES de envolver en runs (el run plano lleva el string recortado).
      expect(hero.props.titulo?.children[0]?.t.length).toBe(120);
      expect(hero.props.subtitulo?.children[0]?.t.length).toBe(300);
      expect(hero.props.imagenUrl).toBeUndefined(); // url corrupta descartada
    }
  });
});
