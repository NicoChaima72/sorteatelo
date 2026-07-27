/**
 * IP del cliente a partir de las cabeceras del request (F05/D5). Puro y testeable: recibe las
 * cabeceras ya leídas, no un `req`.
 *
 * Para qué existe: el consentimiento de recordatorios se guarda con timestamp + IP + texto exacto
 * (Ley 21.719, consentimiento demostrable). La IP es evidencia, no identidad — nada la usa para
 * autorizar, y por eso alcanza con lo que declara el proxy.
 *
 * **En Vercel la app corre detrás de un proxy**, así que `socket.remoteAddress` es la IP del edge y
 * no la del Comprador; la buena viaja en `x-forwarded-for`. Esa cabecera es una LISTA
 * (`cliente, proxy1, proxy2`) y el primero es el cliente original — pero también es un valor que
 * cualquiera puede falsificar en un request directo. Se acepta igual y a propósito: acá no se
 * autoriza nada con esto, y una IP declarada es mejor evidencia que ninguna. Lo que NO se hace es
 * inventar: sin cabecera utilizable, `null`.
 */

/** Techo de largo: `inet6` textual son 45 caracteres; 64 deja margen sin admitir un payload. */
const MAX_LARGO_IP = 64;

export function ipDeRequest(
  // `Record` laxo y no un shape cerrado: el tipo real de Next es `IncomingHttpHeaders`, que es un
  // índice abierto y no "tiene en común" un objeto de dos claves opcionales. Acá solo se leen dos
  // cabeceras, así que la forma laxa es la honesta y además deja el helper testeable con literales.
  headers: Record<string, string | string[] | undefined>,
): string | null {
  // Orden deliberado: `x-forwarded-for` primero (es la que pone Vercel), `x-real-ip` como respaldo
  // de otros proxies (nginx). Si un día no hay ninguna, el consentimiento se guarda sin IP y sigue
  // siendo válido.
  const candidatas = [headers["x-forwarded-for"], headers["x-real-ip"]];
  for (const cruda of candidatas) {
    const valor = Array.isArray(cruda) ? cruda[0] : cruda;
    // El primer tramo de la lista es el cliente original; el resto son los proxies del camino.
    const primera = valor?.split(",")[0]?.trim();
    if (primera && primera.length <= MAX_LARGO_IP) return primera;
  }
  return null;
}
