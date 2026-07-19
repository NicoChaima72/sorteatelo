import { type CSSProperties } from "react";
import { describe, expect, it } from "vitest";

import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";
import {
  colorFondoSolido,
  colorSolidoDeEsquema,
  estiloSeccionACss,
  fondoSeccionACss,
} from "~/styles/estiloSeccion";

/**
 * Tests de la resolución PURA `estiloSeccion → CSS` (catálogo-v2 F02/D2, síntesis §3). Espejo de
 * `gradienteTematico`: cero hex inline (todo sale de CSS vars de la escala del tenant), esquemas
 * emparejados (fondo + texto legible), y defaults IDÉNTICOS al render actual cuando el estilo falta.
 */

/** Serializa todos los valores string de un objeto CSS (para inspeccionar tokens/ausencia de hex). */
function valoresCss(css: CSSProperties): string {
  return Object.values(css)
    .filter((v): v is string => typeof v === "string")
    .join(" | ");
}

/** `true` sii el string contiene un hex de color (#rgb / #rrggbb) — PROHIBIDO (I-A). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

const parse = (raw: unknown) => EstiloSeccionSchema.parse(raw);

describe("estiloSeccion — defaults (estilo ausente = render actual)", () => {
  // esc.001 — estilo undefined ⇒ defaults idénticos al render previo (transparente, py L, lg, sin divisor)
  it("estilo ausente resuelve a los defaults históricos", () => {
    const r = estiloSeccionACss(undefined);
    expect(r.fondo).toEqual({}); // transparente ⇒ hereda el fondo de página
    expect(r.py).toEqual({ base: "xl", md: 48 }); // = py={{ base:"xl", md:48 }} histórico
    expect(r.containerSize).toBe("lg"); // = Container size="lg" histórico
    expect(r.divisor).toBeNull();
    expect(r.entrada).toBe("heredar");
  });

  // esc.002 — ancho "completo" ⇒ full-bleed (sin Container)
  it("ancho completo ⇒ containerSize false (full-bleed)", () => {
    expect(estiloSeccionACss(parse({ ancho: "completo" })).containerSize).toBe(false);
    expect(estiloSeccionACss(parse({ ancho: "ancho" })).containerSize).toBe("xl");
  });
});

describe("estiloSeccion — esquemas emparejados (cero hex, texto legible)", () => {
  // esc.003 — cada esquema mapea a tokens de la escala (ningún hex inline)
  it("los esquemas sólidos emiten solo CSS vars/color-mix (cero hex)", () => {
    for (const esquema of [
      "tema",
      "superficie",
      "superficie_alt",
      "marca_suave",
      "marca",
      "marca_profundo",
      "tinta",
    ] as const) {
      const css = fondoSeccionACss({ tipo: "esquema", esquema });
      expect(tieneHex(valoresCss(css)), `esquema ${esquema} no debe tener hex`).toBe(false);
    }
  });

  // esc.004 — marca/marca_profundo/tinta emiten color de texto claro/emparejado (contraste por construcción)
  it("marca_profundo y tinta emiten texto blanco; marca usa el color de contraste (autoContrast)", () => {
    expect(fondoSeccionACss({ tipo: "esquema", esquema: "marca_profundo" }).color).toBe(
      "var(--mantine-color-white)",
    );
    expect(fondoSeccionACss({ tipo: "esquema", esquema: "tinta" }).color).toBe(
      "var(--mantine-color-white)",
    );
    // `marca` (filled) usa el contraste de autoContrast: legible para marca clara (amarillo⇒tinta)
    // y oscura (cobalto⇒blanco) — emparejado real, no blanco a ciegas.
    expect(fondoSeccionACss({ tipo: "esquema", esquema: "marca" }).color).toBe(
      "var(--mantine-primary-color-contrast)",
    );
    // el fondo de `marca` es el primario (mismo criterio que gradienteTematico).
    expect(fondoSeccionACss({ tipo: "esquema", esquema: "marca" }).background).toBe(
      "var(--mantine-primary-color-filled)",
    );
  });

  // esc.005 — tema (transparente) no fija fondo ni color (hereda el shell)
  it("esquema tema no fija fondo ni color (transparente/heredado)", () => {
    expect(fondoSeccionACss({ tipo: "esquema", esquema: "tema" })).toEqual({});
  });
});

describe("estiloSeccion — gradientes / imagen / patrón", () => {
  // esc.006 — gradiente marca_vivo ⇒ linear-gradient con vars de la escala (cero hex)
  it("gradiente marca_vivo emite un linear-gradient de la escala (cero hex)", () => {
    const css = fondoSeccionACss({ tipo: "gradiente", preset: "marca_vivo" });
    expect(css.background).toContain("linear-gradient");
    expect(css.background).toContain("--mantine-primary-color-");
    expect(tieneHex(valoresCss(css))).toBe(false);
    expect(css.color).toBe("var(--mantine-color-white)");
  });

  // esc.007 — fondo imagen con URL ⇒ overlay por enum + url; posición mapeada; cero hex
  it("fondo imagen emite overlay por enum + la url + posición", () => {
    const css = fondoSeccionACss({
      tipo: "imagen",
      url: "https://cdn.example.com/foto.jpg",
      overlay: "tinta",
      opacidadOverlay: 45,
      posicion: "arriba",
      fijo: false,
    });
    expect(css.backgroundImage).toContain('url("https://cdn.example.com/foto.jpg")');
    expect(css.backgroundImage).toContain("color-mix"); // overlay por token, no hex
    expect(css.backgroundPosition).toBe("top");
    expect(css.color).toBe("var(--mantine-color-white)"); // overlay tinta oscurece ⇒ texto claro
    expect(tieneHex(valoresCss(css))).toBe(false);
  });

  // esc.008 — overlay "ninguno" ⇒ sin capa de overlay (solo la imagen); texto tinta
  it("fondo imagen con overlay ninguno no agrega overlay y usa texto tinta", () => {
    const css = fondoSeccionACss({
      tipo: "imagen",
      url: "https://cdn.example.com/x.jpg",
      overlay: "ninguno",
      opacidadOverlay: 0,
      posicion: "centro",
      fijo: false,
    });
    expect(css.backgroundImage).toBe('url("https://cdn.example.com/x.jpg")');
    expect(css.color).toBe("var(--mantine-color-text)");
  });

  // esc.009 — patrón ⇒ esquema base + backgroundImage del patrón (cero hex)
  it("patrón emite el esquema base + un backgroundImage de patrón (cero hex)", () => {
    const css = fondoSeccionACss({ tipo: "patron", patron: "puntos", esquema: "superficie" });
    expect(css.background).toBe("var(--mantine-color-body)"); // esquema base
    expect(css.backgroundImage).toContain("radial-gradient");
    expect(tieneHex(valoresCss(css))).toBe(false);
  });
});

describe("estiloSeccion — divisor y transición de color", () => {
  // esc.010 — divisorInferior con forma ≠ ninguno ⇒ se resuelve; "ninguno" ⇒ null
  it("resuelve el divisor inferior solo si la forma no es ninguno", () => {
    expect(
      estiloSeccionACss(parse({ divisorInferior: { forma: "onda", altura: "l" } })).divisor,
    ).toEqual({ forma: "onda", altura: "l", invertir: false });
    expect(
      estiloSeccionACss(parse({ divisorInferior: { forma: "ninguno" } })).divisor,
    ).toBeNull();
  });

  // esc.011 — colorFondoSolido: esquema ⇒ su token; gradiente/imagen/ausente ⇒ fondo de página (body)
  it("colorFondoSolido da el token del esquema, o body para gradiente/imagen/ausente", () => {
    expect(colorFondoSolido(undefined)).toBe("var(--mantine-color-body)");
    expect(colorFondoSolido(parse({ fondo: { tipo: "esquema", esquema: "marca" } }))).toBe(
      "var(--mantine-primary-color-filled)",
    );
    expect(
      colorFondoSolido(parse({ fondo: { tipo: "gradiente", preset: "marca_vivo" } })),
    ).toBe("var(--mantine-color-body)");
    expect(colorSolidoDeEsquema("tinta")).toBe("var(--mantine-color-gray-9)");
  });
});
