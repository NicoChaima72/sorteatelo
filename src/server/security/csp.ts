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
 *  - `frame-src` = allowlist EXACTA de orígenes de embeds (fuente única con `embeds.ts`) **más el
 *    origen del bucket público de assets** cuando está configurado (admin-bases-pdf F04/D6): la
 *    página `/bases` embebe en un `<iframe>` el PDF de bases del sorteo, servido desde ese bucket
 *    (ADR-0008/0013). Se agrega el ORIGEN solamente (nunca el path), y solo si la env está puesta.
 *  - `base-uri 'self'`: sin secuestro de `<base>`.
 *
 * ARRANQUE EN **Report-Only** (`CSP_HEADER`): reporta violaciones sin bloquear, para no romper los
 * estilos inline de Mantine ni el HMR de Next mientras se observa (D9). El paso a enforcing +
 * `script-src` con nonce (threading en `_document`) es trabajo de la fase siguiente (ver Bitácora).
 */

/** Header de arranque: Report-Only (no bloquea; solo reporta). El flip a enforcing es posterior. */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

/**
 * Origen (`https://host`) de una URL base, o `null` si no hay/no parsea. PURA. Se usa para meter en
 * la allowlist el HOST del bucket público sin arrastrar el path — una CSP con un path es un error
 * silencioso (las directivas de origen no matchean paths). Tolerante a propósito: `R2_PUBLIC_BASE_URL`
 * es opcional en `env.js`, y una CSP no puede tumbar el sitio porque falte una env de assets.
 */
function origenDe(baseUrl: string | undefined): string | null {
  if (!baseUrl?.trim()) return null;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

export function construirCSP({
  esDev,
  esPreview = false,
  baseUrlAssetsPublicos,
}: {
  esDev: boolean;
  /** `true` en las respuestas de preview del editor (`?preview=`): relaja `frame-ancestors` a `'self'`. */
  esPreview?: boolean;
  /**
   * `R2_PUBLIC_BASE_URL` (bucket público de assets, ADR-0013). Si viene, su ORIGEN entra en
   * `frame-src` para que el visor de `/bases` pueda embeber el PDF (F04/D6). Ausente/inválida ⇒ la
   * CSP queda EXACTAMENTE como antes (ni se rompe ni se afloja).
   */
  baseUrlAssetsPublicos?: string;
}): string {
  const origenAssets = origenDe(baseUrlAssetsPublicos);
  const frameSrc = [
    "'self'",
    ...(origenAssets ? [origenAssets] : []),
    ...ORIGENES_EMBED,
  ].join(" ");
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
