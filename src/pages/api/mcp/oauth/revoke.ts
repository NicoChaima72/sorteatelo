import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "~/server/db";
import { aplicarCorsOauth, manejarPreflight } from "~/server/mcp/cors";
import { revocarAccessToken, revocarRefreshToken } from "~/server/mcp/tokens";

/**
 * RFC 7009 — Token Revocation (borde de cableado, ADR-0025 F02). Es la salida limpia del
 * cliente: `claude mcp remove` revoca en vez de dejar el token vivo 30 días.
 *
 * Responde **200 siempre**, exista o no el token: el RFC lo pide para no convertir el endpoint
 * en un oráculo que confirme qué tokens son válidos.
 *
 * Revocar un refresh cascadea a los access del mismo (userId, clientId) — ver `tokens.ts`.
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

  res.setHeader("Cache-Control", "no-store");

  const body = req.body as Record<string, string | undefined>;
  const token = body.token;

  if (!token) {
    res.status(200).end();
    return;
  }

  if (body.token_type_hint === "refresh_token") {
    await revocarRefreshToken({ db, rawRefreshToken: token });
  } else if (body.token_type_hint === "access_token") {
    await revocarAccessToken({ db, rawToken: token });
  } else {
    // Sin hint: se prueban los dos. El que no corresponda es un no-op.
    await Promise.all([
      revocarAccessToken({ db, rawToken: token }),
      revocarRefreshToken({ db, rawRefreshToken: token }),
    ]);
  }

  res.status(200).end();
}
