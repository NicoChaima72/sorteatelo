import { describe, expect, it } from "vitest";

import {
  REINTENTOS_COBRO_FLOW,
  derivarEstadoInvoice,
  esAnulacionSospechosa,
} from "~/server/domain/facturacion/_invoiceFlow";

/**
 * Núcleo PURO del espejo de invoices de Flow (F04, D4/D15).
 *
 * Es la pieza más delicada de la facturación: de acá sale el `VENCIDA` que hace que una Tienda
 * DEJE DE VENDER (D4). Por eso la derivación NO usa el `status` numérico opaco de Flow —cuya
 * numeración exacta no está verificada contra el sandbox— sino campos de semántica inequívoca
 * (`paid`, `outstanding`, `attemp`), y exige evidencia POSITIVA de dunning agotado para suspender.
 * La falla segura es "sigue vendiendo": la plataforma cobra tarde, pero ningún Comprador queda sin
 * su tienda por un dato que leímos mal (I5).
 */
describe("domain/facturacion/_invoiceFlow — derivación del estado del invoice", () => {
  // facturacion.invoice.001 — pagado: la señal inequívoca
  it("un invoice con paid=1 es PAGADA", () => {
    expect(derivarEstadoInvoice({ paid: 1, outstanding: 0 })).toBe("PAGADA");
  });

  // facturacion.invoice.002 — payment_date también prueba el pago
  it("un invoice con payment_date es PAGADA aunque no venga paid", () => {
    expect(derivarEstadoInvoice({ payment_date: "2026-08-01" })).toBe("PAGADA");
  });

  // facturacion.invoice.003 — recién emitido: NO es vencida ni fallida
  it("un invoice recién emitido (sin intentos, con saldo) es PENDIENTE", () => {
    expect(derivarEstadoInvoice({ paid: 0, outstanding: 25000, attemp: 0 })).toBe(
      "PENDIENTE",
    );
  });

  // facturacion.invoice.004 — reintentos en curso ⇒ FALLIDA (la tienda SIGUE vendiendo)
  it("un invoice impago con intentos por debajo del tope es FALLIDA", () => {
    expect(derivarEstadoInvoice({ paid: 0, outstanding: 25000, attemp: 1 })).toBe(
      "FALLIDA",
    );
    expect(
      derivarEstadoInvoice({
        paid: 0,
        outstanding: 25000,
        attemp: REINTENTOS_COBRO_FLOW - 1,
      }),
    ).toBe("FALLIDA");
  });

  // facturacion.invoice.005 — dunning AGOTADO ⇒ VENCIDA (el único camino a la suspensión)
  it("un invoice impago que agotó los reintentos es VENCIDA", () => {
    expect(
      derivarEstadoInvoice({
        paid: 0,
        outstanding: 25000,
        attemp: REINTENTOS_COBRO_FLOW,
      }),
    ).toBe("VENCIDA");
  });

  // facturacion.invoice.006 — anulado: no se pagó y no se debe nada
  it("un invoice impago SIN saldo pendiente es ANULADA, no VENCIDA", () => {
    expect(
      derivarEstadoInvoice({
        paid: 0,
        outstanding: 0,
        attemp: REINTENTOS_COBRO_FLOW,
      }),
    ).toBe("ANULADA");
  });

  // facturacion.invoice.007 — la falla segura: datos incompletos NUNCA suspenden
  it("con campos ausentes cae a PENDIENTE (jamás a VENCIDA)", () => {
    expect(derivarEstadoInvoice({})).toBe("PENDIENTE");
    // `attemp` ausente no puede leerse como "agotó los reintentos".
    expect(derivarEstadoInvoice({ paid: 0, outstanding: 25000 })).toBe("PENDIENTE");
  });

  // facturacion.invoice.009 — el único caso ambiguo queda señalado, no silencioso
  it("marca como sospechosa la anulación que ocurre con los reintentos ya agotados", () => {
    // Sin saldo Y con el dunning agotado: si Flow marcara así los INCOBRABLES, la tienda morosa
    // nunca se suspendería. Se respeta la lectura conservadora, pero el caller lo loguea.
    expect(
      esAnulacionSospechosa({
        paid: 0,
        outstanding: 0,
        attemp: REINTENTOS_COBRO_FLOW,
      }),
    ).toBe(true);
    // Una anulación normal (sin intentos agotados) no tiene nada de sospechoso.
    expect(esAnulacionSospechosa({ paid: 0, outstanding: 0, attemp: 0 })).toBe(
      false,
    );
    // Ni un incobrable de verdad (con saldo), ni un pago.
    expect(
      esAnulacionSospechosa({
        paid: 0,
        outstanding: 25000,
        attemp: REINTENTOS_COBRO_FLOW,
      }),
    ).toBe(false);
    expect(esAnulacionSospechosa({ paid: 1, outstanding: 0 })).toBe(false);
  });

  // facturacion.invoice.008 — el tope de reintentos es el MISMO que se registra en Flow
  it("el tope de reintentos es un número explícito y compartido con el bootstrap de planes", () => {
    expect(REINTENTOS_COBRO_FLOW).toBe(3);
  });
});
