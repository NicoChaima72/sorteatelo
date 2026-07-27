/**
 * Núcleo PURO: de qué suscripción y de qué cobro habla una notificación de Flow (F04, ADR-0026).
 *
 * ── El contrato real, verificado contra el sandbox (3ª pasada del E2E) ───────────────────────────
 * Flow **no** notifica las suscripciones con un `subscriptionId`. Postea al `urlCallback` del plan un
 * `application/x-www-form-urlencoded` con **`token=<…>` y nada más**. Ese token se resuelve contra
 * `payment/getStatus` —el mismo endpoint que usa el webhook de ventas BYO—, y de esa respuesta el
 * dato que rutea es el `commerceOrder`, que Flow arma así:
 *
 * ```
 * sus_df7ebcc91c_1179464_2026-07-26 20:32
 * └─ subscriptionId ┘ └invoice┘ └─ fecha ─┘
 * ```
 *
 * La trampa está a la vista: **el `subscriptionId` de Flow lleva guiones bajos**, así que partir por
 * el primer `_` devuelve `sus`. Se parsea desde el FINAL, que es la parte de forma conocida: fecha,
 * invoice numérico, y todo lo que quede antes es el id de la suscripción.
 *
 * Ante cualquier cosa que no calce, `null`: el ruteo de una notificación de plata no se adivina. El
 * caller ackea y grita en el log en vez de escribir contra la suscripción equivocada.
 */

export interface ReferenciaDeCobro {
  /** `PlatformSubscription.flowSubscriptionId` — la fila local a la que pertenece la notificación. */
  flowSubscriptionId: string;
  /** `PlatformInvoice.flowInvoiceId` — el cobro puntual del que Flow está hablando. */
  flowInvoiceId: string;
}

export function parsearCommerceOrder(
  valor: string | null | undefined,
): ReferenciaDeCobro | null {
  if (!valor) return null;

  const partes = valor.split("_");
  // Mínimo: subscriptionId + invoiceId + fecha.
  if (partes.length < 3) return null;

  partes.pop(); // la fecha: no se usa (las fechas autoritativas salen de `subscription/get`)
  const flowInvoiceId = partes.pop()!;
  const flowSubscriptionId = partes.join("_");

  // El invoice de Flow es un entero. Exigirlo es lo que hace que un `commerceOrder` de otra cosa
  // —una orden de venta BYO, por ejemplo— no se lea como si fuera una suscripción.
  if (!/^\d+$/.test(flowInvoiceId)) return null;
  if (flowSubscriptionId.length === 0) return null;

  return { flowSubscriptionId, flowInvoiceId };
}
