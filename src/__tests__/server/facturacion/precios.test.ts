import { describe, expect, it } from "vitest";

import {
  montoDelPlan,
  planParaNuevaSuscripcion,
  recalcularPlanesDelPagador,
  type SuscripcionDelPagador,
} from "~/server/domain/facturacion/_precios";

/**
 * Tests del pricing del Pagador (F01, D1/D7, I4/I8). Núcleo PURO: la regla "$25.000 la primera
 * tienda, $12.500 las siguientes" es relativa al PAGADOR y se resuelve SERVER-SIDE contando sus
 * suscripciones activas — jamás con un plan/precio que venga del cliente (I4, lección H1).
 */

const sub = (
  id: string,
  plan: "FULL" | "ADICIONAL",
  dia: number,
): SuscripcionDelPagador => ({
  id,
  plan,
  createdAt: new Date(Date.UTC(2026, 6, dia)),
});

describe("domain/facturacion/planParaNuevaSuscripcion (pricing del Pagador)", () => {
  // facturacion.precios.001 — la primera tienda del Pagador paga FULL; las siguientes ADICIONAL
  it("asigna FULL a la primera suscripción activa y ADICIONAL a las siguientes", () => {
    expect(planParaNuevaSuscripcion([])).toBe("FULL");
    expect(planParaNuevaSuscripcion([sub("s1", "FULL", 1)])).toBe("ADICIONAL");
    expect(
      planParaNuevaSuscripcion([sub("s1", "FULL", 1), sub("s2", "ADICIONAL", 2)]),
    ).toBe("ADICIONAL");
  });
});

describe("domain/facturacion/montoDelPlan", () => {
  // facturacion.precios.005 — los montos son los que promete la landing, en Decimal (I2)
  it("cobra $25.000 la full y $12.500 la adicional, en Decimal (nunca number)", () => {
    expect(montoDelPlan("FULL").toFixed(0)).toBe("25000");
    expect(montoDelPlan("ADICIONAL").toFixed(0)).toBe("12500");
    // La adicional es EXACTAMENTE la mitad: es la promesa literal de la landing.
    expect(montoDelPlan("ADICIONAL").times(2).equals(montoDelPlan("FULL"))).toBe(
      true,
    );
  });
});

describe("domain/facturacion/recalcularPlanesDelPagador (invariante I8)", () => {
  // facturacion.precios.002 — cancelada la full, la ADICIONAL más antigua se promueve a FULL (D7)
  it("al desaparecer la full, promueve a FULL la adicional más antigua y deja el resto en ADICIONAL", () => {
    // La s1 (full) ya se canceló ⇒ el caller pasa solo las que siguen ACTIVAS.
    const cambios = recalcularPlanesDelPagador([
      sub("s3", "ADICIONAL", 5),
      sub("s2", "ADICIONAL", 2),
    ]);
    expect(cambios).toEqual([
      { suscripcionId: "s2", planActual: "ADICIONAL", planNuevo: "FULL" },
    ]);
  });

  // facturacion.precios.003 — el recálculo es idempotente: si I8 ya se cumple, cero cambios
  it("no propone cambios cuando el invariante ya se cumple", () => {
    expect(
      recalcularPlanesDelPagador([
        sub("s1", "FULL", 1),
        sub("s2", "ADICIONAL", 2),
      ]),
    ).toEqual([]);
    expect(recalcularPlanesDelPagador([])).toEqual([]);
  });

  // facturacion.precios.004 — dos fulls (estado corrupto) se corrigen: sobrevive la más antigua
  it("degrada a ADICIONAL cualquier full que no sea la más antigua", () => {
    expect(
      recalcularPlanesDelPagador([sub("s1", "FULL", 1), sub("s2", "FULL", 2)]),
    ).toEqual([
      { suscripcionId: "s2", planActual: "FULL", planNuevo: "ADICIONAL" },
    ]);
  });
});
