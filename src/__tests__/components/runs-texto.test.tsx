import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RunsTexto,
  estiloMarcasRun,
  hrefDestino,
} from "~/components/storefront/runs-texto";
import { type RichTexto } from "~/lib/pagebuilder/widgets";

/**
 * Tests del render del motor de RUNS (Tanda 3 F01/D2). `RunsTexto` mapea marcas → estilo por TOKEN y
 * links → `<a>` seguro, JAMÁS HTML del tenant ni hex (I-U1/I-A). `renderToStaticMarkup` (env node):
 * `RunsTexto` devuelve spans/anchors puros sin provider Mantine.
 */

/** `true` sii el string contiene un hex de color — PROHIBIDO en el documento (I-A). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

const render = (rico: RichTexto) => renderToStaticMarkup(createElement(RunsTexto, { rico }));

describe("runs-texto — estiloMarcasRun (helper puro)", () => {
  // page.runs.render.001 — cada marca resuelve a su estilo por token, sin hex
  it("mapea cada marca a su estilo por token (peso/itálica/acento/resaltado/escala), sin hex", () => {
    expect(estiloMarcasRun(["fuerte"]).fontWeight).toBe(700);
    expect(estiloMarcasRun(["enfasis"]).fontStyle).toBe("italic");
    expect(estiloMarcasRun(["acento"]).color).toContain("--mantine-color-acento-filled");
    expect(estiloMarcasRun(["acento"]).color).toContain("--mantine-primary-color-filled"); // fallback marca
    const resaltado = estiloMarcasRun(["resaltado"]);
    expect(resaltado.backgroundImage).toContain("linear-gradient");
    expect(resaltado.boxDecorationBreak).toBe("clone");
    // escala en em (relativa, jamás px); xl gana sobre lg
    expect(estiloMarcasRun(["escala_lg"]).fontSize).toBe("1.15em");
    expect(estiloMarcasRun(["escala_xl"]).fontSize).toBe("1.35em");
    expect(estiloMarcasRun(["escala_lg", "escala_xl"]).fontSize).toBe("1.35em");
    // sin marcas ⇒ estilo vacío
    expect(estiloMarcasRun(undefined)).toEqual({});
    // ninguna combinación emite un hex
    for (const combo of [["fuerte"], ["acento"], ["resaltado"], ["escala_xl"]] as const) {
      expect(tieneHex(JSON.stringify(estiloMarcasRun([...combo])))).toBe(false);
    }
  });
});

describe("runs-texto — hrefDestino (helper puro)", () => {
  // page.runs.render.002 — los 3 tipos de destino resuelven a su href seguro
  it("resuelve ancla→#, pagina→/slug, url→href https", () => {
    expect(hrefDestino({ tipo: "ancla", ancla: "catalogo" })).toBe("#catalogo");
    expect(hrefDestino({ tipo: "pagina", slug: "sobre-mi" })).toBe("/sobre-mi");
    expect(hrefDestino({ tipo: "url", url: "https://ejemplo.cl/x" })).toBe("https://ejemplo.cl/x");
  });
});

describe("runs-texto — render por spans", () => {
  // page.runs.render.003 — un run con acento + resaltado se pinta con tokens en su span, sin hex
  it("renderiza un run con acento+resaltado como span de tokens (cero hex, cero HTML del tenant)", () => {
    const html = render({
      children: [
        { t: "Compra el " },
        { t: "libro", m: ["acento", "resaltado"] },
      ],
    });
    expect(html).toContain("Compra el ");
    expect(html).toContain("libro");
    expect(html).toContain("--mantine-color-acento-filled");
    expect(html.toLowerCase()).toContain("background-image:linear-gradient");
    expect(tieneHex(html)).toBe(false);
    // texto plano: el `t` no se interpreta como HTML (nunca dangerouslySetInnerHTML)
    const escapado = render({ children: [{ t: "<b>x</b>" }] });
    expect(escapado).not.toContain("<b>x</b>");
    expect(escapado).toContain("&lt;b&gt;");
  });

  // page.runs.render.004 — link a ancla/pagina: <a> sin target; url externa: target _blank + rel noopener
  it("renderiza links seguros: ancla/pagina sin target, url externa con rel noopener y target _blank", () => {
    const ancla = render({
      children: [{ t: "ver catálogo", link: "l1" }],
      markDefs: [{ id: "l1", destino: { tipo: "ancla", ancla: "catalogo" } }],
    });
    expect(ancla).toContain('href="#catalogo"');
    expect(ancla).not.toContain("target=");

    const pagina = render({
      children: [{ t: "sobre mí", link: "l1" }],
      markDefs: [{ id: "l1", destino: { tipo: "pagina", slug: "sobre-mi" } }],
    });
    expect(pagina).toContain('href="/sobre-mi"');

    const url = render({
      children: [{ t: "mi sitio", link: "l1" }],
      markDefs: [{ id: "l1", destino: { tipo: "url", url: "https://ejemplo.cl" } }],
    });
    expect(url).toContain('href="https://ejemplo.cl"');
    expect(url).toContain('target="_blank"');
    expect(url).toContain("noopener");
    expect(url).toContain("noreferrer");
  });
});
