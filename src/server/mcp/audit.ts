import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { codigoDeError, ejecutarTool } from "~/server/mcp/ejecutarTool";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { type ToolMcp } from "~/server/mcp/tools/definirTool";

/**
 * Auditoría de las invocaciones del MCP (F10, D11/I7). Toda llamada a una tool deja UNA fila en
 * `McpAuditLog`: quién (userId + snapshot del correo), con qué Conexión, qué tool, con qué
 * argumentos sanitizados, y si salió bien o con qué código de error.
 *
 * **Append-only**: nunca se actualiza ni se borra una fila, y el modelo no tiene `updatedAt` ni FKs
 * (borrar un `McpClient` o un `User` no puede llevarse el historial de lo que ese cliente hizo —
 * ahí es justamente cuando se necesita leerlo).
 *
 * Dos diferencias deliberadas con la referencia de terranova (`runToolWithAudit`):
 *
 * 1. **La escritura se espera** (`await`), no va fire-and-forget. Terranova hace `void write(...)`
 *    para no sumar latencia; acá corremos en funciones de Vercel (ADR-0015), donde el proceso se
 *    puede congelar en cuanto la respuesta sale — un `void` perdería filas en silencio, y un
 *    registro de auditoría con agujeros invisibles es peor que no tenerlo, porque se le cree. El
 *    costo es un INSERT al lado del trabajo que la tool ya hizo.
 * 2. **Si el INSERT falla, la llamada sigue viva**: el error va al log del servidor y la tool
 *    responde normalmente. Auditar no puede ser un modo de falla nuevo para el Organizador.
 */

/** Tope de la columna `args`. Un documento de página entero no puede inflar la tabla. */
export const LIMITE_ARGS_AUDIT = 1000;

/** Los textos largos no se guardan: solo su longitud (I7 — ni secretos ni PII extensa). */
const LIMITE_TEXTO = 120;

/** Profundidad máxima del recorrido: corta estructuras patológicas y ciclos. */
const PROFUNDIDAD_MAX = 6;

/**
 * Campos cuyo VALOR nunca se guarda. Se decide por la FORMA del nombre, no por una lista de tools:
 * si mañana aparece una tool con `webhookSecret` o `clavePrivada`, queda tachada sola. Una lista
 * por tool sería disciplina (y se olvida); esto es estructura.
 *
 * El nombre del campo SÍ se guarda (con `[oculto]` por valor): saber que la llamada traía un
 * `apiKey` es justo lo que se quiere poder auditar.
 */
const CAMPO_SECRETO = /key|secret|password|passwd|clave|token|credencial|firma/i;

const OCULTO = "[oculto]";

/**
 * Serializa los argumentos de una tool para el audit. PURA y **nunca lanza**: un sanitizador que
 * explota tumbaría la llamada que estaba auditando.
 */
export function sanitizarArgs(args: unknown): string {
  try {
    const limpio = limpiar(args, 0);
    const json = JSON.stringify(limpio ?? {}) ?? "{}";
    return json.length > LIMITE_ARGS_AUDIT
      ? `${json.slice(0, LIMITE_ARGS_AUDIT)}…(recortado)`
      : json;
  } catch {
    return '{"_error":"args no serializables"}';
  }
}

function limpiar(valor: unknown, profundidad: number): unknown {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === "string") {
    return valor.length > LIMITE_TEXTO
      ? `(texto de ${valor.length} caracteres)`
      : valor;
  }
  if (typeof valor === "number" || typeof valor === "boolean") return valor;

  if (profundidad >= PROFUNDIDAD_MAX) return "(…)";

  if (Array.isArray(valor)) {
    return valor.map((v) => limpiar(v, profundidad + 1));
  }
  if (typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = CAMPO_SECRETO.test(clave)
        ? OCULTO
        : limpiar(v, profundidad + 1);
    }
    return salida;
  }
  // Acá solo llegan primitivos raros (bigint | symbol | function): los objetos y arrays ya se
  // manejaron arriba, así que el `[object Object]` que `no-base-to-string` teme es imposible.
  if (typeof valor === "bigint") return valor.toString();
  return typeof valor === "symbol" ? valor.toString() : "(función)";
}

/**
 * Ejecuta una tool y deja su rastro. Es el envoltorio que usa el registro: `ejecutarTool` traduce
 * el resultado y esta función lo registra.
 */
export async function ejecutarToolAuditada({
  tool,
  args,
  ctx,
}: {
  tool: ToolMcp;
  args: Record<string, unknown>;
  ctx: ContextoMcp;
}): Promise<CallToolResult> {
  const resultado = await ejecutarTool(() => tool.manejar(args, ctx));
  await registrarInvocacion({ ctx, tool: tool.nombre, args, resultado });
  return resultado;
}

async function registrarInvocacion({
  ctx,
  tool,
  args,
  resultado,
}: {
  ctx: ContextoMcp;
  tool: string;
  args: unknown;
  resultado: CallToolResult;
}): Promise<void> {
  try {
    await ctx.db.mcpAuditLog.create({
      data: {
        userId: ctx.userId,
        // Snapshot del correo: es lo que mantiene la fila LEGIBLE si el User se borra (un cuid
        // colgante preserva bytes, no historial).
        userEmail: ctx.email,
        clientId: ctx.clientId,
        tool,
        args: sanitizarArgs(args),
        result: resultado.isError ? "ERROR" : "OK",
        errorCode: codigoDeError(resultado),
      },
    });
  } catch (error) {
    // Que no se pueda auditar no puede volverse un error del Organizador. Queda en el log del
    // servidor, que es donde alguien lo va a ver.
    console.error("[mcp.audit] no se pudo registrar la invocación:", error);
  }
}
