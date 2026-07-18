import { describe, expect, it } from "vitest";

import config from "../../../tailwind.config";

/**
 * Tests de `tailwind.config.ts` (F01, D7). Tailwind está acotado a LAYOUT (color/tipografía/sombra
 * son territorio del theme de Mantine, I11). Acá se verifica el patrón datawalt-app adoptado en el
 * talonario: los `screens` de Tailwind quedan SINCRONIZADOS con los breakpoints de Mantine (em, no
 * los px por defecto de Tailwind), y `font-sans` resuelve a la fuente de texto del talonario
 * (Instrument Sans) por CSS var.
 */

/** Breakpoints de Mantine 7 (em). Los `screens` de Tailwind deben coincidir exactamente (D7). */
const BREAKPOINTS_MANTINE = {
  xs: "36em",
  sm: "48em",
  md: "62em",
  lg: "75em",
  xl: "88em",
} as const;

describe("tailwind.config — screens sincronizados con Mantine (D7)", () => {
  // config.tailwind.001 — los screens coinciden con los breakpoints em de Mantine
  it("declara los screens en em, iguales a los breakpoints de Mantine", () => {
    expect(config.theme?.screens).toEqual(BREAKPOINTS_MANTINE);
  });

  // config.tailwind.002 — font-sans resuelve a la var de Instrument Sans (texto del talonario)
  it("mapea font-sans a la CSS var de Instrument Sans", () => {
    const sans = config.theme?.extend?.fontFamily?.sans as string[] | undefined;
    expect(sans?.[0]).toBe("var(--font-instrument)");
  });
});
