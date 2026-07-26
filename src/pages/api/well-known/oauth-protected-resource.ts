import type { NextApiRequest, NextApiResponse } from "next";

import { getAppBaseUrl } from "~/server/mcp/baseUrl";
import { aplicarCorsOauth, manejarPreflight } from "~/server/mcp/cors";
import { metadataProtectedResource } from "~/server/mcp/discovery";

/**
 * RFC 9728 — Protected Resource Metadata. Se sirve en
 * `/.well-known/oauth-protected-resource` vía rewrite (ver `next.config.js`).
 *
 * Le dice al cliente dónde está el handler MCP y a qué AS pedirle tokens. El handler apunta acá
 * en su `WWW-Authenticate` cuando rechaza un bearer, cerrando el círculo del descubrimiento.
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): void {
  if (manejarPreflight(req, res)) return;

  aplicarCorsOauth(req, res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).end();
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json(metadataProtectedResource(getAppBaseUrl()));
}
