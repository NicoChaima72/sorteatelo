import { describe, expect, it } from "vitest";

import { parsearCommerceOrder } from "~/server/domain/facturacion/_commerceOrderFlow";

/**
 * Núcleo puro que traduce el `commerceOrder` de un cobro de suscripción de Flow (F04, blocker 4 de
 * la 3ª pasada del E2E).
 *
 * Flow notifica sus suscripciones con un `token` de pago y nada más. Ese token se resuelve contra
 * `payment/getStatus`, cuya respuesta trae el `commerceOrder` con la forma
 * `<subscriptionId>_<invoiceId>_<fecha>` — o sea que la única forma de saber DE QUÉ suscripción
 * habla una notificación es parsear este string.
 *
 * La trampa está a la vista en el ejemplo real: **el `subscriptionId` de Flow lleva guiones bajos**
 * (`sus_df7ebcc91c`), así que partir por el primer `_` da basura. Se parsea desde el FINAL.
 */

// Capturado del sandbox real, 2026-07-26.
const REAL = "sus_df7ebcc91c_1179464_2026-07-26 20:32";

describe("facturacion/_commerceOrderFlow — de qué suscripción habla una notificación", () => {
  // facturacion.commerceOrder.001 — el caso real, con el subscriptionId que trae guiones bajos
  it("saca el subscriptionId y el invoiceId del commerceOrder real de Flow", () => {
    expect(parsearCommerceOrder(REAL)).toEqual({
      flowSubscriptionId: "sus_df7ebcc91c",
      flowInvoiceId: "1179464",
    });
  });

  // facturacion.commerceOrder.002 — lo que no tiene esa forma no se adivina
  it("devuelve null ante cualquier cosa que no sea ese formato", () => {
    for (const basura of [
      undefined,
      null,
      "",
      "sus_df7ebcc91c", // sin invoice ni fecha
      "sus_df7ebcc91c_2026-07-26 20:32", // sin invoiceId
      "sus_df7ebcc91c_no-es-un-numero_2026-07-26 20:32",
      "orden-de-una-venta-byo-123",
    ]) {
      expect(parsearCommerceOrder(basura)).toBeNull();
    }
  });

  // facturacion.commerceOrder.003 — un subscriptionId sin guiones bajos también parsea
  it("no asume que el subscriptionId tenga guiones bajos", () => {
    expect(parsearCommerceOrder("abc123_777_2026-08-26 00:00")).toEqual({
      flowSubscriptionId: "abc123",
      flowInvoiceId: "777",
    });
  });
});
