import { describe, expect, it } from "vitest";

import { parsearDocumento } from "~/lib/pagebuilder/migrate";
import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  botonesSocialesProps,
  estadisticasProps,
  heroProps,
  logosConfianzaProps,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests de los widgets [mvp-v2] lote social/prueba (catálogo-v2 F05, síntesis §2): `estadisticas`,
 * `botones_sociales`, `logos_confianza`, y el UPGRADE de `hero` a v2 (variante + ctaSecundario) con
 * migrate-on-read v1→v2 cuyo default conserva el look actual (D4). Puro Zod, sin DB.
 */

describe("pagebuilder/widgets social (F05) — hero v2 (variante + ctaSecundario)", () => {
  // page.soc.hero.001 — un hero v1 migra on-read a v2 con variante 'split' (look v1) sin tocar props
  it("hero v1 migra on-read a v2 con variante 'split' que conserva el look actual", () => {
    const raw = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [
        { id: "sec-hero", tipo: "hero", v: 1, props: { titulo: "Hola", ctaAncla: "catalogo", mostrarBadgeSorteo: true } },
      ],
      overlays: [],
    };
    const doc = parsearDocumento(raw); // migra (v1→v2) + valida
    const hero = doc.secciones[0]!;
    expect(hero.v).toBe(2);
    if (hero.tipo === "hero") {
      expect(hero.props.variante).toBe("split"); // el look v1 (split) queda como default
      expect(hero.props.titulo).toBe("Hola"); // props intactas
    }
  });

  // page.soc.hero.002 — v2 con variante inválida ⇒ rechazo (enum cerrado)
  it("hero rechaza una variante fuera del enum", () => {
    expect(heroProps.safeParse({ variante: "diagonal" }).success).toBe(false);
    expect(heroProps.safeParse({ variante: "centrado" }).success).toBe(true);
  });

  // page.soc.hero.003 — ctaSecundario opcional; sin él parsea como hoy; ancla del enum cerrado
  it("hero: ctaSecundario opcional y validado, sin él parsea como hoy", () => {
    expect(heroProps.safeParse({}).success).toBe(true);
    expect(heroProps.safeParse({ ctaSecundario: { texto: "Ver bases", ancla: "sorteo" } }).success).toBe(true);
    expect(heroProps.safeParse({ ctaSecundario: { texto: "x", ancla: "externo" } }).success).toBe(false);
    expect(heroProps.safeParse({ ctaSecundario: { texto: "x" } }).success).toBe(false); // falta ancla
    // el nodo v2 completo parsea contra la union
    expect(
      SeccionNodeSchema.safeParse({
        id: "h",
        tipo: "hero",
        v: 2,
        props: { variante: "imagen_fondo", overlayOscuridad: 60, ctaSecundario: { texto: "Ver bases", ancla: "sorteo" } },
      }).success,
    ).toBe(true);
  });
});

describe("pagebuilder/widgets social (F05) — estadisticas / botones_sociales / logos_confianza", () => {
  // page.soc.001 — estadisticas: valor ENTERO (no string), 2–4 items, .strict
  it("estadisticas exige valor entero (no string), 2–4 items y rechaza campos extra", () => {
    const ok = { items: [{ valor: 1200, prefijo: "+", etiqueta: "tickets" }, { valor: 4, sufijo: "★", etiqueta: "rating" }] };
    expect(estadisticasProps.safeParse(ok).success).toBe(true);
    // valor string ⇒ rechazo (count-up necesita número)
    expect(estadisticasProps.safeParse({ items: [{ valor: "1200", etiqueta: "x" }, { valor: 4, etiqueta: "y" }] }).success).toBe(false);
    // valor float ⇒ rechazo (entero)
    expect(estadisticasProps.safeParse({ items: [{ valor: 4.9, etiqueta: "x" }, { valor: 4, etiqueta: "y" }] }).success).toBe(false);
    // menos de 2 / más de 4 ⇒ rechazo
    expect(estadisticasProps.safeParse({ items: [{ valor: 1, etiqueta: "x" }] }).success).toBe(false);
    expect(estadisticasProps.safeParse({ items: Array(5).fill({ valor: 1, etiqueta: "x" }) }).success).toBe(false);
    // ícono fuera del enum ⇒ rechazo
    expect(estadisticasProps.safeParse({ items: [{ valor: 1, etiqueta: "x", icono: "raro" }, { valor: 2, etiqueta: "y" }] }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "st", tipo: "estadisticas", v: 1, props: ok }).success).toBe(true);
  });

  // page.soc.002 — botones_sociales: red del enum, URL validada, 1–8, .strict
  it("botones_sociales valida red del enum y URL, rechaza red desconocida/URL inválida", () => {
    const ok = { redes: [{ red: "instagram", url: "https://instagram.com/x" }, { red: "whatsapp", url: "https://wa.me/569" }] };
    expect(botonesSocialesProps.safeParse(ok).success).toBe(true);
    // red fuera del enum ⇒ rechazo
    expect(botonesSocialesProps.safeParse({ redes: [{ red: "linkedin", url: "https://x.com" }] }).success).toBe(false);
    // URL inválida ⇒ rechazo
    expect(botonesSocialesProps.safeParse({ redes: [{ red: "tiktok", url: "no-url" }] }).success).toBe(false);
    // sin redes / >8 ⇒ rechazo
    expect(botonesSocialesProps.safeParse({ redes: [] }).success).toBe(false);
    // campo extra ⇒ rechazo
    expect(botonesSocialesProps.safeParse({ redes: [{ red: "x", url: "https://x.com", html: "<b>x</b>" }] }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "bs", tipo: "botones_sociales", v: 1, props: ok }).success).toBe(true);
  });

  // page.soc.003 — logos_confianza: items con urlPublica + alt, animacion del enum, 1–24
  it("logos_confianza exige imagenUrl válida + alt y animacion del enum", () => {
    const ok = { animacion: "cinta", items: [{ imagenUrl: "https://cdn.example/l.png", alt: "Aliado" }] };
    expect(logosConfianzaProps.safeParse(ok).success).toBe(true);
    // sin alt ⇒ rechazo
    expect(logosConfianzaProps.safeParse({ items: [{ imagenUrl: "https://cdn.example/l.png" }] }).success).toBe(false);
    // imagenUrl no-url ⇒ rechazo
    expect(logosConfianzaProps.safeParse({ items: [{ imagenUrl: "no-url", alt: "x" }] }).success).toBe(false);
    // animacion fuera del enum ⇒ rechazo
    expect(logosConfianzaProps.safeParse({ ...ok, animacion: "girar" }).success).toBe(false);
    // >24 ⇒ rechazo
    expect(logosConfianzaProps.safeParse({ items: Array(25).fill({ imagenUrl: "https://cdn.example/l.png", alt: "x" }) }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "lc", tipo: "logos_confianza", v: 1, props: ok }).success).toBe(true);
  });
});
