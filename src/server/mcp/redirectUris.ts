/**
 * Política de `redirect_uri` del AS (D9 del plan, ADR-0025). Función PURA: el registro dinámico
 * (RFC 7591) es público —cualquiera puede pedir un `client_id`— así que esta lista es la única
 * barrera entre eso y "el AS entrega un authorization code en un host arbitrario".
 *
 * Registrar NO otorga nada: sin el consentimiento de un Organizador logueado no se emite ningún
 * code. Pero un redirect_uri libre convertiría al AS en un oráculo de codes si además se engaña
 * al usuario para que apruebe ⇒ tres formas permitidas y nada más:
 *
 * 1. **Loopback** (`localhost` / `127.0.0.1` / `[::1]`), cualquier puerto y path: es como los
 *    clientes de escritorio (Claude Code) reciben el callback, en un puerto efímero que no se
 *    puede conocer al registrar. `http` se acepta SOLO acá — el tráfico no sale de la máquina.
 * 2. **Allowlist exact-match de callbacks HTTPS conocidos**: los Organizadores no-técnicos usan
 *    Claude Desktop/web, que reciben el callback en un host de Anthropic. Terranova es
 *    loopback-only porque su único cliente es Claude Code; acá no alcanza.
 * 3. **Prefijo ANCLADO sobre la URL parseada** (F05/D12, addendum del ADR-0025): para el cliente
 *    cuyo callback tiene el path dinámico —ChatGPT usa un `callback_id` distinto por conector, así
 *    que no hay string exacto que listar. Es la única forma que NO es igualdad, y por eso su
 *    comparación es sobre la URL YA PARSEADA (`origin` exacto), jamás sobre el string crudo.
 *
 * ⚠️ REVISABLE (D9): la allowlist es una constante de código a propósito —agregar un cliente es
 * un cambio revisado y deployado, no un dato editable. Si Anthropic cambia el callback o se suma
 * otro cliente de IA, se agrega ACÁ. **Un cliente nuevo entra por (2) mientras su callback sea un
 * string fijo; (3) se reserva para los que de verdad tienen path dinámico** — el caso 2 es más
 * barato de auditar y hay que preferirlo.
 */

/**
 * Callbacks HTTPS de clientes conocidos. Comparación por **igualdad de string completo**
 * (RFC 6749 §3.1.2.2 pide simple string comparison): ni prefijo, ni sufijo, ni "mismo host".
 */
export const CALLBACKS_HTTPS_PERMITIDOS: readonly string[] = [
  // Claude web / Claude Desktop (conectores MCP remotos).
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  // ChatGPT — callback LEGACY de la plataforma de conectores de OpenAI. Es un string FIJO, así que
  // entra acá y no por el prefijo de abajo. Sigue vigente para apps ya publicadas.
  "https://chatgpt.com/connector_platform_oauth_redirect",
];

/**
 * Callbacks HTTPS con **path dinámico por conector**, la única familia que no se puede listar como
 * string: ChatGPT redirige a `https://chatgpt.com/connector/oauth/{callback_id}` y el `callback_id`
 * es distinto en cada instalación (F05/D12).
 *
 * `origin` es **exacto** —no "termina en", no "contiene"— y se compara contra el `origin` que el
 * parser ya resolvió, con lo que quedan afuera `chatgpt.com.evil.com`, `sub.chatgpt.com`, un puerto
 * no-default y las trampas de userinfo/percent-encoding que hacen que un string ARRANQUE con
 * `https://chatgpt.com` apuntando a otro host. `path` es el prefijo, y siempre tiene que sobrar
 * algo después (el id).
 */
const PREFIJOS_HTTPS_PERMITIDOS: readonly { origin: string; path: string }[] = [
  { origin: "https://chatgpt.com", path: "/connector/oauth/" },
];

const HOSTS_LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * ¿Es `uri` un redirect_uri aceptable para registrar un cliente (y para el exact-match posterior
 * del dance)? Sin excepciones ni comodines: cualquier cosa que no caiga en los tres casos de arriba
 * es `false`.
 *
 * Ojo con lo que esta función NO es: el `redirect_uri` del dance sigue teniendo que coincidir
 * **string a string** con uno de los que el cliente registró (`redirectUriVerificada` en
 * `decidirAuthorize.ts` exige las dos cosas). El caso 3 ensancha qué se puede REGISTRAR, no
 * afloja la verificación de cada `/authorize`.
 */
export function esRedirectUriPermitida(uri: string): boolean {
  if (!uri) return false;

  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false; // no parsea ⇒ no se usa
  }

  // Solo http/https: mata `javascript:`, `data:`, y esquemas custom de app.
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // RFC 6749 §3.1.2: la redirect URI NO puede traer fragmento (el fragmento no llega al server
  // y abre un canal para colar payloads en el cliente).
  if (url.hash !== "") return false;

  // Userinfo embebido: `http://127.0.0.1@evil.com/cb` LEE como loopback y no lo es (el host real
  // es evil.com). Se rechaza de plano en vez de confiar en que el lector note la arroba.
  if (url.username !== "" || url.password !== "") return false;

  // Caso 1: loopback — puerto y path libres (el cliente elige un puerto efímero al vuelo).
  if (HOSTS_LOOPBACK.has(url.hostname.toLowerCase())) return true;

  // Caso 2: allowlist HTTPS exact-match sobre la URI COMPLETA tal como vino.
  if (url.protocol !== "https:") return false;
  if (CALLBACKS_HTTPS_PERMITIDOS.includes(uri)) return true;

  // Caso 3: prefijo anclado sobre la URL YA PARSEADA (nunca sobre `uri`, que es el string tal
  // como lo mandó quien registra). Tres condiciones juntas, y ninguna sobra:
  //   · `origin` EXACTO — es lo que ancla el host;
  //   · algo DESPUÉS del prefijo (el `callback_id`), nunca el prefijo pelado;
  //   · sin query — un `?` deja colar parámetros propios en la URL a la que el AS manda el code.
  // El fragmento y el userinfo ya los rechazó el bloque de arriba, para los tres casos.
  return PREFIJOS_HTTPS_PERMITIDOS.some(
    (p) =>
      url.origin === p.origin &&
      url.pathname.startsWith(p.path) &&
      url.pathname.length > p.path.length &&
      url.search === "",
  );
}
