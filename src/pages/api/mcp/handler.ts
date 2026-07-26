import { createMcpHandler } from "~/server/mcp/createMcpHandler";

/**
 * Endpoint ÚNICO del MCP del Organizador (D3, ADR-0025). Vive en el apex: el Token MCP es
 * per-usuario y cruza sus Tiendas, así que no puede colgar del host de una.
 *
 * Toda la lógica está en el factory. Este archivo existe para que el path sea exactamente el que
 * publica el discovery (`/api/mcp/handler`, constante `PATH_HANDLER_MCP`).
 */
export default createMcpHandler();
