/**
 * Helpers para armar URLs al APEX de la plataforma desde el storefront de un subdominio (F09b/F09c,
 * ADR-0019/D6). El login (OAuth) y el panel del Organizador viven en el apex (`NEXTAUTH_URL` fijo, un
 * único redirect URI de Google); el storefront vive en el subdominio. Un enlace de "Iniciar sesión" en
 * la tienda debe apuntar al apex con `callbackUrl` = la URL actual (validada contra `*.<apex>` por F08).
 * `apexDesdeHost`/`construirUrlApex` son PUROS (client+server safe, solo strings); `hrefApex` es el
 * atajo CLIENT-ONLY que cablea `window` + `env` (fuente única de la resolución del apex, F09c NIT-1).
 */

import { env } from "~/env";

/**
 * Deriva el dominio del apex desde el `hostname` de un subdominio de Tienda, quitando el label del
 * `slug`. `autora.sorteatelo.cl` + slug `autora` ⇒ `sorteatelo.cl`; `autora.localhost` ⇒ `localhost`.
 * Fallback: si el host no empieza con `<slug>.`, devuelve el host tal cual (defensivo).
 */
export function apexDesdeHost(hostname: string, slug: string): string {
  const prefijo = `${slug}.`;
  return hostname.startsWith(prefijo) ? hostname.slice(prefijo.length) : hostname;
}

/**
 * Construye una URL absoluta al apex: `<protocol>//<apex>[:puerto]<path>[?callbackUrl=...]`. El
 * `callbackUrl` se URL-encodea. `protocol` incluye los `:` (como `window.location.protocol`).
 */
export function construirUrlApex({
  protocol,
  apex,
  puerto,
  path,
  callbackUrl,
}: {
  protocol: string;
  apex: string;
  puerto?: string;
  path: string;
  callbackUrl?: string;
}): string {
  const host = puerto ? `${apex}:${puerto}` : apex;
  const url = `${protocol}//${host}${path}`;
  return callbackUrl ? `${url}?callbackUrl=${encodeURIComponent(callbackUrl)}` : url;
}

/**
 * Atajo CLIENT-ONLY: URL absoluta al APEX para `path` (`/login`, `/admin`), con el apex de env
 * (`NEXT_PUBLIC_PLATFORM_DOMAIN`, autoritativo) o derivado del host actual (localhost sin env), y el
 * protocolo/puerto del `window` actual. Es la FUENTE ÚNICA de la resolución del apex desde componentes
 * del storefront (F09c NIT-1: antes vivía duplicada en el header y en el banner con fallbacks distintos).
 * Solo se llama post-hidratación (necesita `window`). El `callbackUrl` opcional se URL-encodea.
 */
export function hrefApex({
  path,
  slug,
  callbackUrl,
}: {
  path: string;
  slug: string;
  callbackUrl?: string;
}): string {
  const apex =
    env.NEXT_PUBLIC_PLATFORM_DOMAIN ??
    apexDesdeHost(window.location.hostname, slug);
  return construirUrlApex({
    protocol: window.location.protocol,
    apex,
    puerto: window.location.port,
    path,
    callbackUrl,
  });
}
