import { describe, expect, it } from "vitest";

import { decidirAuthorize } from "~/server/mcp/decidirAuthorize";

/**
 * Decisión pura del endpoint `/api/mcp/oauth/authorize`. El wrapper solo hace la búsqueda del
 * cliente en DB, lee la sesión NextAuth y escribe la respuesta; TODA la política está acá.
 *
 * La regla de oro (anti-hijacking): mientras el `redirect_uri` no esté verificado contra el
 * cliente registrado, el AS NO redirige a él — responde un error propio. Redirigir un error a
 * una URI no verificada es entregarle el `state` (y la existencia del cliente) a quien la puso.
 */

const REDIRECT = "http://127.0.0.1:33418/callback";

const BASE = {
  response_type: "code",
  client_id: "cliente-1",
  redirect_uri: REDIRECT,
  code_challenge: "abc123",
  code_challenge_method: "S256",
  scope: "mcp",
  state: "st-1",
};

describe("mcp/decidirAuthorize", () => {
  // mcp.oauth.020 — cliente no verificado ⇒ error PROPIO, jamás redirect a su URI
  it("no redirige a un redirect_uri no verificado: params faltantes, cliente inexistente o URI ajena", () => {
    // Falta code_challenge (PKCE obligatorio, I5).
    expect(
      decidirAuthorize({
        params: { ...BASE, code_challenge: undefined },
        redirectUrisDelCliente: [REDIRECT],
        haySesion: true,
      }),
    ).toMatchObject({ tipo: "error_json", status: 400, error: "invalid_request" });

    // Cliente inexistente (null = no está en DB).
    expect(
      decidirAuthorize({
        params: BASE,
        redirectUrisDelCliente: null,
        haySesion: true,
      }),
    ).toMatchObject({ tipo: "error_json", status: 400, error: "invalid_client" });

    // URI que el cliente NO registró.
    expect(
      decidirAuthorize({
        params: { ...BASE, redirect_uri: "http://127.0.0.1:9999/otro" },
        redirectUrisDelCliente: [REDIRECT],
        haySesion: true,
      }),
    ).toMatchObject({
      tipo: "error_json",
      status: 400,
      error: "invalid_redirect_uri",
    });
  });

  // mcp.oauth.021 — D9 se re-evalúa acá: una URI registrada que HOY ya no cumple la política muere
  it("rechaza una URI registrada que ya no pasa la allowlist D9", () => {
    const ajena = "https://evil.example.com/cb";
    expect(
      decidirAuthorize({
        params: { ...BASE, redirect_uri: ajena },
        // Aunque figure registrada (allowlist cambiada después del DCR), no se usa.
        redirectUrisDelCliente: [ajena],
        haySesion: true,
      }),
    ).toMatchObject({
      tipo: "error_json",
      status: 400,
      error: "invalid_redirect_uri",
    });
  });

  // mcp.oauth.022 — con el redirect_uri YA verificado, los errores sí vuelven al cliente
  it("redirige el error al cliente cuando la URI ya está verificada", () => {
    const sinS256 = decidirAuthorize({
      params: { ...BASE, code_challenge_method: "plain" },
      redirectUrisDelCliente: [REDIRECT],
      haySesion: true,
    });
    expect(sinS256).toEqual({
      tipo: "redirect_error",
      redirectUri: REDIRECT,
      error: "invalid_request",
      state: "st-1",
    });

    const otroResponseType = decidirAuthorize({
      params: { ...BASE, response_type: "token" },
      redirectUrisDelCliente: [REDIRECT],
      haySesion: true,
    });
    expect(otroResponseType).toMatchObject({
      tipo: "redirect_error",
      error: "unsupported_response_type",
    });
  });

  // mcp.oauth.023 — I8: sin sesión NextAuth no hay consentimiento; se manda al login del apex
  // preservando TODOS los params para retomar el dance donde quedó
  it("sin sesión manda al login con el consent como callbackUrl", () => {
    const decision = decidirAuthorize({
      params: BASE,
      redirectUrisDelCliente: [REDIRECT],
      haySesion: false,
    });

    expect(decision.tipo).toBe("login");
    if (decision.tipo !== "login") throw new Error("tipo inesperado");

    expect(decision.destino.startsWith("/login?callbackUrl=")).toBe(true);

    // El callbackUrl es el consent con el flow completo (encodeado una vez).
    const consent = decodeURIComponent(
      decision.destino.slice("/login?callbackUrl=".length),
    );
    const url = new URL(consent, "https://sorteatelo.cl");
    expect(url.pathname).toBe("/mcp-consent");
    expect(url.searchParams.get("client_id")).toBe("cliente-1");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge")).toBe("abc123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("mcp");
    expect(url.searchParams.get("state")).toBe("st-1");
  });

  // mcp.oauth.024 — con sesión, al consent brandeado (el humano decide)
  it("con sesión manda al consent con el flow completo", () => {
    const decision = decidirAuthorize({
      params: BASE,
      redirectUrisDelCliente: [REDIRECT],
      haySesion: true,
    });

    expect(decision.tipo).toBe("consent");
    if (decision.tipo !== "consent") throw new Error("tipo inesperado");

    const url = new URL(decision.destino, "https://sorteatelo.cl");
    expect(url.pathname).toBe("/mcp-consent");
    expect(url.searchParams.get("state")).toBe("st-1");
    // Defaults: sin scope explícito, "mcp" (D10); sin state, cadena vacía.
    const sinOpcionales = decidirAuthorize({
      params: { ...BASE, scope: undefined, state: undefined },
      redirectUrisDelCliente: [REDIRECT],
      haySesion: true,
    });
    if (sinOpcionales.tipo !== "consent") throw new Error("tipo inesperado");
    const url2 = new URL(sinOpcionales.destino, "https://sorteatelo.cl");
    expect(url2.searchParams.get("scope")).toBe("mcp");
    expect(url2.searchParams.get("state")).toBe("");
  });
});
