import { ORIGENES_EMBED } from "~/lib/pagebuilder/embeds";

/**
 * Content Security Policy de la plataforma (F07/D9, ADR-0018). Puro y testeable — el middleware lo
 * cabla al header. Con la cookie de sesión al wildcard (ADR-0019), la CSP deja de ser solo anti-XSS:
 * es control de aislamiento de sesión. Directivas críticas:
 *  - `frame-ancestors 'none'`: el storefront/checkout NO se deja iframear (anti-clickjacking).
 *    EXCEPCIÓN (catálogo-v2 F09/D6/D7): las respuestas de PREVIEW (`?preview=<token>`) emiten
 *    `frame-ancestors 'self'` para que el editor same-origin (`<slug>.<apex>/editor`) pueda iframear
 *    el Borrador. El resto del sitio conserva `'none'` — el anti-clickjacking del storefront público
 *    queda intacto (la preview solo se sirve con token válido, I5).
 *  - `object-src 'none'`: sin plugins/Flash.
 *  - `connect-src 'self'` (+ `ws:` en dev para el HMR): anti-exfiltración.
 *  - `frame-src` = allowlist EXACTA de orígenes de embeds (fuente única con `embeds.ts`).
 *  - `base-uri 'self'`: sin secuestro de `<base>`.
 *
 * ARRANQUE EN **Report-Only** (`CSP_HEADER`): reporta violaciones sin bloquear, para no romper los
 * estilos inline de Mantine ni el HMR de Next mientras se observa (D9). El paso a enforcing +
 * `script-src` con nonce (threading en `_document`) es trabajo de la fase siguiente (ver Bitácora).
 */

/** Header de arranque: Report-Only (no bloquea; solo reporta). El flip a enforcing es posterior. */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

export function construirCSP({
  esDev,
  esPreview = false,
}: {
  esDev: boolean;
  /** `true` en las respuestas de preview del editor (`?preview=`): relaja `frame-ancestors` a `'self'`. */
  esPreview?: boolean;
}): string {
  const frameSrc = ["'self'", ...ORIGENES_EMBED].join(" ");
  // Solo la preview (servida con token válido) se deja iframear por el editor same-origin (D6/D7); el
  // resto del sitio conserva `'none'` (anti-clickjacking del storefront público intacto).
  const frameAncestors = esPreview ? "'self'" : "'none'";
  // Mantine inyecta estilos inline ⇒ `style-src 'unsafe-inline'`. Next en dev evalúa (HMR) ⇒
  // `'unsafe-eval'` solo en dev. El endurecimiento de `script-src` con nonce va en la fase enforcing.
  const scriptSrc = esDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";
  const connectSrc = esDev ? "'self' ws: wss:" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}
