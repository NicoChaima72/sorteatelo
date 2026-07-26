import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GarantiasSorteo } from "~/components/storefront/garantias-sorteo";
import { garantiasSorteoProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * Render de `garantias_sorteo` — estilo NUEVO `dreamy` (builder-dreamy-secciones F02/D5) + GUARD NO-OP del
 * `clasico` (I2). D5 manda RE-SKIN, no cambio de modelo: siguen siendo N cards del grid con su ícono del
 * enum; lo que cambia es la superficie (translúcida con ring blanco en vez del `withBorder` gris) y la
 * FORMA de la caja del ícono (círculo relleno suave en vez del cuadrado `radius="md"`).
 */

const ITEMS = [
  { icono: "escudo", titulo: "Sorteo en vivo", desc: "Por Instagram, con testigos." },
  { icono: "verificado", titulo: "Acta firmada", desc: "Publicamos el acta de cada sorteo." },
];

const render = (raw: unknown) => {
  const nodo = {
    id: "gs",
    tipo: "garantias_sorteo",
    v: 1,
    props: garantiasSorteoProps.parse(raw),
  } as Extract<SeccionNode, { tipo: "garantias_sorteo" }>;
  return renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(GarantiasSorteo, { nodo })),
  );
};

/** `true` sii el string contiene un hex de color — PROHIBIDO en el componente (I1). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

describe("garantias_sorteo — estiloVisual dreamy (F02)", () => {
  const base = {
    titulo: "Sorteo 100% transparente",
    metodo: "Elegimos al ganador en vivo por Instagram.",
    items: ITEMS,
  };

  // gs.dreamy.render.001 — las cards del grid pasan a translúcidas con ring blanco: fuera el `withBorder`
  // gris de Mantine (que se renderiza como `data-with-border`), cero hex.
  it("dreamy pinta las cards translúcidas con ring blanco (sin el borde gris del withBorder)", () => {
    const html = render({ ...base, estiloVisual: "dreamy" });

    expect(html).not.toContain("data-with-border");
    expect(html).toContain("--mantine-color-white"); // ring blanco (light-dark)
    expect(html).toContain("--mantine-radius-lg");
    expect(tieneHex(html)).toBe(false);
  });

  // gs.dreamy.render.002 — el ícono de CADA item (y el del header) va en un círculo relleno SUAVE: la caja
  // `light` conserva el tinte del primario pero el radio pasa de `md` (cuadrada) a `xl` (círculo).
  it("dreamy pone cada ícono en círculo relleno suave del primario", () => {
    const html = render({ ...base, estiloVisual: "dreamy" });

    // header (IconScale) + un ícono por item, TODOS en círculo y todos con el tinte suave (`light`)
    const circulos = html.match(/--ti-radius:var\(--mantine-radius-xl\)/g) ?? [];
    expect(circulos).toHaveLength(ITEMS.length + 1);
    expect(html).not.toContain("--ti-radius:var(--mantine-radius-md)");
    const variantes = html.match(/data-variant="light"/g) ?? [];
    expect(variantes).toHaveLength(ITEMS.length + 1);

    // el modelo de contenido NO cambió (I5): siguen los N items con su ícono Tabler, título y desc
    expect(html.match(/tabler-icon-/g) ?? []).toHaveLength(ITEMS.length + 1);
    expect(html).toContain("Acta firmada");
    expect(html).toContain("Elegimos al ganador en vivo por Instagram.");
  });

  // gs.dreamy.noop.001 — GUARD I2: el doc PREVIO (sin la prop) renderea byte-idéntico al `clasico`
  // explícito, y `clasico` conserva sus rasgos (borde gris + caja de ícono cuadrada).
  it("guard no-op: doc sin la prop == clasico, que conserva borde e ícono cuadrado", () => {
    expect(render(base)).toBe(render({ ...base, estiloVisual: "clasico" }));

    const clasico = render({ ...base, estiloVisual: "clasico" });
    expect(clasico).toContain('data-with-border="true"');
    expect(clasico).toContain("--ti-radius:var(--mantine-radius-md)");
    expect(clasico).not.toContain("--ti-radius:var(--mantine-radius-xl)");
  });
});
