import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "~/server/db";
import { aplicarCorsOauth, manejarPreflight } from "~/server/mcp/cors";
import {
  nombrePorDefecto,
  validarRegistroCliente,
} from "~/server/mcp/registroCliente";

/**
 * RFC 7591 — Dynamic Client Registration (borde de cableado, ADR-0025 F02).
 *
 * El cliente de IA llega sin credenciales y se registra; a cambio recibe un `client_id` público
 * con el que después corre el dance. Registrar NO otorga acceso a nada: sin el consentimiento de
 * un Organizador logueado no se emite ni un code.
 *
 * La política (allowlist D9 de `redirect_uris`) vive en `~/server/mcp/registroCliente`; acá solo
 * se genera el `client_id`, se escribe la fila y se responde el shape del RFC.
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

  const validacion = validarRegistroCliente(req.body);
  if (!validacion.ok) {
    res.status(400).json({
      error: validacion.error,
      error_description: validacion.descripcion,
    });
    return;
  }

  const clientId = randomUUID();
  const clientName = validacion.clientName ?? nombrePorDefecto(clientId);

  const creado = await db.mcpClient.create({
    data: {
      clientId,
      clientName,
      redirectUris: validacion.redirectUris,
      scopes: "mcp", // D10: scope único en v1, no lo elige el cliente
    },
    select: { clientId: true, clientName: true, createdAt: true },
  });

  res.status(201).json({
    client_id: creado.clientId,
    client_name: creado.clientName,
    redirect_uris: validacion.redirectUris,
    client_id_issued_at: Math.floor(creado.createdAt.getTime() / 1000),
    // Cliente PÚBLICO: no emitimos `client_secret`. Lo que ata el code al cliente es PKCE.
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "mcp",
  });
}
