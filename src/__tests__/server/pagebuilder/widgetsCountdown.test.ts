import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import { urgenciaCountdownProps } from "~/lib/pagebuilder/widgets";

/**
 * Tests de la prop de ESTILO nueva de `urgencia_countdown` (builder-countdown-presencia F01/D1):
 * `estiloVisual` con enum cerrado `clasico | panel | tarjeta`. Mismo invariante que la tanda dreamy
 * (I-H): el default es el no-op ⇒ los documentos ya publicados parsean igual, SIN v-bump ni migración;
 * un valor fuera del enum se rechaza y `.strict()` sigue en pie. Puro Zod, sin DB; el render vive en
 * `src/__tests__/components/urgencia-countdown.test.tsx`.
 */

describe("pagebuilder/countdown (F01) — urgencia_countdown gana estiloVisual", () => {
  // page.countdown.schema.001 — prop NUEVA `estiloVisual`: default `clasico` (no-op), acepta las 3
  // variantes del enum, rechaza lo demás y `.strict()` intacto. El resto del shape no se toca (I2).
  it("estiloVisual default clasico (no-op), acepta panel/tarjeta y rechaza lo demás", () => {
    // documento PREVIO (sin la prop) ⇒ cae al no-op y conserva TODOS sus defaults de siempre
    const previo = urgenciaCountdownProps.parse({});
    expect(previo.estiloVisual).toBe("clasico");
    expect(previo.intensidad).toBe("suave");
    expect(previo.ctaAncla).toBe("catalogo");

    for (const est of ["clasico", "panel", "tarjeta"] as const) {
      expect(urgenciaCountdownProps.safeParse({ estiloVisual: est }).success).toBe(true);
    }
    // El glow neón NO es una variante propia (D1/I6): compone con `ambiente: neon` de la sección.
    expect(urgenciaCountdownProps.safeParse({ estiloVisual: "neon" }).success).toBe(false);
    expect(urgenciaCountdownProps.safeParse({ estiloVisual: "card" }).success).toBe(false);
    // `.strict()` se conserva: un campo desconocido sigue rechazado
    expect(urgenciaCountdownProps.safeParse({ estiloVisual: "tarjeta", foo: 1 }).success).toBe(false);
  });

  // page.countdown.schema.002 — un nodo PUBLICADO antes del cambio (v:1, sin la prop) sigue parseando
  // contra la union de secciones sin v-bump; y el nodo con el valor nuevo también.
  it("el nodo v:1 previo sigue parseando (sin v-bump) y el de la variante nueva también", () => {
    const previo = {
      id: "uc",
      tipo: "urgencia_countdown",
      v: 1,
      props: { mensaje: "El sorteo cierra el 18 de septiembre", ctaTexto: "Quiero participar", ctaAncla: "catalogo", intensidad: "suave" },
    };
    const parsed = SeccionNodeSchema.safeParse(previo);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.tipo === "urgencia_countdown") {
      expect(parsed.data.v).toBe(1); // sin v-bump: el default de zod migra on-read
      expect(parsed.data.props.estiloVisual).toBe("clasico");
    }

    expect(
      SeccionNodeSchema.safeParse({ ...previo, props: { ...previo.props, estiloVisual: "tarjeta" } })
        .success,
    ).toBe(true);
  });
});
