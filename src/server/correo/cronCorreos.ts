import { timingSafeEqual } from "crypto";

import { type ResultadoDrenado } from "~/server/domain/correo/drenarCorreosPendientes";
import { type ResultadoPlanificacion } from "~/server/domain/correo/planificarRecordatorios";

/**
 * Núcleo del endpoint de cron de correos (F02, ADR-0027 §4) — la POLÍTICA del borde, separada del
 * cableado. Puro: recibe un `req` acotado, el secreto y el drenado inyectados, y devuelve
 * `{ status, body }`. No toca `env`, no escribe `res`, no instancia adapters (patrón
 * `pago/webhookFlow.ts`).
 *
 * El wrapper Next es `src/pages/api/cron/correos.ts`, y quien lo llama es el cron horario
 * declarado en `vercel.json`, que manda `Authorization: Bearer $CRON_SECRET`.
 *
 * **Gate antes de cualquier efecto** (backend-conventions): este endpoint dispara envíos a
 * compradores de TODAS las Tiendas. Nada corre hasta que el método y el secreto están validados, y
 * si `CRON_SECRET` no está configurada el endpoint **falla cerrado** (500) en vez de quedar
 * abierto: una env var olvidada no puede convertirse en un disparador público de correos (I6).
 */

export interface ReqCron {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RespuestaCron {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Compara el bearer recibido con el esperado en tiempo constante. Los largos distintos se
 * descartan ANTES (`timingSafeEqual` lanza si difieren) — que el largo se filtre por timing es
 * irrelevante frente a que la comparación byte a byte no lo haga.
 */
function bearerValido(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const recibido = Buffer.from(header.slice("Bearer ".length));
  const esperado = Buffer.from(secret);
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}

export async function manejarCronCorreos({
  req,
  secret,
  planificar,
  drenar,
}: {
  req: ReqCron;
  /** `CRON_SECRET` de env. `undefined` ⇒ el endpoint responde 500 y no hace nada. */
  secret: string | undefined;
  /**
   * Paso PRODUCTOR de la corrida (F06): encola los recordatorios vencidos y retira los que dejaron
   * de corresponder. Va ANTES del drenado a propósito — lo que se encola en esta corrida sale en
   * esta misma, en vez de esperar una hora más. Es el único paso que puede escribir filas nuevas.
   */
  planificar: () => Promise<ResultadoPlanificacion>;
  drenar: () => Promise<ResultadoDrenado>;
}): Promise<RespuestaCron> {
  if (!secret) {
    return { status: 500, body: { error: "server_misconfigured" } };
  }

  // Vercel Cron invoca por GET. Un POST accidental (o un curl exploratorio) no dispara nada.
  if (req.method !== "GET") {
    return { status: 405, body: { error: "method_not_allowed" } };
  }

  const auth = req.headers.authorization;
  if (!bearerValido(typeof auth === "string" ? auth : undefined, secret)) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  try {
    // Planificar y drenar son dos mitades independientes: si la planificación falla, el drenado
    // NO se hace igual — un fallo acá suele ser la DB, y drenar con la DB a maltraer sería reclamar
    // filas que no vamos a poder confirmar (I2). El cron reintenta a la hora siguiente y la
    // reconciliación se encarga: nada se pierde por saltarse una corrida.
    const planificado = await planificar();
    const resumen = await drenar();
    return { status: 200, body: { ok: true, ...planificado, ...resumen } };
  } catch (e) {
    // El detalle va al log del servidor, NUNCA al body: el mensaje del adapter puede arrastrar
    // texto del proveedor (I6). El cron reintenta a la hora siguiente; las filas ya reclamadas
    // quedaron con su intento gastado y su `ultimoError` escrito.
    console.error("[cron/correos] la corrida falló", e);
    return { status: 500, body: { error: "drenado_fallido" } };
  }
}
