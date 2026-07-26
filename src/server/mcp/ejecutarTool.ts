import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { DomainError } from "~/server/domain/errors";

/**
 * Seam entre el borde MCP y `src/server/domain/` — el hermano de `runDomain` (que hace lo mismo
 * para tRPC). Ejecuta un use case y traduce el resultado al `CallToolResult` del SDK (I4: en
 * este borde no hay lógica de dominio, solo traducción).
 *
 * La asimetría de errores es deliberada:
 * - **`DomainError` viaja completo** (`CODE: mensaje`). Es información que el agente necesita
 *   para corregirse solo ("FORBIDDEN: no tienes acceso a esa tienda" ⇒ pide la lista y reintenta).
 * - **Un `ZodError` viaja como `INVALID`, con campo y motivo.** Las tools validan su input con
 *   los MISMOS esquemas que el panel, así que un rechazo de Zod es la regla de negocio hablando
 *   ("el precio debe ser un número entero de pesos"). Decirlo es lo que permite que el agente se
 *   corrija solo en vez de reintentar a ciegas.
 * - **Cualquier otro error NO viaja.** Es un bug nuestro, su mensaje puede llevar detalles de
 *   infraestructura, y el contexto de un LLM es un lugar del que la información no vuelve: queda
 *   en el historial del usuario y puede terminar en el prompt de otra llamada. Va al log del
 *   servidor, que es donde sirve.
 */
export async function ejecutarTool(
  fn: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return exito(await fn());
  } catch (error) {
    if (error instanceof DomainError) {
      return errorLegible(error.code, error.message);
    }
    if (error instanceof ZodError) {
      return errorLegible("INVALID", mensajeDeZod(error));
    }
    console.error("[mcp] error inesperado en tool:", error);
    return { isError: true, content: [{ type: "text", text: TEXTO_ERROR_INTERNO }] };
  }
}

/** Lo ÚNICO que un error inesperado le dice al modelo. Compartido con el lector del audit. */
const TEXTO_ERROR_INTERNO = "Error interno.";

/**
 * Código de error de un resultado fallido, para el `McpAuditLog` (F10). Vive acá, junto a quien
 * ESCRIBE el formato `CODIGO: mensaje`: si mañana el formato cambia, el lector cambia en el mismo
 * archivo y no queda una regex desincronizada en el módulo de auditoría.
 *
 * `INTERNO` para el error genérico: en la fila del audit hay que poder distinguir "el agente pidió
 * algo inválido" de "se nos rompió algo", y hacia el modelo los dos se ven casi igual.
 */
export function codigoDeError(resultado: CallToolResult): string | null {
  if (!resultado.isError) return null;
  const texto = textoDe(resultado);
  const codigo = /^([A-Z_]+): /.exec(texto)?.[1];
  if (codigo) return codigo;
  return texto === TEXTO_ERROR_INTERNO ? "INTERNO" : "DESCONOCIDO";
}

function errorLegible(codigo: string, mensaje: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: `${codigo}: ${mensaje}` }] };
}

/** "campo: motivo; otroCampo: motivo" — la forma más corta que le sirve al agente para corregir. */
function mensajeDeZod(error: ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`)
    .join("; ");
}

function exito(resultado: unknown): CallToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(resultado ?? null, reemplazar, 2) },
    ],
  };
}

/**
 * Serialización de los tipos que devuelve Prisma:
 * - `Date` ⇒ ISO (el agente necesita una fecha comparable, no `{}`).
 * - `Decimal` ⇒ **string exacto** vía su `toJSON`. Los montos JAMÁS se convierten a `number`
 *   (regla de oro del dominio): un `Number(19990.5)` es una pérdida silenciosa que el LLM
 *   después repite como si fuera el precio.
 */
function reemplazar(_clave: string, valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  return valor;
}

/** Extrae el texto del primer bloque de contenido. Utilidad para tests y para el audit (F10). */
export function textoDe(resultado: CallToolResult): string {
  const primero = resultado.content[0];
  if (
    primero &&
    typeof primero === "object" &&
    "type" in primero &&
    primero.type === "text" &&
    "text" in primero &&
    typeof primero.text === "string"
  ) {
    return primero.text;
  }
  return "";
}
