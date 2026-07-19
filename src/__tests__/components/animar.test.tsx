import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Animar, useCountUp } from "~/components/storefront/animar";
import {
  EstiloSeccionSchema,
  PRESETS_ENTRADA,
  PRESETS_ENTRADA_BASE,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests del sistema de animación (catálogo-v2 F03/D5, ADR-0020, síntesis §4.6): enum de presets
 * cerrado y SIN timing configurable (I-E), SSR-visible (I-D: nunca `opacity:0` en el HTML público),
 * count-up SSR = valor final, y `motion` importado SOLO desde `animar.tsx` en el storefront (I-E).
 */

describe("animar — presets acotados, sin timing en el documento (I-E)", () => {
  // anim.001 — PRESETS_ENTRADA = ["heredar", ...base]; exhaustividad del set
  it("PRESETS_ENTRADA es heredar + los base, sin extras", () => {
    expect(PRESETS_ENTRADA).toEqual(["heredar", ...PRESETS_ENTRADA_BASE]);
    expect(PRESETS_ENTRADA_BASE).toEqual([
      "ninguna",
      "aparecer",
      "subir",
      "escala",
      "desenfoque",
    ]);
  });

  // anim.002 — el documento NO puede llevar duration/delay/easing (solo el preset, enum cerrado)
  it("EstiloSeccion rechaza duration/delay/easing/velocidad (timing no configurable)", () => {
    expect(EstiloSeccionSchema.safeParse({ entrada: "subir" }).success).toBe(true);
    expect(EstiloSeccionSchema.safeParse({ entrada: "subir", duration: 500 }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ entrada: "subir", delay: 200 }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ entrada: "subir", easing: "linear" }).success).toBe(false);
    // preset fuera del enum ⇒ rechazo (candado)
    expect(EstiloSeccionSchema.safeParse({ entrada: "girar" }).success).toBe(false);
  });
});

describe("animar — SSR-visible (I-D)", () => {
  // anim.003 — el SSR de <Animar> NO contiene opacity:0 y sí el contenido (patrón SSR-visible)
  it("Animar renderiza el contenido VISIBLE en SSR (sin opacity:0)", () => {
    for (const preset of ["subir", "escala", "desenfoque", "aparecer"] as const) {
      const html = renderToStaticMarkup(
        // children en props: `Animar` lo declara requerido en su tipo (createElement 3-arg no lo satisface).
        // eslint-disable-next-line react/no-children-prop
        createElement(Animar, { preset, children: createElement("p", null, "contenido-visible") }),
      );
      expect(html).toContain("contenido-visible");
      expect(html.toLowerCase()).not.toContain("opacity:0");
      expect(html.toLowerCase()).not.toContain("opacity: 0");
    }
  });

  // anim.004 — useCountUp: SSR = valor FINAL (cacheable/accesible)
  it("useCountUp renderiza el valor FINAL en SSR", () => {
    function Contador() {
      const { valor, ref } = useCountUp<HTMLSpanElement>(1234);
      return createElement("span", { ref }, String(valor));
    }
    const html = renderToStaticMarkup(createElement(Contador));
    expect(html).toContain("1234");
    expect(html.toLowerCase()).not.toContain("opacity:0");
  });
});

describe("animar — motion acotado a la primitiva (I-E)", () => {
  // anim.005 — `motion` solo se importa desde animar.tsx en todo src/components/storefront
  it("ningún archivo del storefront importa motion salvo animar.tsx", () => {
    const dir = join(process.cwd(), "src", "components", "storefront");
    const archivos = readdirSync(dir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
    const infractores: string[] = [];
    for (const archivo of archivos) {
      if (archivo === "animar.tsx") continue;
      const contenido = readFileSync(join(dir, archivo), "utf8");
      if (/from\s+["']motion(\/|["'])/.test(contenido)) {
        infractores.push(archivo);
      }
    }
    expect(infractores, `importan motion fuera de animar.tsx: ${infractores.join(", ")}`).toEqual([]);
  });
});
