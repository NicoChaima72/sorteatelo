import { type CSSProperties } from "react";
import { describe, expect, it } from "vitest";

import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";
import {
  colorFondoSolido,
  colorSolidoDeEsquema,
  esFondoOscuro,
  estiloSeccionACss,
  fondoLienzoExterior,
  fondoSeccionACss,
  fondoShellConAmbiente,
  maxWidthColumna,
  TEXTO_TENUE_SOBRE_OSCURO,
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

describe("estiloSeccion — altura + alineación vertical (builder-tanda-1 F06/D9)", () => {
  // altura.001 — defaults no-op: altoMin ausente (undefined) + justifyVertical flex-start ⇒ el wrapper
  // NO aplica flex ni min-height (render idéntico al actual, I-H).
  it("altoMin default auto ⇒ sin min-height + alineación arriba (no-op)", () => {
    expect(estiloSeccionACss(undefined).altoMin).toBeUndefined();
    expect(estiloSeccionACss(undefined).justifyVertical).toBe("flex-start");
    expect(estiloSeccionACss(parse({})).altoMin).toBeUndefined();
    expect(estiloSeccionACss(parse({})).justifyVertical).toBe("flex-start");
  });

  // altura.002 — altoMin pantalla/media ⇒ min-height en svh (mobile-safe); alinearVertical ⇒ justify.
  it("altoMin pantalla=100svh, media=60svh; alinearVertical mapea a justify-content", () => {
    expect(estiloSeccionACss(parse({ altoMin: "pantalla" })).altoMin).toBe("100svh");
    expect(estiloSeccionACss(parse({ altoMin: "media" })).altoMin).toBe("60svh");
    expect(estiloSeccionACss(parse({ alinearVertical: "centro" })).justifyVertical).toBe("center");
    expect(estiloSeccionACss(parse({ alinearVertical: "abajo" })).justifyVertical).toBe("flex-end");
    // svh (no vh) ⇒ correcto en mobile; sin hex (I-A)
    expect(estiloSeccionACss(parse({ altoMin: "pantalla" })).altoMin).toContain("svh");
  });

  // altura.003 — enums cerrados: valor fuera de rango ⇒ rechazo (candado)
  it("altoMin/alinearVertical rechazan valores fuera del enum", () => {
    expect(EstiloSeccionSchema.safeParse({ altoMin: "gigante" }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ alinearVertical: "medio" }).success).toBe(false);
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

  // ── builder-tanda-1 F01/D1: esquemas de acento con degradación a marca ────────────────────────

  // acento.esc.001 — los tres esquemas acento parsean en FondoSeccion y no emiten hex
  it("los esquemas acento_suave/acento/acento_profundo parsean y emiten solo CSS vars (cero hex)", () => {
    for (const esquema of ["acento_suave", "acento", "acento_profundo"] as const) {
      parse({ fondo: { tipo: "esquema", esquema } }); // no lanza ⇒ el enum los acepta
      const css = fondoSeccionACss({ tipo: "esquema", esquema });
      expect(tieneHex(valoresCss(css)), `esquema ${esquema} no debe tener hex`).toBe(false);
    }
  });

  // acento.esc.002 — degradación: cada esquema acento cae por fallback CSS a la escala de marca/primario
  it("cada esquema acento usa la escala `acento` con FALLBACK a la de marca (degradación sin acento, I-T2)", () => {
    const suave = fondoSeccionACss({ tipo: "esquema", esquema: "acento_suave" });
    expect(suave.background).toBe("var(--mantine-color-acento-0, var(--mantine-primary-color-0))");
    expect(suave.color).toBe("var(--mantine-color-text)");

    const filled = fondoSeccionACss({ tipo: "esquema", esquema: "acento" });
    expect(filled.background).toBe(
      "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))",
    );
    // texto emparejado por autoContrast, con fallback al contraste del primario
    expect(filled.color).toBe(
      "var(--mantine-color-acento-contrast, var(--mantine-primary-color-contrast))",
    );

    const profundo = fondoSeccionACss({ tipo: "esquema", esquema: "acento_profundo" });
    expect(profundo.background).toBe("var(--mantine-color-acento-8, var(--mantine-primary-color-8))");
    expect(profundo.color).toBe("var(--mantine-color-white)");
  });

  // acento.esc.003 — colorSolidoDeEsquema (fill del divisor) también degrada por fallback
  it("colorSolidoDeEsquema de un esquema acento emite el token acento con fallback a marca", () => {
    expect(colorSolidoDeEsquema("acento")).toBe(
      "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))",
    );
    expect(colorSolidoDeEsquema("acento_profundo")).toBe(
      "var(--mantine-color-acento-8, var(--mantine-primary-color-8))",
    );
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

describe("estiloSeccion — fondo bicolor (builder-tanda-1 F02/D3)", () => {
  // bicolor.001 — parsea con tonos/dirección/mezcla de enum; defaults de direccion/mezcla aplican
  it("la rama bicolor parsea con TONOS de enum y rellena direccion/mezcla por default", () => {
    const e = parse({ fondo: { tipo: "bicolor", colorA: "marca", colorB: "acento" } });
    expect(e.fondo).toEqual({
      tipo: "bicolor",
      colorA: "marca",
      colorB: "acento",
      direccion: "vertical",
      mezcla: "dura",
    });
  });

  // bicolor.002 — hex crudo, tono fuera de TONOS_FONDO o campo extra ⇒ rechazo (.strict / enum cerrado)
  it("rechaza hex crudo, tono fuera de rango y campos extra", () => {
    expect(() => parse({ fondo: { tipo: "bicolor", colorA: "#fff", colorB: "acento" } })).toThrow();
    // "tema" existe en ESQUEMAS_FONDO pero NO en TONOS_FONDO (curado) ⇒ rechazo
    expect(() => parse({ fondo: { tipo: "bicolor", colorA: "tema", colorB: "marca" } })).toThrow();
    expect(() =>
      parse({ fondo: { tipo: "bicolor", colorA: "marca", colorB: "acento", extra: 1 } }),
    ).toThrow();
  });

  // bicolor.003 — mezcla dura = hard-stop 50%; suave = degradado continuo; dirección mapeada; cero hex
  it("emite los dos tokens + dirección; dura = corte al 50%, suave = degradado", () => {
    const dura = fondoSeccionACss({
      tipo: "bicolor",
      colorA: "marca",
      colorB: "acento",
      direccion: "vertical",
      mezcla: "dura",
    });
    expect(dura.background).toContain("linear-gradient(to bottom");
    expect(dura.background).toContain("var(--mantine-primary-color-filled)"); // colorA = marca
    expect(dura.background).toContain("var(--mantine-color-acento-filled"); // colorB = acento (fallback)
    expect(dura.background).toContain("50%"); // corte duro
    expect(tieneHex(valoresCss(dura))).toBe(false);

    const suave = fondoSeccionACss({
      tipo: "bicolor",
      colorA: "marca",
      colorB: "acento",
      direccion: "diagonal",
      mezcla: "suave",
    });
    expect(suave.background).toContain("linear-gradient(135deg");
    expect(suave.background).not.toContain("50%"); // degradado continuo
  });

  // bicolor.004 — el color de texto se empareja con colorA (tono dominante donde se asienta el contenido)
  it("empareja el color de texto con colorA (legibilidad por construcción)", () => {
    // colorA marca (filled) ⇒ contraste de autoContrast (mismo que esquema `marca`)
    expect(
      fondoSeccionACss({
        tipo: "bicolor",
        colorA: "marca",
        colorB: "tinta",
        direccion: "vertical",
        mezcla: "dura",
      }).color,
    ).toBe("var(--mantine-primary-color-contrast)");
    // colorA tinta (oscuro) ⇒ texto blanco
    expect(
      fondoSeccionACss({
        tipo: "bicolor",
        colorA: "tinta",
        colorB: "marca",
        direccion: "vertical",
        mezcla: "dura",
      }).color,
    ).toBe("var(--mantine-color-white)");
  });

  // bicolor.005 (F13/fidelidad) — la mezcla `suave` SESGA el degradado hacia colorA (sólido hasta 60%)
  // ⇒ el contenido centrado (≈50%) cae sobre colorA, cuyo texto emparejado es legible por construcción
  // (dif #6: antes un heading blanco caía sobre la mitad clara de colorB). La `dura` sigue en 50/50.
  it("suave sesga el degradado hacia colorA (sólido hasta 60%) para legibilidad por construcción", () => {
    const suave = fondoSeccionACss({
      tipo: "bicolor",
      colorA: "acento_profundo",
      colorB: "marca",
      direccion: "diagonal",
      mezcla: "suave",
    }).background as string;
    // colorA se mantiene sólido MÁS ALLÁ del centro (60%) antes de transicionar a colorB (borde 100%).
    expect(suave).toContain("60%");
    const iA = suave.indexOf("acento-8"); // token de colorA (acento_profundo, con fallback)
    const iB = suave.indexOf("primary-color-filled"); // token de colorB (marca)
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iB).toBeGreaterThan(iA); // colorA aparece ANTES (domina el arranque + el centro)
    // dura NO se sesga: mantiene el corte 50/50 deliberado
    const dura = fondoSeccionACss({
      tipo: "bicolor",
      colorA: "acento_profundo",
      colorB: "marca",
      direccion: "diagonal",
      mezcla: "dura",
    }).background as string;
    expect(dura).toContain("50%");
    expect(dura).not.toContain("60%");
  });
});

describe("estiloSeccion — anchoFondo (builder-tanda-1 F02/D4)", () => {
  // anchofondo.001 — default no-op: estilo ausente / sin anchoFondo ⇒ "completo" (render actual full-bleed)
  it("anchoFondo default es 'completo' (reproduce el full-bleed actual del wrapper)", () => {
    expect(estiloSeccionACss(undefined).anchoFondo).toBe("completo");
    expect(estiloSeccionACss(parse({})).anchoFondo).toBe("completo");
  });

  // anchofondo.002 — "contenido" se propaga al descriptor
  it("anchoFondo 'contenido' se resuelve al descriptor", () => {
    expect(estiloSeccionACss(parse({ anchoFondo: "contenido" })).anchoFondo).toBe("contenido");
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

describe("estiloSeccion — contraste sobre esquema oscuro (Tanda 2 F12, bug sorteo_vitrina)", () => {
  // contraste.001 — esFondoOscuro clasifica cada tipo de fondo por su color de texto emparejado: los
  // esquemas/tonos oscuros (marca/marca_profundo/tinta/acento_profundo) ⇒ true; los claros ⇒ false. El
  // bicolor hereda la oscuridad de colorA (donde se asienta el texto). Ausente/tema ⇒ false (hereda shell).
  it("esFondoOscuro detecta los esquemas oscuros por su texto emparejado", () => {
    expect(esFondoOscuro(undefined)).toBe(false); // transparente ⇒ hereda el shell (trato como claro, no-op)
    expect(esFondoOscuro({ tipo: "esquema", esquema: "tema" })).toBe(false);
    expect(esFondoOscuro({ tipo: "esquema", esquema: "marca_suave" })).toBe(false);
    expect(esFondoOscuro({ tipo: "esquema", esquema: "superficie" })).toBe(false);
    expect(esFondoOscuro({ tipo: "esquema", esquema: "marca" })).toBe(true);
    expect(esFondoOscuro({ tipo: "esquema", esquema: "marca_profundo" })).toBe(true);
    expect(esFondoOscuro({ tipo: "esquema", esquema: "tinta" })).toBe(true);
    expect(esFondoOscuro({ tipo: "esquema", esquema: "acento_profundo" })).toBe(true);
    // bicolor: la oscuridad la manda colorA (tono dominante donde cae el contenido)
    expect(
      esFondoOscuro({ tipo: "bicolor", colorA: "marca_profundo", colorB: "marca", direccion: "diagonal", mezcla: "suave" }),
    ).toBe(true);
    expect(
      esFondoOscuro({ tipo: "bicolor", colorA: "marca_suave", colorB: "marca", direccion: "vertical", mezcla: "dura" }),
    ).toBe(false);
    // patrón hereda el esquema base; gradiente marca_vivo/tinta ⇒ oscuro; imagen overlay tinta/marca ⇒ oscuro
    expect(esFondoOscuro({ tipo: "patron", patron: "arcos", esquema: "tinta" })).toBe(true);
    expect(esFondoOscuro({ tipo: "gradiente", preset: "marca_vivo" })).toBe(true);
    expect(esFondoOscuro({ tipo: "gradiente", preset: "papel" })).toBe(false);
  });

  // contraste.002 — el color de texto TENUE sobre oscuro deriva de currentColor (el emparejado que el
  // wrapper ya fijó), NUNCA un gris fijo (`dimmed`/gray-6 ⇒ ilegible sobre morado). Cero hex (I-A).
  it("TEXTO_TENUE_SOBRE_OSCURO deriva de currentColor (no de un gris fijo) y no tiene hex", () => {
    expect(TEXTO_TENUE_SOBRE_OSCURO).toContain("currentColor");
    expect(TEXTO_TENUE_SOBRE_OSCURO).not.toContain("gray");
    expect(TEXTO_TENUE_SOBRE_OSCURO).not.toContain("dimmed");
    expect(tieneHex(TEXTO_TENUE_SOBRE_OSCURO)).toBe(false);
  });
});

describe("estiloSeccion — ambiente / stage-lights (Tanda 2 F05/D5)", () => {
  // amb.001 — ninguno = solo el color base del fondoPagina (no-op, shell idéntico al actual)
  it("ambiente 'ninguno' devuelve solo el color sólido del fondoPagina (no-op)", () => {
    expect(fondoShellConAmbiente("tinta", "ninguno")).toEqual({
      background: colorSolidoDeEsquema("tinta"),
    });
    expect(fondoShellConAmbiente("superficie", "ninguno")).toEqual({
      background: colorSolidoDeEsquema("superficie"),
    });
  });

  // amb.002 — focos_marca compone radial-gradients de la escala marca sobre el color base (cero hex)
  it("focos_marca emite radial-gradients de tokens de marca sobre el color base (cero hex)", () => {
    const bg = fondoShellConAmbiente("tinta", "focos_marca").background as string;
    expect(bg).toContain("radial-gradient");
    expect(bg).toContain("--mantine-primary-color-");
    expect(bg).toContain("color-mix"); // opacidad por token, no rgba/hex
    expect(bg).toContain(colorSolidoDeEsquema("tinta")); // el color base queda como capa final
    expect(tieneHex(bg)).toBe(false);
  });

  // amb.003 — focos_acento usa la escala acento (fallback a marca); aurora mezcla marca + acento
  it("focos_acento usa la escala acento (fallback a marca) y aurora mezcla ambas (cero hex)", () => {
    const acento = fondoShellConAmbiente("tinta", "focos_acento").background as string;
    expect(acento).toContain("--mantine-color-acento-");
    expect(acento).toContain("var(--mantine-primary-color-"); // fallback a marca dentro del var()
    expect(tieneHex(acento)).toBe(false);

    const aurora = fondoShellConAmbiente("tinta", "aurora").background as string;
    expect(aurora).toContain("--mantine-primary-color-");
    expect(aurora).toContain("--mantine-color-acento-");
    expect(tieneHex(aurora)).toBe(false);
  });
});

describe("estiloSeccion — padTop/padBottom (Tanda 2 F06/D6)", () => {
  // pad.001 — sin overrides: py del enum, sin pt/pb (no-op, wrapper usa py como siempre)
  it("sin padTop/padBottom ⇒ py del enum y pyTop/pyBottom undefined (no-op)", () => {
    const r = estiloSeccionACss(parse({ padY: "l" }));
    expect(r.py).toEqual({ base: "xl", md: 48 });
    expect(r.pyTop).toBeUndefined();
    expect(r.pyBottom).toBeUndefined();
    expect(estiloSeccionACss(undefined).pyTop).toBeUndefined();
    expect(estiloSeccionACss(undefined).pyBottom).toBeUndefined();
  });

  // pad.002 — padTop override el lado superior; el lado sin override cae al padY base
  it("padTop override el top; padBottom el bottom; el lado sin override cae al padY base", () => {
    const soloTop = estiloSeccionACss(parse({ padY: "l", padTop: "ninguno" }));
    expect(soloTop.pyTop).toEqual({ base: 0, md: 0 }); // ninguno
    expect(soloTop.pyBottom).toEqual({ base: "xl", md: 48 }); // cae al padY base (l)
    const ambos = estiloSeccionACss(parse({ padTop: "xl", padBottom: "s" }));
    expect(ambos.pyTop).toEqual({ base: 48, md: 80 }); // xl
    expect(ambos.pyBottom).toEqual({ base: "md", md: "lg" }); // s
  });

  // pad.003 — enums cerrados
  it("padTop/padBottom rechazan valores fuera de ESPACIADO_V", () => {
    expect(EstiloSeccionSchema.safeParse({ padTop: "gigante" }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ padBottom: "medio" }).success).toBe(false);
  });
});

describe("estiloSeccion — esquema marfil (Tanda 2 F14, fidelidad editorial)", () => {
  // marfil.001 — `marfil` es un fondo CÁLIDO curado dark-aware (el #faf7f2 del prototipo editorial), texto
  // tinta. Emite solo tokens (`light-dark` + `color-mix` de white/dark/orange) — cero hex (I-A). Es CLARO
  // (dark-aware como `superficie`) ⇒ `esFondoOscuro` false. `colorSolidoDeEsquema` da el mismo cálido.
  it("marfil emite un fondo cálido de tokens (cero hex), texto tinta, y NO es oscuro", () => {
    const css = fondoSeccionACss({ tipo: "esquema", esquema: "marfil" });
    expect(css.background).toContain("light-dark"); // dark-aware
    expect(css.background).toContain("color-mix"); // compuesto de tokens (calidez)
    expect(css.background).toContain("--mantine-color-orange"); // fuente de la calidez (token, no hex)
    expect(css.color).toBe("var(--mantine-color-text)"); // texto tinta dark-aware
    expect(tieneHex(valoresCss(css))).toBe(false);
    // marfil NO es un esquema oscuro (su texto emparejado es tinta, como superficie) ⇒ sub-textos dimmed
    expect(esFondoOscuro({ tipo: "esquema", esquema: "marfil" })).toBe(false);
    // el fill sólido (divisor / shell) es el MISMO cálido
    expect(colorSolidoDeEsquema("marfil")).toBe(css.background);
  });

  // marfil.002 — FondoSeccionSchema (rama esquema) acepta `marfil`; el shell con marfil + ambiente ninguno
  // es solo el sólido cálido (no-op de ambiente sobre marfil).
  it("EstiloSeccionSchema acepta marfil y el shell (ambiente ninguno) es el sólido cálido", () => {
    expect(parse({ fondo: { tipo: "esquema", esquema: "marfil" } })).toBeTruthy();
    expect(fondoShellConAmbiente("marfil", "ninguno")).toEqual({
      background: colorSolidoDeEsquema("marfil"),
    });
  });
});

describe("estiloSeccion — ambiente neon (Tanda 2 F14, fidelidad concert)", () => {
  // neon.001 — `neon` compone radiales SATURADOS y CONCENTRADOS de marca + acento (fallback a marca, I-T2)
  // sobre el color base (el foco púrpura top-center del prototipo concert). Más opaco que `aurora`. Cero hex.
  it("neon emite radial-gradients saturados de marca + acento sobre el color base (cero hex)", () => {
    const bg = fondoShellConAmbiente("tinta", "neon").background as string;
    expect(bg).toContain("radial-gradient");
    expect(bg).toContain("--mantine-primary-color-"); // foco de marca
    expect(bg).toContain("--mantine-color-acento-"); // focos de acento (fallback a marca dentro del var)
    expect(bg).toContain("color-mix"); // opacidad por token, no rgba/hex
    expect(bg).toContain(colorSolidoDeEsquema("tinta")); // el color base queda como capa final
    expect(tieneHex(bg)).toBe(false);
  });
});

describe("estiloSeccion — patrones nuevos (Tanda 2 F07/D7)", () => {
  // pat.001 — cuadricula_papel: doble linear-gradient de token (grid papel) sobre el esquema base
  it("cuadricula_papel emite el doble linear-gradient de token sobre el esquema base (cero hex)", () => {
    const css = fondoSeccionACss({ tipo: "patron", patron: "cuadricula_papel", esquema: "superficie" });
    expect(css.background).toBe("var(--mantine-color-body)"); // esquema base
    expect(css.backgroundImage).toContain("linear-gradient");
    expect(css.backgroundImage!.match(/linear-gradient/g)!.length).toBeGreaterThanOrEqual(2);
    expect(tieneHex(valoresCss(css))).toBe(false);
  });

  // pat.002 — arcos: radial-gradient (scallop) sobre el esquema base
  it("arcos emite un radial-gradient (scallop) sobre el esquema base (cero hex)", () => {
    const css = fondoSeccionACss({ tipo: "patron", patron: "arcos", esquema: "tinta" });
    expect(css.background).toBe("var(--mantine-color-gray-9)"); // esquema base (tinta)
    expect(css.backgroundImage).toContain("radial-gradient");
    expect(tieneHex(valoresCss(css))).toBe(false);
  });

  // pat.003 — FondoSeccionSchema (rama patron) acepta los dos patrones nuevos
  it("FondoSeccionSchema (rama patron) acepta cuadricula_papel y arcos", () => {
    expect(parse({ fondo: { tipo: "patron", patron: "cuadricula_papel" } })).toBeTruthy();
    expect(parse({ fondo: { tipo: "patron", patron: "arcos" } })).toBeTruthy();
  });
});

describe("estiloSeccion — esquema tinta_profunda (Tanda 2 F15, fidelidad concert)", () => {
  // tintaprofunda.001 — near-black con tinte de marca, más profundo que tinta (gray-9), texto claro, OSCURO
  it("tinta_profunda emite un near-black brand-tinted de tokens (cero hex), texto claro, y ES oscuro", () => {
    const css = fondoSeccionACss({ tipo: "esquema", esquema: "tinta_profunda" });
    expect(css.background).toContain("color-mix"); // near-black compuesto de tokens
    expect(css.background).toContain("--mantine-color-black");
    expect(css.background).toContain("--mantine-primary-color-9"); // el tinte de marca (no hex)
    expect(css.color).toBe("var(--mantine-color-white)"); // texto claro
    expect(tieneHex(valoresCss(css))).toBe(false);
    // ES un esquema oscuro (su texto emparejado es claro) ⇒ los sub-textos derivan de currentColor
    expect(esFondoOscuro({ tipo: "esquema", esquema: "tinta_profunda" })).toBe(true);
    // el fill sólido (shell/divisor) es el mismo near-black
    expect(colorSolidoDeEsquema("tinta_profunda")).toBe(css.background);
    // NO es un hex ni gray-9: es DISTINTO (más profundo) que tinta
    expect(colorSolidoDeEsquema("tinta_profunda")).not.toBe(colorSolidoDeEsquema("tinta"));
  });

  // tintaprofunda.002 — el ambiente neon sobre tinta_profunda concentra el glow sobre el near-black
  it("neon sobre tinta_profunda apila el foco concentrado sobre el near-black (cero hex)", () => {
    const bg = fondoShellConAmbiente("tinta_profunda", "neon").background as string;
    expect(bg).toContain("radial-gradient");
    expect(bg).toContain(colorSolidoDeEsquema("tinta_profunda")); // base near-black como capa final
    expect(tieneHex(bg)).toBe(false);
  });
});

describe("estiloSeccion — kicker de sección (Tanda 2 F15, numerales romanos editorial)", () => {
  // kicker.001 — sin kicker ⇒ resuelve a null (no-op I-H); con kicker ⇒ texto + numeral resueltos
  it("kicker ausente ⇒ null (no-op); presente ⇒ {texto, numeral}; numeral default ninguno", () => {
    expect(estiloSeccionACss(undefined).kicker).toBeNull();
    expect(estiloSeccionACss(parse({})).kicker).toBeNull();
    const r = estiloSeccionACss(parse({ kicker: { texto: "El libro", numeral: "I" } }));
    expect(r.kicker).toEqual({ texto: "El libro", numeral: "I" });
    // numeral opcional ⇒ default ninguno
    expect(estiloSeccionACss(parse({ kicker: { texto: "Dudas" } })).kicker).toEqual({
      texto: "Dudas",
      numeral: "ninguno",
    });
  });

  // kicker.002 — EstiloSeccionSchema valida el kicker: texto ≤40, numeral del enum, .strict()
  it("EstiloSeccionSchema valida kicker (texto ≤40, numeral del enum, rechaza extras)", () => {
    expect(parse({ kicker: { texto: "II", numeral: "II" } })).toBeTruthy();
    // texto >40 ⇒ rechazo; numeral fuera del enum ⇒ rechazo; campo extra ⇒ rechazo (.strict)
    expect(EstiloSeccionSchema.safeParse({ kicker: { texto: "x".repeat(41) } }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ kicker: { texto: "ok", numeral: "IX" } }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ kicker: { texto: "ok", html: "<b>x</b>" } }).success).toBe(false);
  });
});

describe("estiloSeccion — columna estrecha del shell (Tanda 2 F15, fidelidad editorial)", () => {
  // columna.001 — anchoContenido estrecho ⇒ maxWidth 640; contenido/ancho ⇒ null (no-op I-H)
  it("maxWidthColumna: estrecho ⇒ ~640; contenido/ancho ⇒ null (sin columna acotada)", () => {
    expect(maxWidthColumna("estrecho")).toBe(640);
    expect(maxWidthColumna("contenido")).toBeNull();
    expect(maxWidthColumna("ancho")).toBeNull();
  });

  // columna.002 — el lienzo exterior es el fondoPagina un pelo más oscuro (color-mix con black), cero hex
  it("fondoLienzoExterior oscurece el fondoPagina con un color-mix de tokens (cero hex)", () => {
    const css = fondoLienzoExterior("marfil");
    expect(css.background).toContain("color-mix");
    expect(css.background).toContain("--mantine-color-black"); // oscurece
    expect(css.background).toContain(colorSolidoDeEsquema("marfil")); // sobre el marfil base
    expect(tieneHex(css.background as string)).toBe(false);
  });
});
