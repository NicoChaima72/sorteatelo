import { timingSafeEqual } from "crypto";

/**
 * Núcleo del endpoint del **cron diario de facturación** (F09/D11, ADR-0026) — la POLÍTICA del borde,
 * separada del cableado. Puro: recibe un `req` acotado, el secreto y la corrida inyectada, y devuelve
 * `{ status, body }`. No toca `env`, no escribe `res`, no instancia adapters.
 *
 * El wrapper Next es `src/pages/api/cron/facturacion.ts`, y quien lo llama es el cron diario
 * declarado en `vercel.json`, que manda `Authorization: Bearer $CRON_SECRET`.
 *
 * **Gate antes de cualquier efecto** (backend-conventions): este endpoint le manda correos de cobro
 * a los Pagadores de TODAS las Tiendas. Nada corre hasta que el método y el secreto están validados,
 * y si `CRON_SECRET` no está configurada **falla cerrado** (500) en vez de quedar abierto — una env
 * var olvidada no puede volverse un disparador público de correos (I7).
 *
 * ── Por qué esto no reusa `server/correo/cronCorreos.ts` ──────────────────────────────────────
 * Es la MISMA política (bearer en tiempo constante + fail-closed + solo GET) y la duplicación es
 * consciente: aquel núcleo está tipado contra el `ResultadoDrenado` de la máquina de correos al
 * Comprador (ADR-0027), un contrato ajeno a esta feature. Doblarlo para que sirviera a los dos
 * acoplaría dos crons que no comparten dominio. Es la **segunda** aparición del patrón; la regla del
 * repo extrae a la tercera, y ahí el helper compartido sale solo (`req`, secreto, corrida ⇒ respuesta).
 */

export interface ReqCronFacturacion {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RespuestaCronFacturacion {
  status: number;
  body: Record<string, unknown>;
}

/** Resumen de la corrida: qué se aplicó, cuántos avisos salieron y cómo le fue al despacho. */
export interface ResumenCorridaFacturacion {
  renovaciones: number;
  exenciones: number;
  /** Promociones de plan del Pagador aplicadas en Flow (F06/D7). */
  promociones: number;
  enviados: number;
  fallidos: number;
}

/**
 * Compara el bearer recibido con el esperado en tiempo constante. Los largos distintos se descartan
 * ANTES (`timingSafeEqual` lanza si difieren): que el largo se filtre por timing es irrelevante
 * frente a que la comparación byte a byte no lo haga.
 */
function bearerValido(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const recibido = Buffer.from(header.slice("Bearer ".length));
  const esperado = Buffer.from(secret);
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}

export async function manejarCronFacturacion({
  req,
  secret,
  ejecutar,
}: {
  req: ReqCronFacturacion;
  /** `CRON_SECRET` de env. `undefined` ⇒ el endpoint responde 500 y no hace nada. */
  secret: string | undefined;
  ejecutar: () => Promise<ResumenCorridaFacturacion>;
}): Promise<RespuestaCronFacturacion> {
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
    const resumen = await ejecutar();
    return { status: 200, body: { ok: true, ...resumen } };
  } catch (e) {
    // El detalle al log del servidor, NUNCA al body: el mensaje puede arrastrar el DSN o el correo
    // de un Pagador (I7). El cron reintenta mañana, y las marcas de idempotencia hacen que la
    // corrida siguiente retome exactamente lo que quedó sin avisar.
    console.error("[cron/facturacion] la corrida falló", e);
    return { status: 500, body: { error: "corrida_fallida" } };
  }
}
