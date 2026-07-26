import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DIAS_AVISO_RENOVACION,
  exencionPorAvisar,
  inicioVentanaAvisoExencion,
  limiteAvisoRenovacion,
  montoDelProximoCobro,
} from "~/server/domain/facturacion/_avisosProgramados";

/**
 * Tests del NÚCLEO PURO de los avisos programados (F09/D11, ADR-0026). Sin DB ni fakes: acá se fijan
 * las reglas —cuánto se va a cobrar, cuándo empieza a avisarse una cortesía— que el barrido después
 * aplica. Mismo reparto que `_gateVenta.ts` ↔ `gateVenta.test.ts`.
 */

const AHORA = new Date("2026-08-10T12:00:00Z");
const MS_POR_DIA = 24 * 60 * 60 * 1000;

describe("domain/facturacion/_avisosProgramados — el monto que se va a cobrar", () => {
  const base = {
    montoBruto: new Prisma.Decimal("12500"),
    proximoCobroAt: new Date("2026-08-12T00:00:00Z"),
  };

  // facturacion.avisoPuro.001 — sin cambio programado, el monto es el snapshot de la suscripción
  it("sin cambio de plan programado anuncia el monto vigente", () => {
    const m = montoDelProximoCobro({
      ...base,
      planProgramado: null,
      planProgramadoDesde: null,
    });

    expect(m.toFixed(0)).toBe("12500");
  });

  // facturacion.avisoPuro.002 — la promoción D7 duplica el cobro: hay que anunciar el monto NUEVO
  it("anuncia el plan promovido cuando su vigencia cae en o antes de ese cobro", () => {
    // Vigencia EXACTAMENTE el día del cobro: ese cobro ya es el nuevo (el borde importa — es la
    // diferencia entre anunciar $12.500 y cobrar $25.000).
    const enElBorde = montoDelProximoCobro({
      ...base,
      planProgramado: "FULL",
      planProgramadoDesde: new Date("2026-08-12T00:00:00Z"),
    });
    expect(enElBorde.toFixed(0)).toBe("25000");

    // Un instante después del cobro: ese cobro todavía sale al precio viejo.
    const despues = montoDelProximoCobro({
      ...base,
      planProgramado: "FULL",
      planProgramadoDesde: new Date("2026-08-12T00:00:01Z"),
    });
    expect(despues.toFixed(0)).toBe("12500");
  });

  // facturacion.avisoPuro.003 — un plan programado SIN fecha no autoriza a anunciar otro monto
  it("con plan programado pero sin fecha de vigencia anuncia el monto vigente", () => {
    // El dato ausente no decide: sin `planProgramadoDesde` no sabemos si rige para este cobro, y
    // anunciar el monto nuevo sin saberlo sería adivinar con la plata del Organizador.
    const m = montoDelProximoCobro({
      ...base,
      planProgramado: "FULL",
      planProgramadoDesde: null,
    });

    expect(m.toFixed(0)).toBe("12500");
  });

  // facturacion.avisoPuro.004 — el monto viaja en Decimal de punta a punta (I2)
  it("devuelve un Decimal, nunca un number", () => {
    const m = montoDelProximoCobro({
      ...base,
      planProgramado: null,
      planProgramadoDesde: null,
    });

    expect(m).toBeInstanceOf(Prisma.Decimal);
  });
});

describe("domain/facturacion/_avisosProgramados — cuándo se avisa una cortesía", () => {
  const sinPlan = { estadoSuscripcion: null, ahora: AHORA };

  // facturacion.avisoPuro.005 — los bordes de la ventana de preaviso
  it("avisa dentro de la ventana de 7 días, en su borde exacto, y no antes", () => {
    const dentro = new Date(AHORA.getTime() + 3 * MS_POR_DIA);
    const borde = new Date(AHORA.getTime() + 7 * MS_POR_DIA);
    const fuera = new Date(AHORA.getTime() + 7 * MS_POR_DIA + 1);

    expect(exencionPorAvisar({ ...sinPlan, exencion: { exentaHasta: dentro } })).toBe(true);
    expect(exencionPorAvisar({ ...sinPlan, exencion: { exentaHasta: borde } })).toBe(true);
    expect(exencionPorAvisar({ ...sinPlan, exencion: { exentaHasta: fuera } })).toBe(false);
  });

  // facturacion.avisoPuro.006 — perpetua y ya vencida no son eventos que anunciar
  it("no avisa la cortesía perpetua ni la que ya venció", () => {
    expect(exencionPorAvisar({ ...sinPlan, exencion: { exentaHasta: null } })).toBe(false);
    expect(
      exencionPorAvisar({
        ...sinPlan,
        exencion: { exentaHasta: new Date(AHORA.getTime() - 1) },
      }),
    ).toBe(false);
  });

  // facturacion.avisoPuro.007 — el plan que sostiene la venta silencia el aviso (hand-off de F07)
  it("calla cuando hay un plan que sostiene la venta y habla cuando no", () => {
    const exencion = { exentaHasta: new Date(AHORA.getTime() + MS_POR_DIA) };

    // Con un plan vivo detrás, el vencimiento no cambia nada: decirle «vas a necesitar un plan» a
    // quien lo tiene y lo paga sería falso. Es la misma decisión que ya toma el banner del panel.
    expect(exencionPorAvisar({ exencion, estadoSuscripcion: "AL_DIA", ahora: AHORA })).toBe(false);
    expect(
      exencionPorAvisar({ exencion, estadoSuscripcion: "COBRO_PENDIENTE", ahora: AHORA }),
    ).toBe(false);
    expect(
      exencionPorAvisar({ exencion, estadoSuscripcion: "EN_PAUSA_POR_PAGO", ahora: AHORA }),
    ).toBe(true);
    expect(
      exencionPorAvisar({ exencion, estadoSuscripcion: "CANCELADA", ahora: AHORA }),
    ).toBe(true);
  });

  // facturacion.avisoPuro.008 — la marca de «ya avisada» se compara contra la ventana, no como flag
  it("el inicio de la ventana es exactamente 7 días antes del vencimiento", () => {
    const exentaHasta = new Date("2026-08-15T00:00:00Z");

    expect(inicioVentanaAvisoExencion(exentaHasta)).toEqual(
      new Date("2026-08-08T00:00:00Z"),
    );
  });
});

describe("domain/facturacion/_avisosProgramados — la ventana del aviso de renovación", () => {
  // facturacion.avisoPuro.009 — 2 días, para que una corrida perdida del cron no se lleve el aviso
  it("mira 2 días hacia adelante", () => {
    expect(DIAS_AVISO_RENOVACION).toBe(2);
    expect(limiteAvisoRenovacion(AHORA)).toEqual(
      new Date(AHORA.getTime() + 2 * MS_POR_DIA),
    );
  });
});
