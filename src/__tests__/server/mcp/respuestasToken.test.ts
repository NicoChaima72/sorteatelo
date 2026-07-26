import { describe, expect, it } from "vitest";

import {
  respuestaDeTokens,
  respuestaGrantRechazado,
} from "~/server/mcp/respuestasToken";

/**
 * Shape de las respuestas del token endpoint. Lo que se testea acá NO es formato: es la
 * propiedad **anti-oráculo**. El endpoint sabe exactamente por qué falló un canje (el code no
 * existe / existe pero ya se usó / existe pero el verifier no calza / es de otro cliente…), y
 * ese detalle no puede salir al cable: distinguir "no existe" de "existe pero falta el
 * verifier" es justamente la información que PKCE (I5) le niega a quien intercepta un code.
 *
 * Se expresa como test porque el borde `pages/api/*` no se testea por convención, y un
 * `error_description` con el motivo fino es un one-liner que se cuela en cualquier refactor
 * (de hecho se coló: lo cazó el backend-reviewer en la primera pasada de F02).
 */

describe("mcp/respuestasToken", () => {
  // mcp.oauth.050 — todos los motivos de rechazo producen una respuesta IDÉNTICA
  it("no filtra el motivo del rechazo: la respuesta es byte-idéntica para todos los estados", () => {
    const estados = [
      "invalido",
      "vencido",
      "ya_usado",
      "pkce_no_coincide",
      "redirect_uri_no_coincide",
      "cliente_no_coincide",
      "revocado",
    ] as const;

    const respuestas = estados.map((e) => JSON.stringify(respuestaGrantRechazado(e)));
    expect(new Set(respuestas).size).toBe(1);

    const cuerpo = respuestaGrantRechazado("pkce_no_coincide");
    expect(cuerpo.error).toBe("invalid_grant"); // el código del RFC 6749 §5.2 y nada más

    // Ninguno de los estados finos aparece en el texto serializado.
    const serializado = JSON.stringify(cuerpo);
    for (const estado of estados) {
      expect(serializado).not.toContain(estado);
    }
  });

  // mcp.oauth.051 — respuesta exitosa: shape RFC 6749 §5.1 con expires_in derivado
  it("arma la respuesta de tokens con expires_in en segundos", () => {
    const cuerpo = respuestaDeTokens(
      {
        accessToken: "acc",
        refreshToken: "ref",
        accessExpiresAt: new Date(Date.now() + 3600 * 1000),
        refreshExpiresAt: new Date(Date.now() + 999 * 1000),
      },
      "mcp",
    );

    expect(cuerpo.access_token).toBe("acc");
    expect(cuerpo.refresh_token).toBe("ref");
    expect(cuerpo.token_type).toBe("Bearer");
    expect(cuerpo.scope).toBe("mcp");
    expect(cuerpo.expires_in).toBeGreaterThan(3590);
    expect(cuerpo.expires_in).toBeLessThanOrEqual(3600);
  });

  // mcp.oauth.052 — un access ya vencido nunca reporta un expires_in negativo
  it("piso en 0 el expires_in de un token ya vencido", () => {
    const cuerpo = respuestaDeTokens(
      {
        accessToken: "acc",
        refreshToken: "ref",
        accessExpiresAt: new Date(Date.now() - 10_000),
        refreshExpiresAt: new Date(),
      },
      "mcp",
    );
    expect(cuerpo.expires_in).toBe(0);
  });
});
