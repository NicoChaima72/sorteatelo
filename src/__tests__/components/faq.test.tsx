import { MantineProvider } from "@mantine/core";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Faq } from "~/components/storefront/faq";
import { faqProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * Render de `faq` — estilo NUEVO `dreamy` (builder-dreamy-secciones F03/D3) + GUARD NO-OP del `clasico`
 * (I2). Lo que hace especial a esta feature es I3: el `Accordion` de Mantine se MANTIENE (semántica y
 * accesibilidad intactas) y el re-skin va por Styles API sobre sus data-attributes nativos. La rotación de
 * 45° del `＋` no vive en el HTML sino en `globals.css`, así que se testea la ATADURA de los dos lados:
 * el HTML lleva la clase y el CSS tiene la regla — si alguien renombra una, el test cae.
 */

const ITEMS = [
  { pregunta: "¿Cómo participo del sorteo?", respuesta: "Comprando cualquier libro de la tienda." },
  { pregunta: "¿Cuándo recibo mi descarga?", respuesta: "Al instante, apenas se confirma el pago." },
];

const render = (raw: unknown) => {
  const nodo = {
    id: "fq",
    tipo: "faq",
    v: 1,
    props: faqProps.parse(raw),
  } as Extract<SeccionNode, { tipo: "faq" }>;
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(Faq, { nodo })));
};

/** `true` sii el string contiene un hex de color — PROHIBIDO en el componente (I1). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

/** El glifo del prototipo: PLUS de ancho completo (U+FF0B), no el `+` ASCII. */
const MAS = "＋";

describe("faq — estiloVisual dreamy (F03)", () => {
  const base = { titulo: "Preguntas frecuentes", items: ITEMS };

  // faq.dreamy.render.001 — items como cards translúcidas con ring blanco, radio generoso y cero hex.
  it("dreamy pinta los items como cards translúcidas con ring blanco", () => {
    const html = render({ ...base, estiloVisual: "dreamy" });

    expect(html).toContain("--mantine-color-white"); // ring blanco (light-dark)
    expect(html).toContain("--mantine-radius-lg");
    expect(tieneHex(html)).toBe(false);
    // el contenido sigue completo (I5: `items` sin cambios de shape)
    expect(html).toContain("¿Cuándo recibo mi descarga?");
    expect(html).toContain("Al instante, apenas se confirma el pago.");
  });

  // faq.dreamy.render.002 — el chevron default de Mantine (un svg) se reemplaza por el glifo `＋` en el
  // color primario, uno por item.
  it("dreamy reemplaza el chevron svg por el glifo ＋ en color primario", () => {
    const html = render({ ...base, estiloVisual: "dreamy" });

    expect(html.match(new RegExp(MAS, "g")) ?? []).toHaveLength(ITEMS.length);
    expect(html).not.toContain("<svg"); // fuera el chevron svg de Mantine
    expect(html).toContain("--mantine-primary-color-filled");
  });

  // faq.dreamy.render.003 — la ROTACIÓN es de 45° (no los 180° del default de Mantine) y la regla está
  // ATADA al HTML: la clase que el componente pone en el chevron es la misma que la regla de `globals.css`
  // apunta con el `[data-rotate]` nativo del Accordion.
  it("la rotación del ＋ es de 45° y su clase está atada a la regla de globals.css", () => {
    const html = render({ ...base, estiloVisual: "dreamy" });
    const css = readFileSync("src/styles/globals.css", "utf8");

    const clase = "st-faq-dreamy-chevron";
    // (a) la clase va en el PROPIO elemento chevron de Mantine — el mismo que Mantine marca con
    //     `data-rotate` al abrir. Si el glifo se envolviera en un span propio, la clase caería en otro
    //     nodo, el `[data-rotate]` nunca la alcanzaría y la regla de abajo sería CSS muerto.
    expect(html).toMatch(new RegExp(`class="${clase}[^"]*mantine-Accordion-chevron`));
    // (b) y el CSS rota esa clase 45°, no los 180° del default de Mantine
    const regla = new RegExp(`\\.${clase}\\[data-rotate\\][^}]*transform:\\s*rotate\\(45deg\\)`);
    expect(css).toMatch(regla);
    expect(css).not.toMatch(new RegExp(`\\.${clase}\\[data-rotate\\][^}]*rotate\\(180deg\\)`));
  });

  // faq.dreamy.a11y.001 — I3: sigue siendo el `Accordion` de Mantine. Los controles son BOTONES accesibles
  // con su panel asociado por `aria-controls`/`aria-labelledby` — nada reimplementado a mano.
  it("dreamy conserva el Accordion de Mantine (botones accesibles + panel asociado)", () => {
    const html = render({ ...base, estiloVisual: "dreamy" });

    expect(html.match(/data-accordion-control/g) ?? []).toHaveLength(ITEMS.length);
    expect(html.match(/aria-expanded=/g) ?? []).toHaveLength(ITEMS.length);
    expect(html).toContain("aria-controls=");
    expect(html).toContain("mantine-Accordion-item");
    expect(html).toContain("<button");

    // El glifo vive DENTRO del `<button>` del control. El svg que reemplaza era mudo para el nombre
    // accesible, pero un nodo de TEXTO no lo es: sin `aria-hidden` cada pregunta se anunciaría como
    // "＋ ¿Cómo participo del sorteo?". Se exige uno por item.
    expect(html.match(new RegExp(`aria-hidden="true">${MAS}<`, "g")) ?? []).toHaveLength(ITEMS.length);
  });

  // faq.dreamy.noop.001 — GUARD I2: el doc PREVIO (sin la prop) renderea byte-idéntico al `clasico`
  // explícito, que conserva su chevron svg y no adopta nada de la rama nueva.
  it("guard no-op: doc sin la prop == clasico, que conserva su chevron svg", () => {
    expect(render(base)).toBe(render({ ...base, estiloVisual: "clasico" }));

    const clasico = render({ ...base, estiloVisual: "clasico" });
    expect(clasico).toContain("<svg"); // el chevron de siempre
    expect(clasico).not.toContain(MAS);
    expect(clasico).not.toContain("st-faq-dreamy-chevron");
  });
});
