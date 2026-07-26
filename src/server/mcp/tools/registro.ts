import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ejecutarToolAuditada } from "~/server/mcp/audit";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { TOOLS_DE_CATALOGO } from "~/server/mcp/tools/catalogo";
import { TOOLS_DE_CONFIGURACION } from "~/server/mcp/tools/configuracion";
import { TOOLS_DE_CUENTA } from "~/server/mcp/tools/cuenta";
import { type ToolMcp } from "~/server/mcp/tools/definirTool";
import { TOOLS_DE_LECTURA } from "~/server/mcp/tools/lectura";
import { TOOLS_DE_PAGINA } from "~/server/mcp/tools/pagina";

/**
 * Registro de tools del MCP del Organizador (ADR-0025, D7/D10/I3).
 *
 * **Esta lista ES la whitelist.** No hay scopes finos ni feature flags: la matriz de límites se
 * expresa por AUSENCIA — lo que no está acá no se puede llamar, y punto. Por eso los límites
 * duros no son deuda técnica, son diseño:
 *
 * - NO existe tool para **publicar** (tienda ni página). ADR-0018 puso un checkpoint humano
 *   contra los editores automáticos; el MCP ES uno de esos editores.
 * - NO existe tool para **ejecutar el sorteo**: irreversible y con consecuencias legales para el
 *   Organizador (ADR-0008).
 * - NO existe tool para **borrar** nada.
 * - NO existe tool para **leer credenciales de Flow** (escribirlas sí, D8: write-only).
 *
 * Hay un test que enumera este inventario completo y falla si aparece una tool nueva sin
 * actualizarlo: agregar una capacidad al agente es un cambio consciente, nunca un descuido.
 */
export const TOOLS: ToolMcp[] = [
  ...TOOLS_DE_LECTURA,
  ...TOOLS_DE_CONFIGURACION,
  ...TOOLS_DE_CATALOGO,
  ...TOOLS_DE_PAGINA,
  ...TOOLS_DE_CUENTA,
];

/**
 * Registra el toolset en el servidor MCP de esta request. Cada handler se envuelve con
 * `ejecutarTool`, que traduce el resultado y decide qué error puede ver el modelo.
 */
export function registrarTools(mcp: McpServer, ctx: ContextoMcp): void {
  for (const tool of TOOLS) {
    mcp.registerTool(
      tool.nombre,
      {
        title: tool.titulo,
        description: tool.descripcion,
        inputSchema: tool.entrada,
      },
      // El SDK ya validó `args` contra el esquema declarado antes de llamar acá.
      // `ejecutarToolAuditada` = `ejecutarTool` + la fila de `McpAuditLog` (F10): el audit envuelve
      // el registro entero, así que una tool nueva queda auditada sin que su autor haga nada.
      async (args: Record<string, unknown>) =>
        ejecutarToolAuditada({ tool, args, ctx }),
    );
  }
}
