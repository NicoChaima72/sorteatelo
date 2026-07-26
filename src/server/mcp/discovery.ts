/**
 * Metadata de discovery del MCP del Organizador — RFC 8414 (Authorization Server) y RFC 9728
 * (Protected Resource). Funciones PURAS sobre la base pública: los wrappers de
 * `src/pages/api/well-known/*` son los únicos que leen env, y `next.config.js` reescribe
 * `/.well-known/*` hacia ellos (Next no sirve rutas que empiezan con punto desde `pages/`).
 *
 * Esto es lo que hace que conectar el MCP sea `claude mcp add <url>` y nada más: el cliente
 * descubre acá los endpoints, se registra por DCR y corre el dance sin configuración manual.
 *
 * Todas las rutas son del APEX (D3): un solo endpoint MCP, un solo modo (`organizador`). El
 * token es per-usuario y cruza Tiendas, así que no puede colgar del host de una.
 */

/** Path del único handler MCP (D3). Constante compartida: la metadata y el borde no se desfasan. */
export const PATH_HANDLER_MCP = "/api/mcp/handler";

/** Scope único de v1 (D10). La matriz de límites vive en el registro de tools, no en scopes. */
const SCOPES = ["mcp"] as const;

export interface MetadataAuthorizationServer {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  revocation_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
}

export function metadataAuthorizationServer(
  base: string,
): MetadataAuthorizationServer {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`,
    revocation_endpoint: `${base}/api/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // I5: S256 obligatorio. Anunciar "plain" sería ofrecer el downgrade que PKCE existe para cerrar.
    code_challenge_methods_supported: ["S256"],
    // Cliente PÚBLICO sin secreto (RFC 7591 + OAuth 2.1): un cliente de escritorio no puede
    // guardar un secreto. Lo que ata el code al cliente es PKCE, no una credencial.
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES],
  };
}

export interface MetadataProtectedResource {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_documentation: string;
}

export function metadataProtectedResource(
  base: string,
): MetadataProtectedResource {
  return {
    resource: `${base}${PATH_HANDLER_MCP}`,
    // El AS y el resource server son la MISMA app (AS propio, D1).
    authorization_servers: [base],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/`,
  };
}
