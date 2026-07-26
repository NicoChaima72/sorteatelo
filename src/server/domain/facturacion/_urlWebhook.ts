/**
 * Núcleo PURO de la URL del webhook de suscripciones (F02/F04, ADR-0026).
 *
 * Vive acá y no en el borde porque tiene DOS consumidores que leen env de formas distintas: el
 * cableado de la app (`facturacion/flowPlataformaDeEnv.ts`, que usa `~/env` tipado) y el script CLI
 * (`scripts/bootstrap-planes-plataforma.ts`, que lee `process.env` crudo porque corre fuera de
 * Next). Con la lógica duplicada, un cambio de prioridad en una copia dejaría al script registrando
 * en Flow un `urlCallback` distinto del que la app cree tener — y eso solo se descubre cuando un
 * cobro real no notifica.
 */

/**
 * Ruta del webhook de suscripciones. Es de PLATAFORMA y NO lleva subdominio de tenant: Flow
 * notifica acá el cobro de CUALQUIER suscripción, y el ruteo a la Tienda lo hace el
 * `flowSubscriptionId` contra nuestra DB, jamás el host (mismo criterio que `/api/webhooks/flow`).
 */
export const RUTA_WEBHOOK_SUSCRIPCIONES = "/api/webhooks/flow-suscripciones";

/**
 * Arma el `urlCallback` que se registra en los planes de Flow. Prioridad:
 *
 * 1. La env var explícita (`FLOW_PLATAFORMA_URL_CALLBACK`) — en dev el webhook necesita un túnel
 *    público, exactamente como `FLOW_URL_CONFIRMATION` del mundo BYO.
 * 2. La URL pública de la app (`APP_URL`, si no `NEXTAUTH_URL`) + la ruta del webhook.
 *
 * Devuelve `null` si no hay ninguna base utilizable, para que el caller falle con un mensaje que
 * diga QUÉ configurar en vez de registrar en Flow una URL rota (un plan con `urlCallback` inválido
 * se descubre recién cuando el primer cobro no notifica).
 */
export function derivarUrlCallback({
  explicita,
  appUrl,
  nextAuthUrl,
}: {
  explicita?: string;
  appUrl?: string;
  nextAuthUrl?: string;
}): string | null {
  if (explicita) return explicita;

  const base = appUrl ?? nextAuthUrl;
  if (!base?.startsWith("http")) return null;

  // Sin barra final duplicada: `https://x.cl/` + `/api/...` daría `//api/...`, que algunos
  // routers tratan como una ruta distinta.
  return `${base.replace(/\/$/, "")}${RUTA_WEBHOOK_SUSCRIPCIONES}`;
}
