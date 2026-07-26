import {
  type PlatformInvoiceStatus,
  type PlatformSubscriptionStatus,
} from "@prisma/client";

/**
 * Núcleo PURO de «qué correos amerita esta notificación» (F04, D10 1-4, I9). Sin DB ni red: el use
 * case computa el ANTES y el DESPUÉS de la transición y este módulo decide qué se avisa.
 *
 * Es la mitad que sostiene la **idempotencia de los correos**: el webhook de Flow puede llegar N
 * veces por el mismo hecho, y el ledger `PlatformInvoice` hace que el replay sea un no-op en DB —
 * pero un correo no se puede "des-enviar". Por eso la decisión se toma sobre la TRANSICIÓN, nunca
 * sobre el estado final: si nada cambió, no sale nada. Mismo principio que `conCorreoPostPago`, que
 * envía solo cuando `transicion === "PAGADO" && !yaProcesado`.
 *
 * Los otros 3 correos de D10 (cancelación, expiración de exención, aviso previo de renovación) NO
 * salen de acá: los disparan F06 y el cron de F09, que tienen sus propias transiciones.
 */

export type TipoCorreoFacturacion =
  /** (1) Comprobante: se cobró el mes. */
  | "COMPROBANTE_PAGO"
  /** (2) El cobro falló y Flow va a reintentar; lleva `paymentLink` + próximo intento. */
  | "COBRO_FALLIDO"
  /** (3) Dunning agotado: la tienda dejó de vender (D4). */
  | "TIENDA_EN_PAUSA"
  /** (4) Se pagó lo pendiente: la tienda vuelve a vender. */
  | "TIENDA_REGULARIZADA";

/**
 * El resultado de intentar avanzar un invoice del espejo.
 *
 * `transiciono` NO es «el estado cambió respecto de lo que leí antes»: es «**esta** corrida es la que
 * lo cambió», y sale de un guard ATÓMICO en la DB (un `createMany skipDuplicates` o un `updateMany`
 * con `WHERE` condicional, cuyo `count` decide). Esa distinción es toda la idempotencia: dos
 * notificaciones simultáneas del mismo invoice pueden leer el mismo estado previo, pero solo una
 * puede ganar el guard — y solo la que gana manda el correo. Es la misma forma del
 * `{ yaProcesado, transicion }` con el que `conCorreoPostPago` decide en el webhook de ventas.
 */
export interface TransicionInvoice {
  flowInvoiceId: string;
  /** Estado que quedó en el ledger. */
  despues: PlatformInvoiceStatus;
  /** `true` sii esta corrida ganó el avance (creó la fila o cambió su estado). */
  transiciono: boolean;
}

export interface CorreoDeFacturacion {
  tipo: TipoCorreoFacturacion;
  /** El invoice que lo motivó (comprobante / cobro fallido). Ausente en los de estado de la Tienda. */
  flowInvoiceId?: string;
}

/**
 * Correos que amerita la notificación, en el orden en que se mandan (primero el hecho concreto del
 * cobro, después el efecto sobre la Tienda).
 *
 * Un pago que además saca a la tienda de la pausa dispara LOS DOS (comprobante + regularizada) a
 * propósito: son mensajes distintos —«te cobramos $X» y «tu tienda volvió a vender»— y el segundo es
 * justamente la noticia que el Organizador está esperando.
 */
export function correosDeLaNotificacion({
  invoices,
  estadoAntes,
  estadoDespues,
  cambioEstado,
}: {
  invoices: TransicionInvoice[];
  estadoAntes: PlatformSubscriptionStatus;
  estadoDespues: PlatformSubscriptionStatus;
  /**
   * `true` sii esta corrida ganó el cambio de estado de la SUSCRIPCIÓN (mismo guard atómico que
   * `TransicionInvoice.transiciono`). Sin esto, dos notificaciones simultáneas que derivan ambas
   * `AL_DIA` desde `EN_PAUSA_POR_PAGO` mandarían dos veces «tu tienda volvió a vender».
   */
  cambioEstado: boolean;
}): CorreoDeFacturacion[] {
  const correos: CorreoDeFacturacion[] = [];

  // Un correo por invoice cuyo avance ganó ESTA corrida: dos invoices pagados en la misma
  // notificación son dos cobros distintos y merecen dos comprobantes.
  for (const inv of invoices) {
    if (!inv.transiciono) continue;
    if (inv.despues === "PAGADA") {
      correos.push({ tipo: "COMPROBANTE_PAGO", flowInvoiceId: inv.flowInvoiceId });
    } else if (inv.despues === "FALLIDA") {
      correos.push({ tipo: "COBRO_FALLIDO", flowInvoiceId: inv.flowInvoiceId });
    }
  }

  // Los dos avisos de ESTADO DE LA TIENDA exigen las dos condiciones: que el estado sea el que
  // amerita el aviso Y que esta corrida haya sido la que lo puso ahí.
  if (!cambioEstado) return correos;

  if (
    estadoDespues === "EN_PAUSA_POR_PAGO" &&
    estadoAntes !== "EN_PAUSA_POR_PAGO"
  ) {
    correos.push({ tipo: "TIENDA_EN_PAUSA" });
  }

  // Regularizarse es volver a AL_DIA desde una situación de mora. Un AL_DIA → AL_DIA (el mes normal)
  // no es una regularización: para eso está el comprobante.
  if (
    estadoDespues === "AL_DIA" &&
    (estadoAntes === "EN_PAUSA_POR_PAGO" || estadoAntes === "COBRO_PENDIENTE")
  ) {
    correos.push({ tipo: "TIENDA_REGULARIZADA" });
  }

  return correos;
}
