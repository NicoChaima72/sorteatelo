import { describe, expect, it } from "vitest";

import {
  metadataAuthorizationServer,
  metadataProtectedResource,
} from "~/server/mcp/discovery";

/**
 * Discovery del AS (RFC 8414) y del resource server (RFC 9728). Es lo que hace que
 * `claude mcp add` funcione SOLO: el cliente pide `/.well-known/*`, descubre los endpoints,
 * se registra por DCR y arranca el dance sin que nadie pegue una URL a mano.
 *
 * Puro sobre `base` inyectada: el borde (`/api/well-known/*`) es el único que lee env.
 */

const BASE = "https://sorteatelo.cl";

describe("mcp/discovery", () => {
  // mcp.oauth.010 — metadata del Authorization Server (RFC 8414)
  it("publica los 4 endpoints del AS y S256 como ÚNICO método de PKCE", () => {
    const meta = metadataAuthorizationServer(BASE);

    expect(meta.issuer).toBe(BASE);
    expect(meta.authorization_endpoint).toBe(`${BASE}/api/mcp/oauth/authorize`);
    expect(meta.token_endpoint).toBe(`${BASE}/api/mcp/oauth/token`);
    expect(meta.registration_endpoint).toBe(`${BASE}/api/mcp/oauth/register`);
    expect(meta.revocation_endpoint).toBe(`${BASE}/api/mcp/oauth/revoke`);

    expect(meta.response_types_supported).toEqual(["code"]);
    expect(meta.grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    // I5: S256 y nada más. Publicar "plain" sería anunciar un downgrade.
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    // Cliente público sin secreto: la seguridad la da PKCE, no una credencial de cliente.
    expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]);
    // D10: scope único.
    expect(meta.scopes_supported).toEqual(["mcp"]);
  });

  // mcp.oauth.011 — metadata del Protected Resource (RFC 9728): apunta al handler MCP y al AS
  it("apunta al handler MCP único del apex y al AS propio", () => {
    const meta = metadataProtectedResource(BASE);

    expect(meta.resource).toBe(`${BASE}/api/mcp`);
    expect(meta.authorization_servers).toEqual([BASE]);
    expect(meta.bearer_methods_supported).toEqual(["header"]);
    expect(meta.scopes_supported).toEqual(["mcp"]);
  });

  // mcp.oauth.012 — la base se respeta tal cual (dev en :3001, prod en el apex)
  it("deriva todo de la base recibida, sin hosts hardcodeados", () => {
    const meta = metadataAuthorizationServer("http://localhost:3001");
    expect(meta.issuer).toBe("http://localhost:3001");
    expect(meta.token_endpoint).toBe(
      "http://localhost:3001/api/mcp/oauth/token",
    );
    expect(metadataProtectedResource("http://localhost:3001").resource).toBe(
      "http://localhost:3001/api/mcp",
    );
  });
});
