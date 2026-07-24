import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  cintaTextoProps,
  imagenDestacadaProps,
  PARES_TIPOGRAFICOS,
  perfilAutoraProps,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests de los widgets v2b (catálogo-v2 F12, gap vs mockups del cliente): `cinta_texto`,
 * `perfil_autora`, y la variante `holo` de `imagen_destacada`. Verifican el CHECKLIST INVARIANTE de la
 * síntesis §6: props `.strict()` (rechazo de HTML/campo extra), enums cerrados, límites de
 * cantidad/longitud, y que el nodo parsea contra la union de secciones. Puro Zod, sin DB. La
 * degradación visual y el render (marquee/tilt/reduced-motion) se validan en runtime/E2E.
 */

describe("pagebuilder/widgets v2b (F12) — cinta_texto (marquee ticker)", () => {
  // page.v2b.001 — cinta_texto: mensajes 1–10 ≤40 chars, separador/velocidad de enum, .strict()
  it("cinta_texto valida mensajes/separador/velocidad y rechaza campos extra", () => {
    const ok = { mensajes: ["SORTEO ABIERTO", "ENVÍO INSTANTÁNEO"], separador: "estrella", velocidad: "rapida" };
    expect(cintaTextoProps.safeParse(ok).success).toBe(true);
    // todo default salvo mensajes (min 1)
    expect(cintaTextoProps.safeParse({ mensajes: ["Hola"] }).success).toBe(true);
    // 0 mensajes / más de 10 ⇒ rechazo
    expect(cintaTextoProps.safeParse({ mensajes: [] }).success).toBe(false);
    expect(cintaTextoProps.safeParse({ mensajes: Array(11).fill("x") }).success).toBe(false);
    // mensaje >40 chars ⇒ rechazo
    expect(cintaTextoProps.safeParse({ mensajes: ["x".repeat(41)] }).success).toBe(false);
    // separador/velocidad fuera del enum ⇒ rechazo
    expect(cintaTextoProps.safeParse({ mensajes: ["a"], separador: "corazon" }).success).toBe(false);
    expect(cintaTextoProps.safeParse({ mensajes: ["a"], velocidad: "turbo" }).success).toBe(false);
    // HTML/campo extra ⇒ rechazo (.strict)
    expect(cintaTextoProps.safeParse({ mensajes: ["a"], html: "<b>x</b>" }).success).toBe(false);
    // el nodo parsea contra la union de secciones
    expect(SeccionNodeSchema.safeParse({ id: "ct", tipo: "cinta_texto", v: 1, props: ok }).success).toBe(true);
  });
});

describe("pagebuilder/widgets v2b (F12) — perfil_autora (editorial sobre mí)", () => {
  // page.v2b.002 — perfil_autora: nombre ≤60, bio ≤400, redes ≤6 (shape botones_sociales), .strict()
  it("perfil_autora valida nombre/bio/redes/avatar y rechaza campos extra", () => {
    const ok = {
      nombre: "María José",
      bio: "Vendo libros digitales y sorteo uno cada mes.",
      avatarUrl: "https://cdn.example/yo.jpg",
      redes: [
        { red: "instagram", url: "https://instagram.com/yo" },
        { red: "tiktok", url: "https://tiktok.com/@yo" },
      ],
    };
    expect(perfilAutoraProps.safeParse(ok).success).toBe(true);
    // solo nombre (bio/avatar/redes opcionales)
    expect(perfilAutoraProps.safeParse({ nombre: "Ana" }).success).toBe(true);
    // sin nombre ⇒ rechazo
    expect(perfilAutoraProps.safeParse({ bio: "hola" }).success).toBe(false);
    // nombre >60 / bio >400 ⇒ rechazo
    expect(perfilAutoraProps.safeParse({ nombre: "x".repeat(61) }).success).toBe(false);
    expect(perfilAutoraProps.safeParse({ nombre: "Ana", bio: "x".repeat(401) }).success).toBe(false);
    // más de 6 redes ⇒ rechazo
    expect(
      perfilAutoraProps.safeParse({ nombre: "Ana", redes: Array(7).fill({ red: "instagram", url: "https://x.co" }) }).success,
    ).toBe(false);
    // red fuera del enum / url inválida ⇒ rechazo
    expect(perfilAutoraProps.safeParse({ nombre: "Ana", redes: [{ red: "myspace", url: "https://x.co" }] }).success).toBe(false);
    expect(perfilAutoraProps.safeParse({ nombre: "Ana", redes: [{ red: "instagram", url: "no-url" }] }).success).toBe(false);
    // avatar no-url ⇒ rechazo
    expect(perfilAutoraProps.safeParse({ nombre: "Ana", avatarUrl: "no-url" }).success).toBe(false);
    // HTML/campo extra ⇒ rechazo (.strict)
    expect(perfilAutoraProps.safeParse({ nombre: "Ana", html: "<b>x</b>" }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "pa", tipo: "perfil_autora", v: 1, props: ok }).success).toBe(true);
  });
});

describe("pagebuilder/widgets v2b (F12) — imagen_destacada holo (aditivo)", () => {
  // page.v2b.003 — imagen_destacada acepta holo:boolean (default false), no rompe v1, .strict()
  it("imagen_destacada acepta holo y conserva compatibilidad v1", () => {
    const base = { imagenUrl: "https://cdn.example/x.jpg", alt: "Una imagen" };
    // v1 (sin holo) sigue parseando; el default rellena holo:false
    const v1 = imagenDestacadaProps.parse(base);
    expect(v1.holo).toBe(false);
    // holo explícito true/false parsea
    expect(imagenDestacadaProps.safeParse({ ...base, holo: true }).success).toBe(true);
    expect(imagenDestacadaProps.safeParse({ ...base, holo: false }).success).toBe(true);
    // holo no-boolean ⇒ rechazo
    expect(imagenDestacadaProps.safeParse({ ...base, holo: "si" }).success).toBe(false);
    // campo extra sigue rechazado (.strict)
    expect(imagenDestacadaProps.safeParse({ ...base, glow: true }).success).toBe(false);
  });
});

describe("pagebuilder/fonts v2b (F12) — par tipográfico nuevo", () => {
  // page.v2b.004 — el par `cartel` (Bebas Neue + Space Grotesk) está en el enum de nombres (PURO,
  // Vitest-safe). La exhaustividad enum↔instancias (que `cartel` tenga su ParFont en `~/config/fonts`)
  // la garantiza el COMPILE-TIME: `PARES_FONT: Record<ParTipografico, ParFont>` no compila si falta un
  // par (gate `tsc`). No importamos `~/config/fonts` acá a propósito: arrastra `next/font` (build-time
  // transform), que rompe bajo Vitest — mismo criterio que `theme.test.ts::styles.theme.009`.
  it("cartel está declarado en PARES_TIPOGRAFICOS (fuente única del TemaSchema)", () => {
    expect(PARES_TIPOGRAFICOS).toContain("cartel");
    // sin duplicados (un par nuevo no pisa otro)
    expect(new Set(PARES_TIPOGRAFICOS).size).toBe(PARES_TIPOGRAFICOS.length);
  });
});
