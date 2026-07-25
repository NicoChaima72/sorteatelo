import { describe, expect, it } from "vitest";

import { estiloSeccionACss, resolverResponsive } from "~/styles/estiloSeccion";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/**
 * Tests de responsive POR NODO (Tanda 3 F10/D16/D17). `EstiloSeccion.movil` es un Partial del SUBSET de
 * LAYOUT (padY/padTop/padBottom/altoMin/alinearVertical/ancho — mismos enums, jamás valores nuevos);
 * `fondo`/`entrada`/`divisor` NO se overridean por breakpoint (I-U5). `visibleEn` (todos|desktop|movil,
 * default todos) es CSS estático (display:none por media query, SSR-safe — nunca render condicional que
 * rompa SSR/CLS). Defaults ⇒ resolver byte-idéntico (no-op, I-U8). Cero hex en el CSS emitido (I-A).
 */

describe("pagebuilder/responsive (F10) — schema del subset móvil", () => {
  // page.resp.001 — movil acepta SOLO el subset de layout; fondo/entrada/divisor en movil ⇒ rechazo
  it("EstiloSeccion.movil acepta el subset de layout y rechaza fondo/entrada/divisor y valores nuevos", () => {
    expect(
      EstiloSeccionSchema.safeParse({
        padY: "xl",
        movil: { padY: "s", altoMin: "auto", alinearVertical: "centro", ancho: "completo" },
      }).success,
    ).toBe(true);
    // fondo en movil ⇒ rechazo (.strict del subset)
    expect(
      EstiloSeccionSchema.safeParse({ movil: { fondo: { tipo: "esquema", esquema: "marca" } } }).success,
    ).toBe(false);
    // entrada en movil ⇒ rechazo
    expect(EstiloSeccionSchema.safeParse({ movil: { entrada: "subir" } }).success).toBe(false);
    // divisorInferior en movil ⇒ rechazo
    expect(
      EstiloSeccionSchema.safeParse({ movil: { divisorInferior: { forma: "onda" } } }).success,
    ).toBe(false);
    // valor de enum inexistente ⇒ rechazo (mismos enums, jamás valores nuevos)
    expect(EstiloSeccionSchema.safeParse({ movil: { padY: "gigante" } }).success).toBe(false);
  });

  // page.resp.002 — visibleEn default todos; enum cerrado
  it("visibleEn default 'todos' y solo acepta todos|desktop|movil", () => {
    expect(EstiloSeccionSchema.parse({}).visibleEn).toBe("todos");
    expect(EstiloSeccionSchema.safeParse({ visibleEn: "desktop" }).success).toBe(true);
    expect(EstiloSeccionSchema.safeParse({ visibleEn: "movil" }).success).toBe(true);
    expect(EstiloSeccionSchema.safeParse({ visibleEn: "tablet" }).success).toBe(false);
  });
});

describe("pagebuilder/responsive (F10) — resolver CSS estático", () => {
  // page.resp.003 — sin movil ni visibleEn restringido ⇒ no-op (sin clases responsive, sin vars)
  it("un estilo sin overrides móviles NO emite clases ni custom props (byte-idéntico, I-U8)", () => {
    const r = resolverResponsive(undefined);
    expect(r.clases).toEqual([]);
    expect(Object.keys(r.vars)).toEqual([]);
    const r2 = resolverResponsive(EstiloSeccionSchema.parse({ padY: "l" }));
    expect(r2.clases).toEqual([]);
    expect(Object.keys(r2.vars)).toEqual([]);
    // y el resolver "clásico" no cambió (regresión del render actual)
    expect(estiloSeccionACss(EstiloSeccionSchema.parse({})).py).toBeDefined();
  });

  // page.resp.004 — movil.padY emite las custom props desktop + móvil; sin hex
  it("un override de padY móvil emite --sx-pb/--sx-pb-m y la clase responsive; cero hex", () => {
    const estilo = EstiloSeccionSchema.parse({ padY: "xl", movil: { padY: "s" } });
    const r = resolverResponsive(estilo);
    expect(r.clases).toContain("sx-sec-responsive");
    // desktop = valor de `xl`, móvil = valor de `s` (distintos)
    expect(r.vars["--sx-pt"]).toBeDefined();
    expect(r.vars["--sx-pt-m"]).toBeDefined();
    expect(r.vars["--sx-pt"]).not.toBe(r.vars["--sx-pt-m"]);
    // cero hex en cualquier var (I-A): todo sale de tokens/calc
    for (const v of Object.values(r.vars)) expect(v).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  // page.resp.005 — visibleEn:desktop ⇒ clase de ocultamiento móvil; movil ⇒ ocultamiento desktop
  it("visibleEn emite la clase de ocultamiento correcta por breakpoint", () => {
    expect(resolverResponsive(EstiloSeccionSchema.parse({ visibleEn: "desktop" })).clases).toContain(
      "sx-solo-desktop",
    );
    expect(resolverResponsive(EstiloSeccionSchema.parse({ visibleEn: "movil" })).clases).toContain(
      "sx-solo-movil",
    );
    expect(resolverResponsive(EstiloSeccionSchema.parse({ visibleEn: "todos" })).clases).not.toContain(
      "sx-solo-desktop",
    );
  });

  // page.resp.006 — movil.altoMin emite min-height móvil + flex (sin hex)
  it("un override de altoMin móvil emite --sx-minh-m y la clase de flex-columna", () => {
    const estilo = EstiloSeccionSchema.parse({ altoMin: "auto", movil: { altoMin: "media" } });
    const r = resolverResponsive(estilo);
    expect(r.clases).toContain("sx-sec-altomin");
    expect(r.vars["--sx-minh-m"]).toBe("60svh");
  });
});
