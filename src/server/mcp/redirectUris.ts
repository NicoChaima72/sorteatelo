/**
 * Política de `redirect_uri` del AS (D9 del plan, ADR-0025). Función PURA: el registro dinámico
 * (RFC 7591) es público —cualquiera puede pedir un `client_id`— así que esta lista es la única
 * barrera entre eso y "el AS entrega un authorization code en un host arbitrario".
 *
 * Registrar NO otorga nada: sin el consentimiento de un Organizador logueado no se emite ningún
 * code. Pero un redirect_uri libre convertiría al AS en un oráculo de codes si además se engaña
 * al usuario para que apruebe ⇒ dos formas permitidas y nada más:
 *
 * 1. **Loopback** (`localhost` / `127.0.0.1` / `[::1]`), cualquier puerto y path: es como los
 *    clientes de escritorio (Claude Code) reciben el callback, en un puerto efímero que no se
 *    puede conocer al registrar. `http` se acepta SOLO acá — el tráfico no sale de la máquina.
 * 2. **Allowlist exact-match de callbacks HTTPS conocidos**: los Organizadores no-técnicos usan
 *    Claude Desktop/web, que reciben el callback en un host de Anthropic. Terranova es
 *    loopback-only porque su único cliente es Claude Code; acá no alcanza.
 *
 * ⚠️ REVISABLE (D9): la allowlist es una constante de código a propósito —agregar un cliente es
 * un cambio revisado y deployado, no un dato editable. Si Anthropic cambia el callback o se suma
 * otro cliente de IA, se agrega ACÁ.
 */

/**
 * Callbacks HTTPS de clientes conocidos. Comparación por **igualdad de string completo**
 * (RFC 6749 §3.1.2.2 pide simple string comparison): ni prefijo, ni sufijo, ni "mismo host".
 */
export const CALLBACKS_HTTPS_PERMITIDOS: readonly string[] = [
  // Claude web / Claude Desktop (conectores MCP remotos).
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

const HOSTS_LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * ¿Es `uri` un redirect_uri aceptable para registrar un cliente (y para el exact-match posterior
 * del dance)? Sin excepciones ni comodines: cualquier cosa que no caiga en los dos casos de arriba
 * es `false`.
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
  return CALLBACKS_HTTPS_PERMITIDOS.includes(uri);
}
