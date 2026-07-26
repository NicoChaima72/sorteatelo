import { describe, expect, it } from "vitest";

import { validarRegistroCliente } from "~/server/mcp/registroCliente";

/**
 * Dynamic Client Registration (RFC 7591). Es el endpoint que hace que `claude mcp add <url>`
 * funcione solo: el cliente se registra sin credenciales previas. Registrar NO otorga acceso a
 * nada —hace falta que un Organizador logueado consienta— pero SÍ define a dónde puede terminar
 * un authorization code, así que la validación de `redirect_uris` (D9) es la pieza crítica.
 */

describe("mcp/registroCliente — DCR", () => {
  // mcp.oauth.040 — registro típico de un cliente de escritorio
  it("acepta loopback y tolera los campos del RFC que no usamos", () => {
    const r = validarRegistroCliente({
      client_name: "Claude Code",
      redirect_uris: ["http://127.0.0.1:33418/callback"],
      // Campos del RFC que el cliente manda y v1 ignora: aceptarlos sin romper es
      // compatibilidad, no permisividad (el scope siempre termina siendo "mcp", D10).
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp openid profile",
    });

    expect(r).toEqual({
      ok: true,
      clientName: "Claude Code",
      redirectUris: ["http://127.0.0.1:33418/callback"],
    });
  });

  // mcp.oauth.041 — D9 en el borde: un callback HTTPS ajeno no se registra
  it("rechaza redirect_uris fuera de la allowlist D9", () => {
    const r = validarRegistroCliente({
      client_name: "App rara",
      redirect_uris: ["https://evil.example.com/cb"],
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("debería rechazar");
    expect(r.error).toBe("invalid_client_metadata");

    // Basta UNA URI mala para rechazar el registro entero: no se acepta a medias.
    const mixto = validarRegistroCliente({
      redirect_uris: [
        "http://127.0.0.1:33418/callback",
        "https://evil.example.com/cb",
      ],
    });
    expect(mixto.ok).toBe(false);
  });

  // mcp.oauth.042 — el callback HTTPS de un cliente conocido SÍ (Claude Desktop/web, D9)
  it("acepta el callback HTTPS de Claude", () => {
    const r = validarRegistroCliente({
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    expect(r.ok).toBe(true);
  });

  // mcp.oauth.043 — metadata inservible
  it("exige al menos un redirect_uri y acota el largo del nombre", () => {
    expect(validarRegistroCliente({}).ok).toBe(false);
    expect(validarRegistroCliente({ redirect_uris: [] }).ok).toBe(false);
    expect(validarRegistroCliente(null).ok).toBe(false);
    expect(
      validarRegistroCliente({
        client_name: "x".repeat(500), // el nombre se muestra en el consent: no es campo libre infinito
        redirect_uris: ["http://127.0.0.1:1/cb"],
      }).ok,
    ).toBe(false);
  });

  // mcp.oauth.044 — sin nombre, el endpoint pone uno derivado del client_id
  it("deja clientName indefinido cuando el cliente no manda uno", () => {
    const r = validarRegistroCliente({
      redirect_uris: ["http://localhost:9999/cb"],
    });
    expect(r).toEqual({
      ok: true,
      clientName: undefined,
      redirectUris: ["http://localhost:9999/cb"],
    });
  });
});
