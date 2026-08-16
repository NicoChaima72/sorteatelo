/**
 * Derivación de la URL de RETORNO de Flow desde el request (F04/D6). El comprador vuelve de Flow
 * al SUBDOMINIO de SU Tienda (`<slug>.<dominio>/checkout/retorno`, página con marca) — no al apex
 * ni a la env global `FLOW_URL_RETURN`. Como el request del storefront SIEMPRE llega al subdominio
 * del tenant, el host del request YA trae el slug correcto: derivar de él es totalmente server-side,
 * no hardcodea el dominio (decisión #4 sigue abierta) y coincide con "slug + config de plataforma"
 * (S5) porque el host ES `<slug>.<dominio>`.
 *
 * El `urlConfirmation` del WEBHOOK queda GLOBAL e intacto (rutea por token⇒tenant, ADR-0006): esto
 * NO lo toca. Ambas funciones son puras y testeables.
 */

/** Ruta (path) de la página de retorno con marca del storefront. */
const PATH_RETORNO = "/checkout/retorno";

/**
 * Origen (`<proto>://<host>`) del request, o `null` si no hay host. El protocolo sale de
 * `x-forwarded-proto` si el request viene por un proxy/plataforma (se toma el primero); si no,
 * `http` para hosts locales (`localhost`/`*.localhost`, dev) y `https` para el resto.
 */
export function origenDeRequest({
  host,
  forwardedProto,
}: {
  host: string | undefined | null;
  forwardedProto?: string | string[] | undefined | null;
}): string | null {
  if (!host) return null;

  const proto = protocoloDe(host, forwardedProto);
  return `${proto}://${host}`;
}

function protocoloDe(
  host: string,
  forwardedProto: string | string[] | undefined | null,
): string {
  const crudo = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const declarado = crudo?.split(",")[0]?.trim().toLowerCase();
  if (declarado) return declarado;

  const sinPuerto = host.toLowerCase().replace(/:\d+$/, "");
  const esLocal = sinPuerto === "localhost" || sinPuerto.endsWith(".localhost");
  return esLocal ? "http" : "https";
}

/**
 * URL de retorno final: `<origen>/checkout/retorno` si hay origen; si no, el `fallback` (la env
 * global `FLOW_URL_RETURN`), que puede ser `undefined` — en ese caso el service Flow hace fail-fast
 * al crear el pago (I7). Con origen presente NUNCA se usa la env global (D6).
 */
export function construirUrlRetorno(
  origen: string | null | undefined,
  fallback: string | undefined,
): string | undefined {
  if (origen) return `${origen}${PATH_RETORNO}`;
  return fallback;
}

/**
 * Techo del token que aceptamos re-emitir en la URL. Los tokens reales de Flow miden 40
 * caracteres; algo mucho más largo no es un token — es basura o un intento de abuso, y NO se
 * refleja de vuelta en un redirect.
 */
const LARGO_MAX_TOKEN_RETORNO = 200;

/**
 * Destino del redirect cuando Flow devuelve al Comprador con un **POST** (incidente 2026-08-16):
 * `payment/create` recibe `urlReturn` y Flow retorna el navegador con un form auto-submit que
 * trae el `token` en el BODY urlencoded — no en la query. La página de retorno lee `?token=` (su
 * contrato con `estadoOrden`), así que TODO comprador real aterrizaba en la fase `sin_token`
 * («No encontramos tu compra») aunque su pago, su ticket y su correo salieran perfectos.
 *
 * Esta función es el núcleo PURO del puente: recibe el body crudo del POST y devuelve el destino
 * del `303 See Other` (303 a propósito: convierte el POST en GET sobre la misma página, que desde
 * ahí funciona exactamente como siempre). Sin token legible ⇒ el path pelado, que cae en la fase
 * `sin_token` — la misma degradación honesta de hoy, nunca un error nuevo.
 *
 * I6/ADR-0001 intacto: el token en la URL NO es prueba de pago — la página solo lo usa para
 * SONDEAR `estadoOrden`, y la verdad sigue siendo el webhook.
 */
export function destinoRetornoDesdePost(
  body: string | null | undefined,
): string {
  if (!body) return PATH_RETORNO;
  const token = new URLSearchParams(body).get("token")?.trim();
  if (!token || token.length > LARGO_MAX_TOKEN_RETORNO) return PATH_RETORNO;
  return `${PATH_RETORNO}?token=${encodeURIComponent(token)}`;
}
