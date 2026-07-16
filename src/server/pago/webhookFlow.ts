import { type NextApiRequest } from "next";

import type {
  ConfirmarPagoInput,
  TransicionPago,
} from "~/server/domain/pago/confirmarPagoDeOrden";
import { type EnrutarFlowFn } from "~/server/pago/enrutarPagoFlow";

/**
 * Núcleo testeable del webhook de Flow (patrón núcleo + wrapper Next, I7).
 *
 * Recibe un `req` acotado y sus dependencias inyectables (el ENRUTADOR multi-tenant
 * y el use case de dominio que aplica la confirmación); devuelve `{ status, body }` sin
 * escribir la respuesta ni tocar env. El wrapper (`src/pages/api/webhooks/flow.ts`) lee
 * env, cablea los adapters reales (enrutador contra `db` + credenciales cifradas, hook
 * post-pago) y escribe `res`.
 *
 * Política (ADR-0001/0006, backend-conventions § Gate antes de cualquier efecto):
 * - Gate de método: solo POST dispara efectos (otro método → 405 sin efecto).
 * - RUTEO multi-tenant (ADR-0006): del `token` se deriva QUÉ Tienda es dueña del pago;
 *   el `getStatus` resultante usa LAS credenciales de ESA Tienda (nunca otra, nunca
 *   globales). Un token que no matchea ningún Payment ⇒ ack+ignore (notificación ajena).
 * - La confirmación es SIEMPRE server-side contra `payment/getStatus`; el body del
 *   request NUNCA es prueba de pago (se consulta getStatus antes de cualquier efecto y
 *   se usa SU resultado). El `orderId` viene del ruteo (nuestra DB), no del body de Flow.
 * - Idempotencia delegada a `confirmarPago` (transición una sola vez por pago).
 */
export type ConfirmarPagoFn = (
  input: ConfirmarPagoInput,
) => Promise<{ yaProcesado: boolean; transicion: TransicionPago }>;

export interface ManejarWebhookFlowArgs {
  req: Pick<NextApiRequest, "method" | "headers" | "body">;
  /** Ruteo por tenant: token → { tenantId, orderId, getStatus } | null. */
  enrutarFlow: EnrutarFlowFn;
  confirmarPago: ConfirmarPagoFn;
}

/** Estado numérico de Flow → semántica del dominio. */
function mapearEstadoFlow(status: number): "PAGADO" | "FALLIDO" | "PENDIENTE" {
  if (status === 2) return "PAGADO"; // pagada
  if (status === 3 || status === 4) return "FALLIDO"; // rechazada / anulada
  return "PENDIENTE"; // 1 pendiente (o desconocido: ack sin efecto)
}

/** Extrae el token del body (objeto ya parseado o form-urlencoded crudo). */
function extraerToken(body: unknown): string | null {
  if (typeof body === "string") {
    return new URLSearchParams(body).get("token");
  }
  if (body && typeof body === "object" && "token" in body) {
    const t = (body as Record<string, unknown>).token;
    return typeof t === "string" ? t : null;
  }
  return null;
}

export async function manejarWebhookFlow({
  req,
  enrutarFlow,
  confirmarPago,
}: ManejarWebhookFlowArgs): Promise<{ status: number; body: unknown }> {
  // Gate 1: solo POST dispara efectos.
  if (req.method !== "POST") {
    return { status: 405, body: { error: "method_not_allowed" } };
  }

  // Gate 2: token presente. Sin token no hay nada que rutear ni confirmar: es una
  // notificación malformada/ajena = irreintentable → ack+ignorar (200) en vez de
  // 4xx, para no gatillar reintentos infinitos (backend-conventions § semántica
  // de reintento). El rechazo de método sí usa su código (405, arriba).
  const token = extraerToken(req.body);
  if (!token) {
    return { status: 200, body: { received: true, ignorado: "missing_token" } };
  }

  // Gate 3 (RUTEO, ADR-0006): derivar la Tienda dueña del pago desde el token ANTES de
  // cualquier efecto. Es una LECTURA (no muta estado). Si ningún Payment matchea el
  // token, la notificación es ajena/desconocida = irreintentable → ack+ignorar.
  const ruteo = await enrutarFlow(token);
  if (!ruteo) {
    return { status: 200, body: { received: true, ignorado: "unknown_token" } };
  }

  // Gate 4 (CRÍTICO, I2/ADR-0001): confirmación server-side contra Flow con las
  // credenciales del tenant dueño (ligadas por el ruteo). El body del request NUNCA es
  // prueba de pago; se consulta getStatus y se usa SU resultado.
  const flowPago = await ruteo.getStatus(token);
  const resultado = mapearEstadoFlow(flowPago.status);

  if (resultado === "PENDIENTE") {
    // Flow aún no resolvió; ack sin efecto (idempotente ante reintentos).
    return { status: 200, body: { received: true, estado: "pendiente" } };
  }

  const r = await confirmarPago({
    // Autoritativo: la orden dueña del token según NUESTRA DB (no el commerceOrder que
    // venga en la respuesta de Flow). Cierra la orden correcta del tenant correcto.
    commerceOrder: ruteo.orderId,
    resultado,
    fee: flowPago.paymentData?.fee,
    flowOrder: flowPago.flowOrder,
  });

  return {
    status: 200,
    body: {
      received: true,
      yaProcesado: r.yaProcesado,
      transicion: r.transicion,
    },
  };
}
