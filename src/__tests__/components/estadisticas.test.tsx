import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Estadisticas, StatItem } from "~/components/storefront/estadisticas";
import {
  EMOJI_BENEFICIO_MAP,
  emojiBeneficio,
} from "~/components/storefront/iconos-beneficio";
import {
  estadisticasProps,
  ICONOS_BENEFICIO,
  type EstadisticasProps,
} from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

type Item = EstadisticasProps["items"][number];

const renderItem = (item: Item, estiloVisual: EstadisticasProps["estiloVisual"]) =>
  renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(StatItem, { item, estiloVisual })),
  );

/** Renderiza la sección `estadisticas` completa a partir de props crudas (parseadas por el schema). */
const renderSeccion = (raw: unknown) => {
  const nodo = {
    id: "s1",
    tipo: "estadisticas",
    v: 1,
    props: estadisticasProps.parse(raw),
  } as Extract<SeccionNode, { tipo: "estadisticas" }>;
  return renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(Estadisticas, { nodo })),
  );
};

/**
 * Tests de las stat-cards `estadisticas` — foco en el estilo NUEVO `dreamy` (Tanda 2 F17) y en el mapa
 * curado de EMOJIS. Render con `renderToStaticMarkup` (mismo criterio que `titulo-hero.test.tsx`): en SSR
 * el count-up queda en el valor final (I-D) y `useEnPreview`/`useReducedMotion` degradan sin provider.
 * El estilo `dreamy` NO debe alterar el render de `cards`/`simple`/`tarjetas_suaves` (I-H, no-op guard).
 */

/** `true` sii el string contiene un hex de color — PROHIBIDO en el documento (I-A). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

describe("estadisticas — mapa de EMOJIS del set curado (F17)", () => {
  // stats.emoji.001 — el mapa cubre TODO el enum ICONOS_BENEFICIO (jamás emoji libre del tenant, D2);
  // cada glifo es un string no vacío y sin hex; los del prototipo dreamy mapean a 🎟️/⏳/💜.
  it("EMOJI_BENEFICIO_MAP es exhaustivo sobre ICONOS_BENEFICIO y espeja el prototipo", () => {
    for (const nombre of ICONOS_BENEFICIO) {
      const emoji = EMOJI_BENEFICIO_MAP[nombre];
      expect(emoji, `falta emoji para "${nombre}"`).toBeTruthy();
      expect(typeof emoji).toBe("string");
      expect(tieneHex(emoji!)).toBe(false);
    }
    // los 3 del heroviz del prototipo dreamy (mock.ts STATS)
    expect(emojiBeneficio("ticket")).toBe("🎟️");
    expect(emojiBeneficio("reloj")).toBe("⏳");
    expect(emojiBeneficio("corazon")).toBe("💜");
    // desconocido ⇒ fallback estable (no crashea, degrada como iconoBeneficio→IconSparkles)
    expect(emojiBeneficio("__no_existe__")).toBeTruthy();
  });
});

describe("estadisticas — estilo dreamy cierra los 4 diffs del prototipo (F17)", () => {
  const itemUnidad: Item = { valor: 12, sufijo: "días", etiqueta: "para el cierre", icono: "reloj" };
  const itemTicket: Item = { valor: 2480, prefijo: "+", etiqueta: "participando", icono: "ticket" };

  // stats.dreamy.render.001 — diff 1 (emoji), diff 2 (número violeta), diff 4 (card aireada sin borde gris)
  it("dreamy pinta EMOJI del set + número en violeta primario + card aireada (ring blanco, sin borde gris)", () => {
    const html = renderItem(itemTicket, "dreamy");
    // diff 1 — el ícono es el EMOJI curado (no un svg Tabler)
    expect(html).toContain(emojiBeneficio("ticket")); // 🎟️
    // diff 2 — el número va en el token del primario (violeta), no en tinta
    expect(html).toContain("--mantine-primary-color-filled");
    // diff 4 — card SIN el borde gris de `tarjetas_suaves`; ring blanco/airy + sombra suave
    expect(html).not.toContain("--mantine-color-default-border");
    expect(html).toContain("--mantine-shadow-sm");
    expect(html).toContain("--mantine-color-white"); // ring blanco (light-dark)
    expect(tieneHex(html)).toBe(false); // cero hex (I-A)
  });

  // stats.dreamy.render.002 — diff 3 (unidad INLINE en el número, mismo tamaño/color, no demotada al label)
  it("dreamy mete la unidad INLINE en el número coloreado, no en la etiqueta", () => {
    const html = renderItem(itemUnidad, "dreamy");
    const idxLabel = html.indexOf("st-stat-label");
    expect(idxLabel).toBeGreaterThan(-1);
    const parteValor = html.slice(0, idxLabel); // todo lo que va ANTES de la etiqueta = el bloque del número
    expect(parteValor).toContain("12"); // el número
    expect(parteValor).toContain("días"); // la unidad, JUNTO al número (no en el label)
    expect(parteValor).toContain("--mantine-primary-color-filled"); // mismo color violeta
    // la etiqueta ("para el cierre") va DESPUÉS, en el label dimmed — sin la unidad
    expect(html.slice(idxLabel)).toContain("para el cierre");
  });

  // stats.dreamy.noop.001 — el estilo nuevo NO altera cards/simple/tarjetas_suaves (I-H, byte-idénticas)
  it("cards/simple/tarjetas_suaves NO usan emoji y conservan su render (no-op)", () => {
    const cards = renderItem(itemTicket, "cards");
    const simple = renderItem(itemTicket, "simple");
    const suaves = renderItem(itemTicket, "tarjetas_suaves");
    // ninguno de los estilos viejos pinta el emoji del set (usan ThemeIcon/Tabler o nada)
    for (const html of [cards, simple, suaves]) {
      expect(html).not.toContain(emojiBeneficio("ticket"));
    }
    // `tarjetas_suaves` conserva su borde gris (el diff 4 que `dreamy` corrige) ⇒ byte-idéntico
    expect(suaves).toContain("--mantine-color-default-border");
    // `cards` NO envuelve en tarjeta (sin borde) — su render previo intacto
    expect(cards).not.toContain("--mantine-color-default-border");
  });

  // stats.dreamy.notapie.001 — la nota al pie se pinta bajo el grid cuando está; ausente ⇒ no aparece (no-op)
  it("notaPie se renderiza bajo el grid; ausente ⇒ no se pinta (no-op I-H)", () => {
    const items = [
      { valor: 2480, prefijo: "+", etiqueta: "participando", icono: "ticket" },
      { valor: 12, sufijo: "días", etiqueta: "para el cierre", icono: "reloj" },
    ];
    const conNota = renderSeccion({ estiloVisual: "dreamy", notaPie: "Cifras de ejemplo", items });
    expect(conNota).toContain("Cifras de ejemplo");
    const sinNota = renderSeccion({ estiloVisual: "dreamy", items });
    expect(sinNota).not.toContain("Cifras de ejemplo");
  });
});
