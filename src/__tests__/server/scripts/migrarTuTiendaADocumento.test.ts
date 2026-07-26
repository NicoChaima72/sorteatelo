import { describe, expect, it } from "vitest";

import { conTextosDeTienda } from "~/lib/pagebuilder/factory";
import {
  PageDocumentSchema,
  SCHEMA_VERSION,
  type PageDocument,
} from "~/lib/pagebuilder/schema";
import { WIDGET_REGISTRY, runsDeTexto } from "~/lib/pagebuilder/widgets";

/**
 * Tests del núcleo PURO de la migración «columnas muertas de Tu tienda → Documento de Página»
 * (admin-bases-pdf F05, D7/opción E). Corre ANTES del drop de F07 para no perder texto que un
 * Organizador escribió en el admin DESPUÉS del backfill (esos campos guardaban con toast de éxito
 * pero sin efecto en el storefront — el drift que este plan viene a matar).
 *
 * Contrato: solo RELLENA lo que falta en el documento. Nunca pisa contenido existente y nunca
 * duplica ⇒ correr el script N veces da el mismo resultado que correrlo una (idempotente).
 */

/** Documento con un hero SIN título/subtítulo/imagen (el estado por defecto: sin overrides). */
function docConHeroVacio(): PageDocument {
  return PageDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    root: { props: {} },
    secciones: [
      {
        id: "sec-hero",
        tipo: "hero",
        v: WIDGET_REGISTRY.hero.v,
        props: { ...WIDGET_REGISTRY.hero.defaultProps },
      },
    ],
    overlays: [],
  });
}

/** El hero del documento (siempre el primero, que es el que la migración toca). */
function hero(doc: PageDocument) {
  const s = doc.secciones.find((x) => x.tipo === "hero");
  if (s?.tipo !== "hero") throw new Error("sin hero");
  return s.props;
}

const COLUMNAS = {
  heroTitulo: "Bienvenida a mi tienda",
  heroSubtitulo: "Libros con humor",
  heroImageUrl: "https://pub.r2.dev/T1/branding/hero?v=1",
  avisoTexto: "Envío inmediato tras el pago.",
};

describe("pagebuilder/factory — conTextosDeTienda (migración F05)", () => {
  // scripts.migrarTienda.001 — vuelca las 4 columnas al documento cuando el hero no las tiene
  it("con el hero vacío, vuelca titulo/subtitulo/imagen al hero y el aviso como overlay", () => {
    const migrado = conTextosDeTienda(docConHeroVacio(), COLUMNAS);
    const h = hero(migrado);

    expect(h.titulo).toEqual(runsDeTexto("Bienvenida a mi tienda"));
    expect(h.subtitulo).toEqual(runsDeTexto("Libros con humor"));
    expect(h.imagenUrl).toBe("https://pub.r2.dev/T1/branding/hero?v=1");
    expect(migrado.overlays.filter((o) => o.tipo === "aviso_barra")).toHaveLength(1);
    // Sigue siendo un documento VÁLIDO (no se cuela nada que el schema rechace).
    expect(() => PageDocumentSchema.parse(migrado)).not.toThrow();
  });

  // scripts.migrarTienda.002 — IDEMPOTENTE: correrlo dos veces da exactamente lo mismo
  it("correrlo dos veces produce el MISMO documento (idempotente)", () => {
    const una = conTextosDeTienda(docConHeroVacio(), COLUMNAS);
    const dos = conTextosDeTienda(una, COLUMNAS);
    expect(dos).toEqual(una);
    expect(dos.overlays.filter((o) => o.tipo === "aviso_barra")).toHaveLength(1);
  });

  // scripts.migrarTienda.003 — NUNCA pisa lo que el Organizador ya editó en el builder
  it("con el documento ya poblado no pisa nada (el builder manda sobre la columna)", () => {
    const yaEditado = conTextosDeTienda(docConHeroVacio(), {
      heroTitulo: "Título escrito en el EDITOR",
      heroSubtitulo: "Subtítulo del EDITOR",
      heroImageUrl: "https://pub.r2.dev/T1/pagina/asset-del-editor",
      avisoTexto: "Aviso del EDITOR",
    });

    const migrado = conTextosDeTienda(yaEditado, COLUMNAS);
    const h = hero(migrado);
    expect(h.titulo).toEqual(runsDeTexto("Título escrito en el EDITOR"));
    expect(h.subtitulo).toEqual(runsDeTexto("Subtítulo del EDITOR"));
    expect(h.imagenUrl).toBe("https://pub.r2.dev/T1/pagina/asset-del-editor");
    expect(migrado.overlays.filter((o) => o.tipo === "aviso_barra")).toHaveLength(1);
  });

  // scripts.migrarTienda.004 — rellena SOLO los huecos (mezcla parcial)
  it("rellena solo los campos ausentes y deja intactos los presentes", () => {
    const soloTitulo = conTextosDeTienda(docConHeroVacio(), {
      heroTitulo: "Solo el título vino del editor",
      heroSubtitulo: null,
      heroImageUrl: null,
      avisoTexto: null,
    });

    const migrado = conTextosDeTienda(soloTitulo, COLUMNAS);
    const h = hero(migrado);
    expect(h.titulo).toEqual(runsDeTexto("Solo el título vino del editor")); // NO pisado
    expect(h.subtitulo).toEqual(runsDeTexto("Libros con humor")); // hueco rellenado
    expect(h.imagenUrl).toBe("https://pub.r2.dev/T1/branding/hero?v=1"); // hueco rellenado
  });

  // scripts.migrarTienda.005 — columnas vacías/nulas ⇒ documento intacto (no ensucia)
  it("sin nada que migrar devuelve el documento intacto", () => {
    const doc = docConHeroVacio();
    const migrado = conTextosDeTienda(doc, {
      heroTitulo: null,
      heroSubtitulo: "   ", // solo espacios: no es contenido
      heroImageUrl: null,
      avisoTexto: null,
    });
    expect(migrado).toEqual(doc);
  });

  // scripts.migrarTienda.006 — documento SIN hero (el Organizador lo borró) ⇒ no lo re-crea
  it("si el documento no tiene hero, no lo inventa (respeta lo que el Organizador armó)", () => {
    const sinHero = PageDocumentSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      root: { props: {} },
      secciones: [
        {
          id: "sec-cat",
          tipo: "catalogo",
          v: WIDGET_REGISTRY.catalogo.v,
          props: { ...WIDGET_REGISTRY.catalogo.defaultProps },
        },
      ],
      overlays: [],
    });
    const migrado = conTextosDeTienda(sinHero, COLUMNAS);
    expect(migrado.secciones.some((s) => s.tipo === "hero")).toBe(false);
    // El aviso SÍ se migra igual (es un overlay, no depende del hero).
    expect(migrado.overlays.filter((o) => o.tipo === "aviso_barra")).toHaveLength(1);
  });
});
