import { type NextApiRequest } from "next";

import type {
  CorreoAEnviar,
  ResultadoNotificacion,
} from "~/server/domain/facturacion/procesarNotificacionSuscripcion";

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
 * - **Semántica de reintento**: lo irreintentable (body sin identificador) se ackea con 200 para no
 *   provocar reintentos infinitos; un fallo transitorio (Flow caído, DB) devuelve 500 A PROPÓSITO,
 *   porque el reintento de Flow es justamente la red que hace que no se pierda un cobro.
 * - Los correos salen **post-commit** y en log-and-continue (I9): un fallo de Resend no revierte la
 *   transición ni cambia el ack. Mismo principio que `conCorreoPostPago` en el webhook de ventas.
 */

export type ProcesarNotificacionFn = (input: {
  flowSubscriptionId: string;
}) => Promise<ResultadoNotificacion>;

export type EnviarCorreosFacturacionFn = (
  correos: CorreoAEnviar[],
) => Promise<void>;

export interface ManejarWebhookSuscripcionesArgs {
  req: Pick<NextApiRequest, "method" | "headers" | "body">;
  procesarNotificacion: ProcesarNotificacionFn;
  enviarCorreos: EnviarCorreosFacturacionFn;
}

/**
 * Claves con las que Flow puede mandar el id de la suscripción. Su API mezcla camelCase y snake_case
 * (`planId`/`urlCallback` conviven con `url_return`/`at_period_end`), y el shape exacto de la
 * notificación del plan está PENDIENTE de verificación contra el sandbox: aceptar las dos formas
 * cuesta una línea, y el identificador no habilita nada por sí solo (todo se verifica server-side).
 */
const CLAVES_ID = ["subscriptionId", "subscription_id"] as const;

/** Extrae el id de la suscripción del body (objeto ya parseado o form-urlencoded crudo). */
function extraerSubscriptionId(body: unknown): string | null {
  if (typeof body === "string") {
    const params = new URLSearchParams(body);
    for (const clave of CLAVES_ID) {
      const v = params.get(clave);
      if (v) return v;
    }
    return null;
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const clave of CLAVES_ID) {
      const v = obj[clave];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

export async function manejarWebhookSuscripciones({
  req,
  procesarNotificacion,
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
  const flowSubscriptionId = extraerSubscriptionId(req.body);
  if (!flowSubscriptionId) {
    return {
      status: 200,
      body: { received: true, ignorado: "missing_subscription_id" },
    };
  }

  let resultado: ResultadoNotificacion;
  try {
    resultado = await procesarNotificacion({ flowSubscriptionId });
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
