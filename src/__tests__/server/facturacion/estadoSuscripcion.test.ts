import { describe, expect, it } from "vitest";

import {
  type DatosDerivacion,
  derivarEstadoSuscripcion,
  esActiva,
} from "~/server/domain/facturacion/_estadoSuscripcion";

/**
 * Tests de la derivación del estado de la Suscripción de plataforma (F01, D15). Flow **no tiene
 * `past_due` nativo**: expone `status` (0/1/2/4) + el flag `morose` + sus invoices. Nuestra máquina
 * `AL_DIA → COBRO_PENDIENTE → EN_PAUSA_POR_PAGO → CANCELADA` es DERIVADA de esos datos, ya
 * verificados server-side contra la API de Flow (I3) — nunca copiada de un campo suyo.
 */

const base: DatosDerivacion = { statusFlow: 1, morose: 0, invoices: [] };

describe("domain/facturacion/derivarEstadoSuscripcion", () => {
  // facturacion.estado.001 — suscripción activa en Flow, sin mora ni invoices impagos ⇒ AL_DIA
  it("una suscripción activa sin mora ni invoices impagos queda AL_DIA", () => {
    expect(derivarEstadoSuscripcion(base)).toBe("AL_DIA");
    expect(
      derivarEstadoSuscripcion({ ...base, invoices: [{ estado: "PAGADA" }] }),
    ).toBe("AL_DIA");
  });

  // facturacion.estado.002 — invoice FALLIDA o flag morose ⇒ COBRO_PENDIENTE (Flow reintentando)
  it("un invoice fallido o el flag morose la dejan en COBRO_PENDIENTE", () => {
    expect(
      derivarEstadoSuscripcion({ ...base, invoices: [{ estado: "FALLIDA" }] }),
    ).toBe("COBRO_PENDIENTE");
    // `morose` solo: Flow reporta mora aunque nuestro espejo del invoice todavía no la refleje.
    expect(derivarEstadoSuscripcion({ ...base, morose: 1 })).toBe(
      "COBRO_PENDIENTE",
    );
  });

  // facturacion.estado.003 — invoice VENCIDA (dunning agotado) ⇒ EN_PAUSA_POR_PAGO (D4)
  it("un invoice vencido agota el dunning y la deja EN_PAUSA_POR_PAGO", () => {
    expect(
      derivarEstadoSuscripcion({
        ...base,
        morose: 2,
        invoices: [{ estado: "PAGADA" }, { estado: "VENCIDA" }],
      }),
    ).toBe("EN_PAUSA_POR_PAGO");
  });

  // facturacion.estado.004 — pagar el invoice pendiente REGULARIZA (vuelve a AL_DIA)
  it("regulariza a AL_DIA cuando el invoice impago pasa a PAGADA y Flow limpia la mora", () => {
    const enMora: DatosDerivacion = {
      statusFlow: 1,
      morose: 1,
      invoices: [{ estado: "FALLIDA" }],
    };
    expect(derivarEstadoSuscripcion(enMora)).toBe("COBRO_PENDIENTE");
    expect(
      derivarEstadoSuscripcion({
        ...enMora,
        morose: 0,
        invoices: [{ estado: "PAGADA" }],
      }),
    ).toBe("AL_DIA");
  });

  // facturacion.estado.007 — un invoice ANULADA no es una deuda: no suspende ni ensucia el estado
  // (nit diferido de F01 por el `backend-reviewer`, cerrado en F04 — que es donde ANULADA se produce
  // de verdad: `_invoiceFlow.ts` lo deriva de un invoice impago SIN saldo pendiente).
  it("un invoice ANULADA no suspende la tienda ni la deja en cobro pendiente", () => {
    expect(
      derivarEstadoSuscripcion({ ...base, invoices: [{ estado: "ANULADA" }] }),
    ).toBe("AL_DIA");
    // Ni siquiera junto a uno pagado: anulado ≠ impago.
    expect(
      derivarEstadoSuscripcion({
        ...base,
        invoices: [{ estado: "PAGADA" }, { estado: "ANULADA" }],
      }),
    ).toBe("AL_DIA");
  });

  // facturacion.estado.008 — PENDIENTE (recién emitido, sin cobrar aún) tampoco es mora
  it("un invoice PENDIENTE recién emitido no la saca de AL_DIA", () => {
    expect(
      derivarEstadoSuscripcion({ ...base, invoices: [{ estado: "PENDIENTE" }] }),
    ).toBe("AL_DIA");
  });

  // facturacion.estado.005 — status 4 de Flow (cancelada) manda sobre todo lo demás
  it("la cancelación en Flow manda sobre la mora y los invoices", () => {
    expect(
      derivarEstadoSuscripcion({
        statusFlow: 4,
        morose: 2,
        invoices: [{ estado: "VENCIDA" }],
      }),
    ).toBe("CANCELADA");
  });
});

describe("domain/facturacion/esActiva", () => {
  // facturacion.estado.006 — "activa" para el pricing del Pagador = todo lo que no esté cancelado
  it("cuenta como activa toda suscripción que no esté CANCELADA", () => {
    expect(esActiva("AL_DIA")).toBe(true);
    expect(esActiva("COBRO_PENDIENTE")).toBe(true);
    expect(esActiva("EN_PAUSA_POR_PAGO")).toBe(true);
    expect(esActiva("CANCELADA")).toBe(false);
  });
});
