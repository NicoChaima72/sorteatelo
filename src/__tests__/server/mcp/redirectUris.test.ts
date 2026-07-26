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
 *
 * **F05/D12** suma un tercer caso: el **prefijo anclado** para ChatGPT, que usa un path dinámico
 * por conector. Es la única forma permitida que no es igualdad de string, así que la mitad de los
 * tests de acá abajo existen para probar que el anclaje aguanta — un `startsWith` sobre el string
 * crudo habría convertido este archivo en la puerta que D9 vino a cerrar.
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

  // mcp.oauth.004 — ChatGPT: callback con path DINÁMICO por conector (D12/F05)
  it("acepta el callback de ChatGPT con cualquier callback_id", () => {
    expect(
      esRedirectUriPermitida(
        "https://chatgpt.com/connector/oauth/c8f3a1d2-4b6e-4f0a-9c7d-1e2f3a4b5c6d",
      ),
    ).toBe(true);
    // El id lo elige OpenAI y cambia por instalación: no hay string exacto que listar.
    expect(esRedirectUriPermitida("https://chatgpt.com/connector/oauth/abc123")).toBe(
      true,
    );

    // El callback LEGACY de OpenAI es un string FIJO ⇒ va por la allowlist exact-match, no por
    // el prefijo: no necesita ninguna relajación de la política.
    expect(
      esRedirectUriPermitida("https://chatgpt.com/connector_platform_oauth_redirect"),
    ).toBe(true);
  });

  // mcp.oauth.005 — el ANCLAJE del prefijo: lo único que separa "habilitamos a ChatGPT" de
  // "el AS redirige a cualquiera que sepa escribir /connector/oauth/ en su path"
  it("rechaza todo lo que no sea EXACTAMENTE el origin de ChatGPT con un id después del prefijo", () => {
    // Prefijo PELADO: sin `callback_id` no es un callback de nadie.
    expect(esRedirectUriPermitida("https://chatgpt.com/connector/oauth/")).toBe(false);
    expect(esRedirectUriPermitida("https://chatgpt.com/connector/oauth")).toBe(false);

    // Query colada: el `?` es un canal para que el registrante meta parámetros propios en la URL
    // a la que el AS va a mandar el code. El exact-match de la allowlist nunca lo permitió
    // (mcp.oauth.002) y el prefijo tampoco lo permite.
    expect(
      esRedirectUriPermitida(
        "https://chatgpt.com/connector/oauth/abc?next=https://evil.com",
      ),
    ).toBe(false);
    expect(esRedirectUriPermitida("https://chatgpt.com/connector/oauth/abc?x=1")).toBe(
      false,
    );

    // EL ataque que el prefijo anclado tiene que aguantar: un `startsWith` sobre el STRING crudo
    // ("¿empieza con https://chatgpt.com/?") aceptaría los tres de abajo. Por eso se compara
    // `url.origin`, que el parser ya resolvió.
    expect(
      esRedirectUriPermitida("https://chatgpt.com.evil.com/connector/oauth/abc"),
    ).toBe(false);
    expect(esRedirectUriPermitida("https://chatgpt.com.br/connector/oauth/abc")).toBe(
      false,
    );
    expect(
      esRedirectUriPermitida("https://chatgpt.com@evil.com/connector/oauth/abc"),
    ).toBe(false);

    // Host ajeno con el MISMO path: el path no autoriza nada por sí solo.
    expect(esRedirectUriPermitida("https://evil.com/connector/oauth/abc")).toBe(false);

    // Las dos trampas que un `startsWith` sobre el string crudo NO ve, porque el string ARRANCA
    // con "https://chatgpt.com" en las dos y el host real es otro. El parser las desarma:
    // `%2f@` mueve el host a evil.com (userinfo) y `%2e` decodifica a un dominio distinto.
    expect(
      esRedirectUriPermitida("https://chatgpt.com%2f@evil.com/connector/oauth/abc"),
    ).toBe(false);
    expect(
      esRedirectUriPermitida("https://chatgpt.com%2eevil.com/connector/oauth/abc"),
    ).toBe(false);

    // Barra invertida como separador de autoridad: en esquemas especiales WHATWG normaliza `\` a
    // `/` ANTES de resolver el host, así que `@evil.com` cae al PATH y no crea userinfo (el guard
    // de `username` ni se entera). Lo que rechaza este caso es el prefijo, no la arroba — vale
    // testearlo para no dejar la impresión de que lo cubre otro check.
    expect(
      esRedirectUriPermitida("https://chatgpt.com\\@evil.com/connector/oauth/abc"),
    ).toBe(false);
    expect(
      esRedirectUriPermitida("https://chatgpt.com\\.evil.com/connector/oauth/abc"),
    ).toBe(false);

    // Puerto no-default: `origin` lo incluye, así que `chatgpt.com:8443` NO es `chatgpt.com`.
    expect(esRedirectUriPermitida("https://chatgpt.com:8443/connector/oauth/abc")).toBe(
      false,
    );

    // Subdominio de chatgpt.com: el origin es EXACTO, no "termina en". Un subdominio ajeno
    // (o tomado) no hereda la confianza del apex.
    expect(esRedirectUriPermitida("https://sub.chatgpt.com/connector/oauth/abc")).toBe(
      false,
    );

    // El prefijo tiene que estar al PRINCIPIO del path, no aparecer en el medio.
    expect(
      esRedirectUriPermitida("https://chatgpt.com/algo/connector/oauth/abc"),
    ).toBe(false);
    // Y tiene que ser el prefijo completo, no uno parecido.
    expect(esRedirectUriPermitida("https://chatgpt.com/connector/oauth2/abc")).toBe(
      false,
    );

    // Traversal: el parser normaliza el path ANTES de la comparación, así que un `..` que se sale
    // del prefijo se ve tal como termina resolviendo (`/evil`), no como se escribió.
    expect(
      esRedirectUriPermitida("https://chatgpt.com/connector/oauth/../../evil"),
    ).toBe(false);

    // Sin TLS el code viaja en claro: el prefijo es HTTPS-only igual que la allowlist.
    expect(esRedirectUriPermitida("http://chatgpt.com/connector/oauth/abc")).toBe(
      false,
    );

    // Fragmento (RFC 6749 §3.1.2): sigue prohibido para TODOS los casos, también el nuevo.
    expect(esRedirectUriPermitida("https://chatgpt.com/connector/oauth/abc#f")).toBe(
      false,
    );
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
