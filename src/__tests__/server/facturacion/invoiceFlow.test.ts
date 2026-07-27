import { describe, expect, it } from "vitest";

import {
  REINTENTOS_COBRO_FLOW,
  derivarEstadoInvoice,
  esCobroAbandonadoSinSuspender,
} from "~/server/domain/facturacion/_invoiceFlow";

/**
 * Núcleo PURO del espejo de invoices de Flow (F04, D4/D15).
 *
 * Es la pieza más delicada de la facturación: de acá sale el `VENCIDA` que hace que una Tienda DEJE
 * DE VENDER (D4) y el `PAGADA` que dispara el comprobante.
 *
 * ── Por qué este archivo se reescribió entero (blocker 5 de la 4ª pasada del E2E) ────────────────
 * La versión anterior derivaba sobre `paid` / `payment_date` / `outstanding` / `attemp`: **cuatro
 * claves que Flow no manda**. Todo invoice caía en `PENDIENTE`, así que el comprobante no salía
 * nunca y el dunning estaba muerto — una tienda morosa habría vendido para siempre. Los payloads de
 * abajo NO están inventados: son los que devolvió la API real del sandbox (lecturas firmadas con las
 * credenciales de plataforma), y por eso este archivo es también la regresión contra el contrato.
 */

/**
 * `invoice/get` de un cobro REAL y ya cobrado (invoice 1179470, suscripción `sus_g286f51c39`,
 * 2026-07-26 22:11:58). Copiado tal cual de la respuesta de Flow.
 *
 * **Acá vive la trampa del blocker 5**: un invoice PAGADO viene con `attemp_count: 1` y
 * `attemped: 0`. Leer `attemped` como «intentos fallidos» —o `attemp_count` como el contador contra
 * el tope de reintentos— convertiría un cobro exitoso en una tienda suspendida.
 */
const INVOICE_PAGADO_REAL = {
  id: 1179470,
  subscriptionId: "sus_g286f51c39",
  amount: "25000.0000",
  period_start: "2026-07-26 00:00:00",
  period_end: "2026-08-25 00:00:00",
  attemp_count: 1,
  attemped: 0,
  next_attemp_date: null,
  due_date: "2026-07-29 00:00:00",
  status: 1,
  error: 0,
  errorDate: null,
  errorDescription: null,
  paymentLink: null,
  chargeAttemps: [],
  payment: { status: 2, paymentData: { date: "2026-07-26 22:11:58" } },
} as const;

/**
 * Molde de un invoice IMPAGO. El sandbox no tiene ninguno —no hay tarjeta de prueba que inscriba y
 * después falle (punto 3 de «A VERIFICAR»)—, así que estos casos se construyen sobre el contrato
 * DOCUMENTADO (`tmp/apiFlow.yaml` v7: `status` 0 impago / 1 pagado / 2 anulado, `attemp_count` =
 * número de intentos de cobro, `error` 0/1) manteniendo el resto de las claves reales.
 */
const invoiceImpago = (extra: Record<string, unknown> = {}) => ({
  ...INVOICE_PAGADO_REAL,
  status: 0,
  attemp_count: 0,
  attemped: 1,
  payment: null,
  paymentLink: "https://sandbox.flow.cl/app/web/pay.php?token=abc",
  ...extra,
});

describe("domain/facturacion/_invoiceFlow — derivación del estado del invoice", () => {
  // facturacion.invoice.001 — el cobro que de verdad ocurrió se lee como PAGADA
  it("lee como PAGADA el payload REAL de un invoice que Flow ya cobró", () => {
    expect(derivarEstadoInvoice(INVOICE_PAGADO_REAL)).toBe("PAGADA");
  });

  // facturacion.invoice.002 — anulado: Flow lo dio de baja (típicamente al cancelar)
  it("lee como ANULADA un invoice que Flow marcó anulado", () => {
    expect(derivarEstadoInvoice(invoiceImpago({ status: 2 }))).toBe("ANULADA");
  });

  // facturacion.invoice.003 — cobro fallido con reintentos en curso: la tienda SIGUE vendiendo (D4)
  it("lee como FALLIDA un impago con intentos por debajo del tope", () => {
    expect(
      derivarEstadoInvoice(
        invoiceImpago({
          attemp_count: 1,
          error: 1,
          errorDescription: "Tarjeta rechazada",
          next_attemp_date: "2026-08-02 00:00:00",
        }),
      ),
    ).toBe("FALLIDA");
    expect(
      derivarEstadoInvoice(
        invoiceImpago({ attemp_count: REINTENTOS_COBRO_FLOW - 1 }),
      ),
    ).toBe("FALLIDA");
  });

  // facturacion.invoice.004 — recién emitido: no es fallido ni vencido
  it("lee como PENDIENTE un impago que Flow todavía no intentó cobrar", () => {
    expect(derivarEstadoInvoice(invoiceImpago())).toBe("PENDIENTE");
  });

  // facturacion.invoice.005 — dunning AGOTADO: el ÚNICO camino a que la tienda deje de vender
  it("lee como VENCIDA un impago que agotó los reintentos registrados en el plan", () => {
    expect(
      derivarEstadoInvoice(invoiceImpago({ attemp_count: REINTENTOS_COBRO_FLOW })),
    ).toBe("VENCIDA");
  });

  // facturacion.invoice.006 — LA TRAMPA: un cobro exitoso jamás se lee como dunning
  it("no confunde con dunning el attemp_count de un invoice PAGADO (attemped: 0 no es un contador)", () => {
    // Es el payload real: pagado, con un intento contado y `attemped: 0` («ya no se cobrará»).
    expect(INVOICE_PAGADO_REAL.attemp_count).toBe(1);
    expect(INVOICE_PAGADO_REAL.attemped).toBe(0);
    expect(derivarEstadoInvoice(INVOICE_PAGADO_REAL)).toBe("PAGADA");
    // Ni siquiera con el tope alcanzado: el pago manda sobre cualquier cuenta de intentos.
    expect(
      derivarEstadoInvoice({
        ...INVOICE_PAGADO_REAL,
        attemp_count: REINTENTOS_COBRO_FLOW + 5,
      }),
    ).toBe("PAGADA");
  });

  // facturacion.invoice.007 — la falla segura: la ambigüedad NUNCA suspende
  it("cae a PENDIENTE cuando Flow no dice el status, por muchos intentos que reporte", () => {
    expect(derivarEstadoInvoice({})).toBe("PENDIENTE");
    // Sin `status` no hay evidencia de impago: `attemp_count` solo no puede suspender una tienda.
    expect(derivarEstadoInvoice({ attemp_count: 99 })).toBe("PENDIENTE");
    // Un valor que Flow no documenta tampoco abre el camino de la suspensión.
    expect(derivarEstadoInvoice({ status: 7, attemp_count: 99 })).toBe("PENDIENTE");
  });

  // facturacion.invoice.008 — el pago del token vale como prueba aunque el invoice no se haya movido
  it("lee como PAGADA un invoice cuyo bloque payment está cobrado, aunque su status diga impago", () => {
    expect(
      derivarEstadoInvoice(invoiceImpago({ payment: { status: 2 } })),
    ).toBe("PAGADA");
  });

  // facturacion.invoice.009 — el tope de reintentos es el MISMO que se registra en Flow
  it("el tope de reintentos es un número explícito y compartido con el bootstrap de planes", () => {
    expect(REINTENTOS_COBRO_FLOW).toBe(3);
  });

  // facturacion.invoice.010 — el punto ciego queda señalado, no silencioso
  it("marca el cobro que Flow parece haber abandonado sin que nosotros lo suspendamos", () => {
    // Flow dice que este importe ya no se cobrará y sigue impago, pero nuestro contador no llegó al
    // tope: si así marcara los incobrables, la tienda nunca entraría en pausa.
    expect(
      esCobroAbandonadoSinSuspender(invoiceImpago({ attemped: 0 })),
    ).toBe(true);
    // Anulado DESPUÉS de agotar los reintentos: la otra forma del mismo punto ciego.
    expect(
      esCobroAbandonadoSinSuspender(
        invoiceImpago({ status: 2, attemp_count: REINTENTOS_COBRO_FLOW }),
      ),
    ).toBe(true);
    // Lo normal no es sospechoso: un cobro en curso, una anulación limpia, un pago.
    expect(esCobroAbandonadoSinSuspender(invoiceImpago())).toBe(false);
    expect(esCobroAbandonadoSinSuspender(invoiceImpago({ status: 2 }))).toBe(false);
    expect(esCobroAbandonadoSinSuspender(INVOICE_PAGADO_REAL)).toBe(false);
    // Un VENCIDA tampoco: ese ya suspende, no hay nada que señalar.
    expect(
      esCobroAbandonadoSinSuspender(
        invoiceImpago({ attemp_count: REINTENTOS_COBRO_FLOW, attemped: 0 }),
      ),
    ).toBe(false);
  });
});
