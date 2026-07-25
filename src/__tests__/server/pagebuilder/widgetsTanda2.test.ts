import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  heroProps,
  imagenDestacadaProps,
  vitrinaProximamenteProps,
  WIDGET_META,
  WIDGET_REGISTRY,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests de los widgets/props NUEVOS de la Tanda 2 de fidelidad (los 6 gaps del feature-tester de la
 * Tanda 1). Verifican el CHECKLIST INVARIANTE: props `.strict()` (rechazo de HTML/campo extra), enums
 * cerrados, límites de cantidad/longitud, migración no-op (defaults = look actual), y que el nodo
 * parsea contra la union de secciones. Puro Zod, sin DB. El render (grayscale/candado/holocard) y la
 * fidelidad visual se validan en runtime/E2E (F09/F10).
 */

describe("pagebuilder/tanda2 (F01) — vitrina_proximamente (lanzamientos bloqueados)", () => {
  // page.tanda2.vitrina.001 — valida titulo/columnas/items/notaPie, límites y .strict()
  it("vitrina_proximamente valida items 1–8, textos con límite y rechaza campos extra", () => {
    const ok = {
      titulo: "Un libro a la vez",
      columnas: 3,
      items: [
        { titulo: "I. Claude", subtitulo: "Próximamente", imagenUrl: "https://cdn.example/1.jpg" },
        { titulo: "Rezado" },
      ],
      notaPie: "Publicamos un libro por temporada.",
    };
    expect(vitrinaProximamenteProps.safeParse(ok).success).toBe(true);
    // solo items (titulo/notaPie/columnas opcionales-con-default)
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "Uno" }] }).success).toBe(true);
    // 0 items / más de 8 ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ items: [] }).success).toBe(false);
    expect(
      vitrinaProximamenteProps.safeParse({ items: Array(9).fill({ titulo: "x" }) }).success,
    ).toBe(false);
    // titulo item >60 / subtitulo >80 / titulo sección >80 ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "x".repeat(61) }] }).success).toBe(false);
    expect(
      vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok", subtitulo: "x".repeat(81) }] }).success,
    ).toBe(false);
    expect(vitrinaProximamenteProps.safeParse({ titulo: "x".repeat(81), items: [{ titulo: "ok" }] }).success).toBe(false);
    // notaPie >120 ⇒ rechazo
    expect(
      vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok" }], notaPie: "x".repeat(121) }).success,
    ).toBe(false);
    // columnas fuera de {2,3,4} ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ columnas: 5, items: [{ titulo: "ok" }] }).success).toBe(false);
    // imagenUrl no-url ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok", imagenUrl: "no-url" }] }).success).toBe(false);
    // HTML/campo extra ⇒ rechazo (.strict, en item y en el widget)
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok", html: "<b>x</b>" }] }).success).toBe(false);
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok" }], html: "<b>x</b>" }).success).toBe(false);
  });

  // page.tanda2.vitrina.002 — el nodo parsea contra la union; está en el registro + WIDGET_META; defaultProps parsea
  it("el nodo vitrina_proximamente parsea contra la union y está en el registro/meta", () => {
    const nodo = { id: "vp", tipo: "vitrina_proximamente", v: 1, props: { items: [{ titulo: "Uno" }] } };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
    // registro: defaultProps parsea contra su propio schema
    const def = WIDGET_REGISTRY.vitrina_proximamente;
    expect(def.categoria).toBe("seccion");
    expect(def.propsSchema.safeParse(def.defaultProps).success).toBe(true);
    // metadata display existe y no es el tipo crudo
    expect(WIDGET_META.vitrina_proximamente.titulo.trim().length).toBeGreaterThan(0);
    expect(WIDGET_META.vitrina_proximamente.titulo).not.toBe("vitrina_proximamente");
  });
});

describe("pagebuilder/tanda2 (F02) — hero split visual configurable", () => {
  // page.tanda2.herovisual.001 — visual imagen/tarjeta parsea; sin visual (no-op) parsea; ramas inválidas rechazan
  it("heroProps.visual valida imagen/tarjeta, es opcional (no-op) y rechaza ramas inválidas", () => {
    const base = { titulo: "Hola" };
    // sin visual: un hero previo parsea igual (no-op)
    expect(heroProps.safeParse(base).success).toBe(true);
    // visual imagen
    expect(
      heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://cdn.example/x.jpg", holo: true } }).success,
    ).toBe(true);
    // visual tarjeta (holocard SIN imagen, con título/ícono dentro)
    expect(
      heroProps.safeParse({
        ...base,
        visual: { tipo: "tarjeta", titulo: "PDF descargable", subtitulo: "ES / EN", icono: "descarga", holo: true },
      }).success,
    ).toBe(true);
    // tarjeta mínima (solo titulo)
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "Solo" } }).success).toBe(true);
    // tipo desconocido ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "video", url: "https://x.co" } }).success).toBe(false);
    // imagen sin url / url inválida ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen" } }).success).toBe(false);
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "no-url" } }).success).toBe(false);
    // tarjeta con icono fuera de ICONOS_BENEFICIO ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "ok", icono: "unicornio" } }).success).toBe(false);
    // tarjeta titulo >60 / subtitulo >80 ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "x".repeat(61) } }).success).toBe(false);
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "ok", subtitulo: "x".repeat(81) } }).success).toBe(false);
    // campo extra en la rama ⇒ rechazo (.strict)
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://x.co", css: "x" } }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F03) — ancho card en imagen_destacada", () => {
  // page.tanda2.ancho.001 — el enum ancho gana `card`; default sigue `contenido`; no-op v1
  it("imagen_destacada.ancho acepta card|contenido|completo, default contenido (no-op)", () => {
    const base = { imagenUrl: "https://cdn.example/x.jpg", alt: "Una imagen" };
    // v1 sin ancho ⇒ default contenido (no-op)
    expect(imagenDestacadaProps.parse(base).ancho).toBe("contenido");
    for (const ancho of ["card", "contenido", "completo"] as const) {
      expect(imagenDestacadaProps.safeParse({ ...base, ancho }).success).toBe(true);
    }
    // valor fuera del enum ⇒ rechazo
    expect(imagenDestacadaProps.safeParse({ ...base, ancho: "gigante" }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F04) — eyebrowEstilo del hero", () => {
  // page.tanda2.eyebrow.001 — eyebrowEstilo default marca; acepta acento/texto; no-op v1
  it("heroProps.eyebrowEstilo default marca, acepta acento/texto, rechaza fuera del enum", () => {
    const base = { titulo: "Hola" };
    // sin el campo ⇒ default marca (no-op)
    expect(heroProps.parse(base).eyebrowEstilo).toBe("marca");
    for (const est of ["marca", "acento", "texto"] as const) {
      expect(heroProps.safeParse({ ...base, eyebrowEstilo: est }).success).toBe(true);
    }
    expect(heroProps.safeParse({ ...base, eyebrowEstilo: "neon" }).success).toBe(false);
  });
});
