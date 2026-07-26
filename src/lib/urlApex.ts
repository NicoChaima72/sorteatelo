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
 * Construye una URL absoluta al SUBDOMINIO de una Tienda: `<protocol>//<slug>.<apex>[:puerto]<path>`
 * (admin-multi-tienda F02/F05, ADR-0022). Es el inverso de `construirUrlApex` y la ÚNICA forma de
 * armar una dirección de otra tienda — client (switcher del panel, "Ver mi tienda", editor) y server
 * (redirect del apex `/admin` ⇒ la primera tienda) comparten esta definición.
 *
 * El `apex` entra SIEMPRE pelado (sin subdominio y sin puerto): pegarle el slug al host ACTUAL —que
 * en el panel ya es `<tienda>.<apex>`— produciría `<otra>.<tienda>.<apex>`, una URL rota. Ese era
 * exactamente el bug de `url-tienda.ts` antes de esta feature.
 */
export function construirUrlSubdominio({
  protocol,
  apex,
  puerto,
  slug,
  path,
}: {
  protocol: string;
  apex: string;
  puerto?: string;
  slug: string;
  path: string;
}): string {
  const host = puerto ? `${slug}.${apex}:${puerto}` : `${slug}.${apex}`;
  return `${protocol}//${host}${path}`;
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

/**
 * Atajo CLIENT-ONLY: URL absoluta al SUBDOMINIO de la Tienda `slug` (admin-multi-tienda F05,
 * ADR-0022). `slugActual` es la tienda del host DONDE ESTOY (el panel vive en `<slugActual>.<apex>`)
 * y solo sirve para derivar el apex cuando `NEXT_PUBLIC_PLATFORM_DOMAIN` no está seteado (dev);
 * con la env presente —siempre en producción— manda la env.
 *
 * Lo usan el switcher de tiendas, "Ver mi tienda" y el enlace al editor. Solo post-hidratación.
 */
export function hrefSubdominio({
  slug,
  slugActual,
  path,
}: {
  slug: string;
  slugActual: string;
  path: string;
}): string {
  const apex =
    env.NEXT_PUBLIC_PLATFORM_DOMAIN ??
    apexDesdeHost(window.location.hostname, slugActual);
  return construirUrlSubdominio({
    protocol: window.location.protocol,
    apex,
    puerto: window.location.port,
    slug,
    path,
  });
}
