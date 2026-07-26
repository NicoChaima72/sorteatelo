import { describe, expect, it } from "vitest";

import {
  CALLBACKS_HTTPS_PERMITIDOS,
  esRedirectUriPermitida,
} from "~/server/mcp/redirectUris";

/**
 * Política D9 de `redirect_uri` del DCR (RFC 7591). Es la ÚNICA barrera entre "cualquiera puede
 * registrar un cliente" (el registro es público por diseño) y "el AS redirige a un host arbitrario
 * con un authorization code". Terranova es loopback-only porque su único cliente es Claude Code;
 * acá los Organizadores no-técnicos usan Claude Desktop/web, que reciben el callback en un host
 * HTTPS de Anthropic ⇒ loopback + allowlist exact-match, nada más.
 */

describe("mcp/redirectUris — allowlist D9", () => {
  // mcp.oauth.001 — loopback en cualquier puerto/path (el cliente de escritorio abre uno efímero)
  it("acepta loopback en cualquier puerto y path", () => {
    expect(esRedirectUriPermitida("http://127.0.0.1:33418/callback")).toBe(true);
    expect(esRedirectUriPermitida("http://localhost:8976/oauth/cb")).toBe(true);
    expect(esRedirectUriPermitida("http://[::1]:4000/")).toBe(true);
    // https en loopback también sirve (algunos clientes levantan TLS local)
    expect(esRedirectUriPermitida("https://127.0.0.1:9000/cb")).toBe(true);
  });

  // mcp.oauth.002 — el corazón de D9: HTTPS solo si está en la allowlist, exact-match
  it("acepta solo los callbacks HTTPS de la allowlist, con match exacto", () => {
    for (const permitida of CALLBACKS_HTTPS_PERMITIDOS) {
      expect(esRedirectUriPermitida(permitida)).toBe(true);
    }

    // Host ajeno: el ataque que D9 cierra.
    expect(esRedirectUriPermitida("https://evil.example.com/cb")).toBe(false);

    // Sufijo/prefijo del host permitido: el match es sobre la URI COMPLETA, no "contiene".
    expect(
      esRedirectUriPermitida("https://claude.ai.evil.com/api/mcp/auth_callback"),
    ).toBe(false);
    expect(esRedirectUriPermitida("https://notclaude.ai/api/mcp/auth_callback")).toBe(
      false,
    );

    // Mismo host permitido pero OTRO path: no está en la allowlist ⇒ fuera.
    expect(esRedirectUriPermitida("https://claude.ai/otro/callback")).toBe(false);

    // Mismo host y path pero con query extra: distinta URI ⇒ fuera.
    expect(
      esRedirectUriPermitida("https://claude.ai/api/mcp/auth_callback?x=1"),
    ).toBe(false);
  });

  // mcp.oauth.003 — basura y trampas conocidas del parseo de URIs
  it("rechaza esquemas no-http, fragmentos, credenciales embebidas y basura", () => {
    expect(esRedirectUriPermitida("")).toBe(false);
    expect(esRedirectUriPermitida("no-es-una-uri")).toBe(false);
    // `javascript:` / `data:` jamás.
    expect(esRedirectUriPermitida("javascript:alert(1)")).toBe(false);
    // http NO loopback: sin TLS el code viaja en claro.
    expect(esRedirectUriPermitida("http://claude.ai/api/mcp/auth_callback")).toBe(
      false,
    );
    // RFC 6749 §3.1.2: la redirect URI no puede traer fragmento.
    expect(esRedirectUriPermitida("http://127.0.0.1:33418/callback#frag")).toBe(
      false,
    );
    // Userinfo embebido: "http://127.0.0.1@evil.com/" parece loopback y NO lo es —
    // el host real es evil.com. La trampa clásica.
    expect(esRedirectUriPermitida("http://127.0.0.1@evil.com/cb")).toBe(false);
  });
});
