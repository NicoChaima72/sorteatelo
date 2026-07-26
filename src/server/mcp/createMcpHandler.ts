import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "~/server/db";
import { getAppBaseUrl } from "~/server/mcp/baseUrl";
import {
  autenticarLlamadaMcp,
  desafioWwwAuthenticate,
  type ContextoMcp,
} from "~/server/mcp/contextoMcp";
import { aplicarCorsOauth, manejarPreflight } from "~/server/mcp/cors";
import { registrarTools } from "~/server/mcp/tools/registro";

/**
 * Factory del handler MCP para el pages router (D6). El endpoint
 * (`src/pages/api/mcp/handler.ts`) es una línea que lo invoca.
 *
 * Por request:
 *  1. Extrae `Authorization: Bearer <token>` y lo valida contra la DB (hash SHA-256, `revokedAt`
 *     y expiración en CADA llamada — sin cache, I5).
 *  2. Reconstruye el contexto: `userId` del token ⇒ membresías canónicas VIVAS. El token dice
 *     quién es; qué puede se recalcula siempre (ADR-0025).
 *  3. Levanta un `McpServer` + `StreamableHTTPServerTransport` **stateless** por request y le
 *     registra el toolset.
 *
 * **Un solo endpoint, un solo modo** (D3): el token es per-usuario y cruza Tiendas, así que no
 * puede colgar del host de una. El modo admin/plataforma quedó diferido con el superadmin
 * (ADR-0023) y no se deja ni el endpoint vacío.
 *
 * Stateless a propósito: sin estado de sesión en memoria, cada request se autentica y se resuelve
 * sola. Es lo que hace que funcione en serverless (Vercel, ADR-0015), donde dos requests del
 * mismo cliente pueden caer en instancias distintas.
 */

const SERVIDOR = { name: "sorteatelo-organizador", version: "0.1.0" };

export function createMcpHandler(): (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void> {
  return async function handler(req, res) {
    if (manejarPreflight(req, res)) return;

    aplicarCorsOauth(req, res);

    if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
      res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
      res.status(405).end();
      return;
    }

    const ctx = await autenticar(req, res);
    if (!ctx) return; // `autenticar` ya escribió el 401 con su desafío.

    const mcp = new McpServer(SERVIDOR);
    registrarTools(mcp, ctx);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      // El transporte ya escribe su propia respuesta JSON-RPC en casi todos los caminos; esto
      // cubre fallas de arranque/conexión para no dejar la request colgada.
      console.error("[mcp] fallo del transporte:", error);
      if (!res.writableEnded) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Error interno." },
          id: null,
        });
      }
    }
  };
}

/**
 * Valida el bearer y arma el contexto. Ante cualquier problema responde **401 con
 * `WWW-Authenticate`** (RFC 6750): ese header es lo que hace que un cliente MCP sepa iniciar el
 * dance OAuth solo en vez de quedarse pegado — apunta al discovery del recurso protegido.
 */
async function autenticar(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<ContextoMcp | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    responder401(res, "Falta el token de acceso.");
    return null;
  }

  const resultado = await autenticarLlamadaMcp({
    db,
    rawToken: header.slice("Bearer ".length).trim(),
  });

  if (resultado.estado !== "ok") {
    // El motivo (invalido/revocado/vencido) SÍ se le dice al cliente acá, a diferencia del token
    // endpoint: quien llega con un bearer ya lo tenía, así que no hay oráculo que abrir, y
    // distinguir "vencido" de "revocado" es lo que le permite decidir entre refrescar o
    // reconectar en vez de reintentar en loop.
    responder401(res, `Token ${resultado.estado}.`);
    return null;
  }

  return resultado.ctx;
}

function responder401(res: NextApiResponse, descripcion: string): void {
  res.setHeader(
    "WWW-Authenticate",
    desafioWwwAuthenticate(getAppBaseUrl(), "invalid_token", descripcion),
  );
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: descripcion },
    id: null,
  });
}
