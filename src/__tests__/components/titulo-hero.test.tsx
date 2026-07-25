import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TituloHero,
  partirEnPalabras,
  textoPlanoDeRuns,
} from "~/components/storefront/titulo-hero";
import { heroProps, type RichTexto } from "~/lib/pagebuilder/widgets";

/**
 * Tests del título del hero sobre RUNS (Tanda 3 F02/D4). El título es un `RichTexto`; el viejo
 * `tituloAcento` fue absorbido en un run con su marca (la migración v2→v3 lo hace, ver runs.test.ts).
 * `TituloHero` renderiza runs con marcas por token (I-A), efectos SSR-visibles (I-D) y reduced-motion-safe.
 * Todo con `renderToStaticMarkup` (env node): `TituloHero` devuelve spans puros sin provider Mantine.
 */

/** `true` sii el string contiene un hex de color — PROHIBIDO en el documento (I-A). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

const render = (titulo: RichTexto, efecto: "ninguno" | "revelar_palabras" | "gradiente_animado") =>
  renderToStaticMarkup(createElement(TituloHero, { titulo, efecto }));

describe("hero.schema — titulo/subtitulo son RichTexto; tituloAcento ya no existe (v3)", () => {
  // hero.schema.001 — un hero mínimo parsea; titulo/subtitulo ausentes; el campo tituloAcento se fue.
  it("hero mínimo parsea y titulo/subtitulo caen a undefined; tituloAcento removido del schema", () => {
    const p = heroProps.parse({});
    expect(p.titulo).toBeUndefined();
    expect(p.subtitulo).toBeUndefined();
    expect("tituloAcento" in p).toBe(false);
    // un `tituloAcento` crudo ya NO parsea (se migra ANTES, on-read)
    expect(heroProps.safeParse({ tituloAcento: { palabra: "X", estilo: "acento" } }).success).toBe(false);
  });

  // hero.schema.002 — titulo acepta RichTexto con marcas/links; texto plano string ⇒ rechazo (migra antes)
  it("titulo acepta RichTexto y rechaza un string plano (que se migra on-read)", () => {
    expect(heroProps.safeParse({ titulo: { children: [{ t: "Hola", m: ["acento"] }] } }).success).toBe(true);
    expect(heroProps.safeParse({ titulo: "Hola plano" }).success).toBe(false);
    // efectoTitulo sigue como prop del <Title> (no del contenido)
    expect(heroProps.parse({}).efectoTitulo).toBe("ninguno");
  });
});

describe("hero.render — TituloHero renderiza runs con marcas por token (efecto ninguno)", () => {
  // hero.render.001 — un run con acento se pinta con el token de acento (fallback marca), sin hex
  it("run con acento ⇒ span con token de acento (cero hex)", () => {
    const html = render(
      { children: [{ t: "Vas a " }, { t: "ENRIQUECER", m: ["acento"] }, { t: " tu vida" }] },
      "ninguno",
    );
    expect(html).toContain("ENRIQUECER");
    expect(html).toContain("Vas a ");
    expect(html).toContain("tu vida");
    expect(html).toContain("--mantine-color-acento-filled");
    expect(html).toContain("--mantine-primary-color-filled"); // fallback a marca (I-T2)
    expect(tieneHex(html)).toBe(false);
  });

  // hero.render.002 — estilo `marca`: la palabra en el color del PRIMARIO (no acento)
  it("run con marca ⇒ token del primario, sin el token de acento", () => {
    const html = render({ children: [{ t: "Anda a ver a " }, { t: "BTS", m: ["marca"] }] }, "ninguno");
    expect(html).toContain("BTS");
    expect(html).toContain("--mantine-primary-color-filled");
    expect(html).not.toContain("--mantine-color-acento-filled");
    expect(tieneHex(html)).toBe(false);
  });

  // hero.render.003 — `resaltado` = destacador como background del propio span (nunca capa aparte)
  it("run con resaltado ⇒ background-image en el propio span con box-decoration-break clone", () => {
    const html = render({ children: [{ t: "que te " }, { t: "ENRIQUECE", m: ["resaltado"] }] }, "ninguno");
    expect(html).toMatch(/background-image:\s*linear-gradient/i);
    expect(html.toLowerCase()).toContain("box-decoration-break:clone");
    expect(html).not.toContain("z-index");
    expect(tieneHex(html)).toBe(false);
  });

  // hero.render.004 — `gradiente` = texto con background-clip:text + color transparente
  it("run con gradiente ⇒ background-clip:text y color transparente", () => {
    const html = render({ children: [{ t: "ENRIQUECER", m: ["gradiente"] }] }, "ninguno");
    expect(html.toLowerCase()).toContain("background-clip:text");
    expect(html.toLowerCase()).toContain("color:transparent");
    expect(tieneHex(html)).toBe(false);
  });
});

describe("hero.reveal — efectos SSR-visibles (I-D) y reduced-motion-safe", () => {
  // hero.reveal.001 — revelar_palabras: título COMPLETO y VISIBLE (nunca opacity:0), acento coloreado
  it("revelar_palabras deja el título completo VISIBLE con delay escalonado y el run del acento coloreado", () => {
    const html = render(
      { children: [{ t: "Vas a " }, { t: "ENRIQUECER", m: ["acento"] }, { t: " tu vida hoy" }] },
      "revelar_palabras",
    );
    for (const palabra of ["Vas", "ENRIQUECER", "tu", "vida", "hoy"]) {
      expect(html).toContain(palabra);
    }
    expect(html.toLowerCase()).not.toContain("opacity:0");
    expect(html).toContain("animar-revelar-palabra");
    expect(html.toLowerCase()).toContain("animation-delay");
    expect(html).toContain("--mantine-color-acento-filled"); // el run del acento conserva su token
  });

  // hero.reveal.002 — gradiente_animado: título visible con la clase de posición, texto plano extraído
  it("gradiente_animado deja el título plano visible con animar-holo y background-clip", () => {
    const html = render(
      { children: [{ t: "Compra el libro. " }, { t: "Anda a ver a BTS", m: ["gradiente"] }] },
      "gradiente_animado",
    );
    expect(html).toContain("Compra el libro. Anda a ver a BTS"); // texto plano concatenado
    expect(html).toContain("animar-holo");
    expect(html.toLowerCase()).toContain("background-clip:text");
    expect(html.toLowerCase()).not.toContain("opacity:0");
    expect(tieneHex(html)).toBe(false);
  });
});

describe("hero.helpers — funciones puras", () => {
  // hero.helpers.001 — partirEnPalabras conserva los espacios intercalados
  it("partirEnPalabras conserva los espacios como tokens", () => {
    expect(partirEnPalabras("a  b c")).toEqual(["a", "  ", "b", " ", "c"]);
  });

  // hero.helpers.002 — textoPlanoDeRuns concatena los runs (para el gradiente animado)
  it("textoPlanoDeRuns concatena los runs en el texto plano exacto", () => {
    expect(textoPlanoDeRuns({ children: [{ t: "Hola " }, { t: "mundo", m: ["acento"] }] })).toBe("Hola mundo");
  });
});
