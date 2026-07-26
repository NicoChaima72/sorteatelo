import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "~/server/db";
import { canjearCodigoAutorizacion } from "~/server/mcp/codigosAutorizacion";
import { aplicarCorsOauth, manejarPreflight } from "~/server/mcp/cors";
import {
  respuestaDeTokens,
  respuestaGrantRechazado,
  type EstadoRechazo,
} from "~/server/mcp/respuestasToken";
import { emitirParDeTokens, refrescarParDeTokens } from "~/server/mcp/tokens";

/**
 * OAuth 2.1 Token endpoint (borde de cableado, ADR-0025 F02). Dos grants:
 *
 * - `authorization_code`: code + `code_verifier` + client_id + redirect_uri ⇒ canje con PKCE
 *   S256 y single-use atómico ⇒ par de tokens.
 * - `refresh_token`: par nuevo heredando el scope del original.
 *
 * **Es el único lugar de la plataforma donde un Token MCP existe en claro** (I2): se devuelve
 * una vez y en DB queda solo el SHA-256. Por eso `Cache-Control: no-store` y por eso los errores
 * no dicen POR QUÉ falló el canje más allá del `invalid_grant` del RFC — el motivo fino se
 * loguea server-side (`registrarRechazo`), jamás se responde: ver la propiedad anti-oráculo en
 * `~/server/mcp/respuestasToken`.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (manejarPreflight(req, res)) return;

  aplicarCorsOauth(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Un token en un cache intermedio sería un token filtrado.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  const body = req.body as Record<string, string | undefined>;

  if (body.grant_type === "authorization_code") {
    await conCodigoDeAutorizacion(body, res);
    return;
  }
  if (body.grant_type === "refresh_token") {
    await conRefreshToken(body, res);
    return;
  }

  res.status(400).json({
    error: "unsupported_grant_type",
    error_description: `grant_type "${body.grant_type ?? ""}" no soportado.`,
  });
}

async function conCodigoDeAutorizacion(
  body: Record<string, string | undefined>,
  res: NextApiResponse,
): Promise<void> {
  const { code, code_verifier: codeVerifier, client_id: clientId } = body;
  const redirectUri = body.redirect_uri;

  if (!code || !codeVerifier || !clientId || !redirectUri) {
    res.status(400).json({
      error: "invalid_request",
      error_description:
        "code, code_verifier, client_id y redirect_uri son obligatorios.",
    });
    return;
  }

  const canje = await canjearCodigoAutorizacion({
    db,
    code,
    codeVerifier,
    clientId,
    redirectUri,
  });

  if (canje.estado !== "ok") {
    registrarRechazo("authorization_code", canje.estado);
    res.status(400).json(respuestaGrantRechazado(canje.estado));
    return;
  }

  const par = await emitirParDeTokens({
    db,
    userId: canje.userId,
    clientId,
    scopes: canje.scopes,
  });

  res.status(200).json(respuestaDeTokens(par, canje.scopes));
}

async function conRefreshToken(
  body: Record<string, string | undefined>,
  res: NextApiResponse,
): Promise<void> {
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "refresh_token es obligatorio.",
    });
    return;
  }

  const resultado = await refrescarParDeTokens({
    db,
    rawRefreshToken: refreshToken,
  });
  if (resultado.estado !== "ok") {
    registrarRechazo("refresh_token", resultado.estado);
    res.status(400).json(respuestaGrantRechazado(resultado.estado));
    return;
  }

  res.status(200).json(respuestaDeTokens(resultado, resultado.scopes));
}

/**
 * Deja el motivo REAL del rechazo en el log del servidor, que es donde sirve para depurar. No
 * incluye el code ni el token (ni siquiera un prefijo): el estado solo, que no identifica nada.
 */
function registrarRechazo(grant: string, estado: EstadoRechazo): void {
  console.warn(`[mcp/token] ${grant} rechazado: ${estado}`);
}
