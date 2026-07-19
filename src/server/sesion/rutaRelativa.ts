/**
 * Guard PURO: ¿es `url` una ruta RELATIVA segura al mismo host? (F09c). El login DEV
 * (`/api/dev/login`) redirige acá tras crear la sesión, así que el destino debe quedarse en el mismo
 * host — jamás una URL absoluta o protocol-relative que saque al navegador a otro origen
 * (open-redirect). Más estricto que `validarCallbackUrl` (que sí admite absolutas dentro del wildcard):
 * acá SOLO se permite `/ruta`.
 *
 * Rechaza:
 *  - lo que no empieza con `/` (absoluto `https://…`, esquema `javascript:`, ruta suelta `editor`).
 *  - `//host` (protocol-relative ⇒ host ajeno).
 *  - `/\host` (los navegadores tratan `\` como `/` ⇒ mismo truco que `//`).
 */
export function esRutaRelativaSegura(url: string): boolean {
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//") || url.startsWith("/\\")) return false;
  return true;
}
