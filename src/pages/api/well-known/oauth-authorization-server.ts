import type { NextApiRequest, NextApiResponse } from "next";

import { getAppBaseUrl } from "~/server/mcp/baseUrl";
import { aplicarCorsOauth, manejarPreflight } from "~/server/mcp/cors";
import { metadataAuthorizationServer } from "~/server/mcp/discovery";

/**
 * RFC 8414 — Authorization Server Metadata. Se sirve en
 * `/.well-known/oauth-authorization-server` vía el rewrite de `next.config.js`: el pages router
 * no puede tener un directorio que empiece con punto.
 *
 * Público y cacheable 5 min: es metadata, no hay nada sensible.
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
  res.status(200).json(metadataAuthorizationServer(getAppBaseUrl()));
}
