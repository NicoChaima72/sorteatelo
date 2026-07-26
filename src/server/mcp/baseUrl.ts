import { env } from "~/env";

/**
 * URL pública absoluta de la plataforma, sin barra final. Es el `issuer` del AS y el prefijo de
 * todos los endpoints que publica el discovery (RFC 8414/9728), además de la base del
 * `WWW-Authenticate` del handler MCP.
 *
 * Prefiere `APP_URL` (la que ya usa el correo transaccional para armar enlaces públicos) y cae a
 * `NEXTAUTH_URL`. **No hay env var nueva**: el AS vive en el mismo origen que el login (D3/I8).
 *
 * Siempre el APEX: el MCP es un endpoint único que cruza Tiendas (D3), nunca un subdominio.
 */
export function getAppBaseUrl(): string {
  const raw = (env.APP_URL ?? env.NEXTAUTH_URL).trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  // En Vercel, `NEXTAUTH_URL` puede llegar como `VERCEL_URL` sin protocolo (ver `env.js`).
  return `https://${raw.replace(/\/$/, "")}`;
}
