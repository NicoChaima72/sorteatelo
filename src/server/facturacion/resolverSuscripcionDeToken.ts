import { parsearCommerceOrder } from "~/server/domain/facturacion/_commerceOrderFlow";
import {
  ErrorFlowPlataforma,
  FLOW_PAGO_PAGADO,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * Traduce el `token` con el que Flow notifica una suscripción a lo que hace falta para procesarla
 * (F04, blocker 4 de la 3ª pasada del E2E; ampliado por el blocker 5 de la 4ª).
 *
 * Es el eslabón que faltaba: Flow postea al `urlCallback` un form-urlencoded con **`token=<…>` y
 * nada más**. El token se resuelve contra `payment/getStatus` —mismo endpoint que el webhook de
 * ventas BYO, con las credenciales de plataforma— y de ahí sale el `commerceOrder`, que Flow arma
 * como `<subscriptionId>_<invoiceId>_<fecha>`. El parseo vive en el núcleo puro `_commerceOrderFlow`.
 *
 * ── Qué se devuelve, y por qué los tres datos ────────────────────────────────────────────────────
 * La versión anterior se quedaba solo con el `flowSubscriptionId` y tiraba el resto. Los otros dos
 * son justamente la evidencia del hecho notificado: **de qué cobro** habla (con eso el use case
 * puede espejarlo aunque `subscription/get` todavía no lo liste) y **si ese cobro se pagó**
 * (`status = 2`), que es la prueba más fresca que existe de que la plata se movió.
 *
 * ── La semántica de reintento, que es lo caro de equivocar ────────────────────────────────────────
 * `null` significa **irreintentable**: el webhook ackea 200 y deja rastro en el log. Se llega ahí por
 * dos caminos, y los dos son definitivos — Flow rechazó el token (4xx) o el `commerceOrder` no tiene
 * forma de cobro de suscripción. Insistir con un 500 haría que Flow reintentara para siempre una
 * notificación que nunca va a andar, con el riesgo extra de que termine desactivando el callback de
 * la cuenta.
 *
 * Un fallo **transitorio** (Flow caído, red) se propaga tal cual: el webhook responde 500 y el
 * reintento de Flow es la red que hace que no se pierda un cobro. Tragarlo sería el peor final
 * posible para una notificación de plata.
 */
/** Lo que la notificación de Flow resultó ser, una vez cambiado el token por su contenido. */
export interface NotificacionResuelta {
  /** La suscripción de Flow a la que pertenece el cobro notificado. */
  flowSubscriptionId: string;
  /** El cobro puntual del que habla la notificación. */
  flowInvoiceId: string;
  /** `payment/getStatus` declaró ese cobro PAGADO (`status = 2`). */
  cobroPagado: boolean;
}

export async function resolverSuscripcionDeToken({
  flow,
  token,
}: {
  flow: FlowPlataformaService;
  token: string;
}): Promise<NotificacionResuelta | null> {
  let pago;
  try {
    pago = await flow.getEstadoPago(token);
  } catch (e) {
    if (e instanceof ErrorFlowPlataforma && e.esIrreintentable) {
      console.warn(
        "[facturacion] Flow no reconoce el token de la notificación de suscripción: se ackea y se ignora",
        { httpStatus: e.httpStatus, codigoFlow: e.codigoFlow },
      );
      return null;
    }
    throw e;
  }

  const referencia = parsearCommerceOrder(pago?.commerceOrder);
  if (!referencia) {
    // El token existe pero su cobro no es de una suscripción nuestra (o Flow cambió el formato). No
    // se adivina: escribir contra la suscripción equivocada es peor que no escribir.
    console.warn(
      "[facturacion] notificación de suscripción con un commerceOrder que no se pudo rutear",
      { commerceOrder: pago?.commerceOrder ?? null },
    );
    return null;
  }

  return {
    ...referencia,
    cobroPagado: pago?.status === FLOW_PAGO_PAGADO,
  };
}
