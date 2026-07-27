import { type NextApiRequest } from "next";

import type {
  CorreoAEnviar,
  ResultadoNotificacion,
} from "~/server/domain/facturacion/procesarNotificacionSuscripcion";
import { type NotificacionResuelta } from "~/server/facturacion/resolverSuscripcionDeToken";

/**
 * Núcleo TESTEABLE del webhook de suscripciones de plataforma (F04, ADR-0026) — patrón «núcleo +
 * wrapper Next» de backend-conventions § Endpoints pages/api, el mismo de `pago/webhookFlow.ts`.
 *
 * Recibe un `req` acotado y sus dependencias inyectables; devuelve `{ status, body }` sin escribir la
 * respuesta ni leer `env`. El wrapper (`src/pages/api/webhooks/flow-suscripciones.ts`) cablea el use
 * case contra `db` + el service de plataforma y el envío contra Resend.
 *
 * ── Por qué este webhook es MÁS FINO que el de ventas ─────────────────────────────────────────
 * El de ventas rutea por tenant y confirma con las credenciales del tenant dueño (ADR-0006), así que
 * el ruteo vive en el borde. Acá hay UNA sola cuenta Flow —la de la Plataforma (I1)— y el ruteo
 * necesita la DB y la respuesta de Flow a la vez (una notificación puede ser de un slot ya reusado o
 * de una suscripción huérfana, D16-C), así que la decisión completa vive en el use case y el borde se
 * queda con lo que de verdad es del transporte: el gate de método, sacar el identificador del body y
 * traducir el resultado a un código HTTP.
 *
 * Política (I3, backend-conventions § Gate antes de cualquier efecto):
 * - Solo POST dispara efectos (otro método ⇒ 405, sin tocar nada).
 * - Del body se toma **el identificador y nada más**: el estado, el monto y la mora se leen de la API
 *   de Flow dentro del use case. Un body que diga «pagada» no paga nada.
 * - **Semántica de reintento**: lo irreintentable (body sin identificador, token que Flow no
 *   reconoce) se ackea con 200 para no provocar reintentos infinitos; un fallo transitorio (Flow
 *   caído, DB) devuelve 500 A PROPÓSITO, porque el reintento de Flow es justamente la red que hace
 *   que no se pierda un cobro.
 * - Los correos salen **post-commit** y en log-and-continue (I9): un fallo de Resend no revierte la
 *   transición ni cambia el ack. Mismo principio que `conCorreoPostPago` en el webhook de ventas.
 */

export type ProcesarNotificacionFn = (input: {
  flowSubscriptionId: string;
  flowInvoiceId?: string;
  cobroPagado?: boolean;
}) => Promise<ResultadoNotificacion>;

/**
 * Traduce el `token` que Flow postea a la notificación resuelta —qué suscripción, qué cobro y si ese
 * cobro se pagó (F04). `null` = irreintentable. La implementación real consulta `payment/getStatus`
 * (`facturacion/resolverSuscripcionDeToken.ts`); acá entra inyectada porque el borde no habla con
 * Flow.
 */
export type ResolverIdDeSuscripcionFn = (
  token: string,
) => Promise<NotificacionResuelta | null>;

export type EnviarCorreosFacturacionFn = (
  correos: CorreoAEnviar[],
) => Promise<void>;

export interface ManejarWebhookSuscripcionesArgs {
  req: Pick<NextApiRequest, "method" | "headers" | "body">;
  procesarNotificacion: ProcesarNotificacionFn;
  resolverIdDeSuscripcion: ResolverIdDeSuscripcionFn;
  enviarCorreos: EnviarCorreosFacturacionFn;
}

/**
 * Cómo llega el identificador en el body, en orden de prioridad.
 *
 * **`token` es lo único que Flow manda de verdad** (verificado contra el sandbox real, 3ª pasada del
 * E2E: postea `application/x-www-form-urlencoded` con `token=<40 chars>` y NADA más). Antes acá solo
 * se miraba `subscriptionId`/`subscription_id` —dos claves inventadas por analogía con el resto de
 * su API— y por eso **toda notificación se ackeaba sin escribir una sola fila**: Flow cobraba y el
 * ledger quedaba vacío.
 *
 * Las dos claves con el id directo se siguen aceptando, pero como lo que son: una **puerta de
 * reconciliación manual** para re-disparar el espejo de una suscripción cuya notificación se perdió.
 * No habilitan nada por sí solas — el estado, el monto y la mora se leen de la API de Flow (I3).
 *
 * **Decisión consciente sobre esa puerta**: como el webhook no está autenticado (Flow no firma sus
 * notificaciones), un tercero puede empujar por ahí un id cualquiera y alcanzar el camino
 * DESTRUCTIVO de D16-C, que cancela suscripciones sin fila local. Se acepta porque para llegar a
 * cancelar algo hay que acertarle a un id **de nuestra propia cuenta Flow**, **sin fila local** y con
 * más de 15 minutos de vida — y esa combinación es exactamente la definición de huérfana, o sea el
 * caso en que cancelar es lo correcto. Si alguna vez molesta, se gatea con bearer como el cron.
 */
const CLAVES_ID_DIRECTO = ["subscriptionId", "subscription_id"] as const;

type Identificador =
  | { via: "token"; valor: string }
  | { via: "id"; valor: string }
  | null;

/** Lee el body (objeto ya parseado o form-urlencoded crudo) y dice cómo viene identificada. */
function extraerIdentificador(body: unknown): Identificador {
  const leer = campoDelBody(body);

  const token = leer("token");
  if (token) return { via: "token", valor: token };

  for (const clave of CLAVES_ID_DIRECTO) {
    const v = leer(clave);
    if (v) return { via: "id", valor: v };
  }
  return null;
}

/** Lector de un campo string del body, sirva Next el form parseado o crudo. */
function campoDelBody(body: unknown): (clave: string) => string | null {
  if (typeof body === "string") {
    const params = new URLSearchParams(body);
    return (clave) => {
      const v = params.get(clave);
      return v !== null && v.length > 0 ? v : null;
    };
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    return (clave) => {
      const v = obj[clave];
      return typeof v === "string" && v.length > 0 ? v : null;
    };
  }
  return () => null;
}

export async function manejarWebhookSuscripciones({
  req,
  procesarNotificacion,
  resolverIdDeSuscripcion,
  enviarCorreos,
}: ManejarWebhookSuscripcionesArgs): Promise<{
  status: number;
  body: unknown;
}> {
  // Gate 1: solo POST dispara efectos.
  if (req.method !== "POST") {
    return { status: 405, body: { error: "method_not_allowed" } };
  }

  // Gate 2: identificador presente. Sin él no hay nada que verificar contra Flow: notificación
  // malformada o ajena = irreintentable ⇒ ack+ignorar (200) en vez de un 4xx que dispararía
  // reintentos infinitos.
  const identificador = extraerIdentificador(req.body);
  if (!identificador) {
    return {
      status: 200,
      body: { received: true, ignorado: "sin_identificador" },
    };
  }

  // Gate 3: el token de Flow se cambia por el id de la suscripción contra `payment/getStatus`. Un
  // fallo transitorio acá PROPAGA (500 ⇒ Flow reintenta); un token que Flow no reconoce devuelve
  // `null` y se ackea, porque insistir no lo va a arreglar.
  // La puerta de reconciliación manual solo aporta el id de la suscripción: sin token no hay
  // `commerceOrder`, así que no se sabe de qué cobro se hablaba ni si se pagó. El use case lo
  // resuelve igual con lo que Flow le cuente de la suscripción entera.
  let notificacion: { flowSubscriptionId: string } & Partial<NotificacionResuelta>;
  if (identificador.via === "token") {
    let resuelto: NotificacionResuelta | null;
    try {
      resuelto = await resolverIdDeSuscripcion(identificador.valor);
    } catch (e) {
      console.error(
        "[facturacion] no se pudo resolver el token de la notificación (se responde 500 para que Flow reintente)",
        { error: e instanceof Error ? e.message : String(e) },
      );
      return { status: 500, body: { error: "token_no_resuelto" } };
    }
    if (!resuelto) {
      return {
        status: 200,
        body: { received: true, ignorado: "token_sin_suscripcion" },
      };
    }
    notificacion = resuelto;
  } else {
    notificacion = { flowSubscriptionId: identificador.valor };
  }

  const { flowSubscriptionId } = notificacion;

  let resultado: ResultadoNotificacion;
  try {
    resultado = await procesarNotificacion(notificacion);
  } catch (e) {
    // Fallo TRANSITORIO (API de Flow caída, hipo de la DB): 500 para que Flow reintente. Tragarlo con
    // un 200 sería perder el cobro en silencio — el peor final posible para una notificación de plata.
    console.error(
      "[facturacion] el webhook de suscripciones no pudo procesar la notificación (se responde 500 para que Flow reintente)",
      {
        flowSubscriptionId,
        error: e instanceof Error ? e.message : String(e),
      },
    );
    return { status: 500, body: { error: "processing_failed" } };
  }

  // ── Correos POST-COMMIT (I9) ──────────────────────────────────────────────────────────────────
  // La transición ya commiteó. Un fallo del proveedor de correo NO la revierte ni cambia el ack: el
  // Organizador se queda sin aviso (recuperable: el banner del panel y la página Plan cuentan lo
  // mismo), pero la facturación quedó registrada.
  if (resultado.correos.length > 0) {
    try {
      await enviarCorreos(resultado.correos);
    } catch (e) {
      console.error(
        "[facturacion] no se pudieron enviar los correos de facturación; la transición quedó registrada igual",
        {
          flowSubscriptionId,
          tipos: resultado.correos.map((c) => c.datos.tipo),
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  }

  return {
    status: 200,
    body: {
      received: true,
      ruteo: resultado.ruteo,
      estado: resultado.estadoDespues,
    },
  };
}
