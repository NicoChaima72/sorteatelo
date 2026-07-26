import { describe, expect, it } from "vitest";

import { LIMITE_ARGS_AUDIT, sanitizarArgs } from "~/server/mcp/audit";

/**
 * Sanitización de los argumentos que van al `McpAuditLog` (F10, I7). Es la única defensa entre "el
 * agente llamó a una tool" y "la fila de auditoría es un lugar donde quedan secretos".
 *
 * La regla es **por FORMA del nombre del campo, no por lista de tools**: si mañana alguien agrega
 * una tool con un `webhookSecret`, la tacha igual sin que nadie se acuerde de registrarla. Una
 * denylist por tool sería disciplina; esta es estructura.
 */

describe("mcp/sanitizarArgs", () => {
  // mcp.audit.001 — lo que tacha, lo tacha por nombre de campo, a cualquier profundidad
  it("tacha todo campo cuyo nombre huela a secreto, anidado incluido", () => {
    const json = sanitizarArgs({
      tienda: "mi-tienda",
      apiKey: "FLOW-APIKEY-REAL",
      secretKey: "FLOW-SECRETO-REAL",
      modoPruebas: true,
      anidado: { password: "hunter2", claveDeAcceso: "abc", inocuo: "visible" },
    });

    expect(json).not.toContain("FLOW-APIKEY-REAL");
    expect(json).not.toContain("FLOW-SECRETO-REAL");
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("abc");

    const parseado = JSON.parse(json) as Record<string, unknown>;
    // Lo que NO es secreto sigue estando: un audit que tacha todo no sirve para auditar.
    expect(parseado.tienda).toBe("mi-tienda");
    expect(parseado.modoPruebas).toBe(true);
    expect((parseado.anidado as Record<string, unknown>).inocuo).toBe("visible");
    // Y queda constancia de que el campo VINO, aunque su valor no se guarde.
    expect(parseado.apiKey).toBe("[oculto]");
  });

  // mcp.audit.002 — el audit registra QUÉ pasó, no acumula el contenido ni la PII
  it("reemplaza los textos largos por su longitud y acota el tamaño total", () => {
    const parrafo = "a".repeat(500);
    const json = sanitizarArgs({ props: { titulo: "corto", cuerpo: parrafo } });

    expect(json).not.toContain(parrafo);
    expect(json).toContain("corto"); // los cortos se ven tal cual
    expect(json).toContain("500");

    // Un documento entero no puede reventar la columna: hay tope duro con marca de recorte.
    const enorme = sanitizarArgs({
      secciones: Array.from({ length: 400 }, (_, i) => ({ id: `sec-${i}`, tipo: "faq" })),
    });
    expect(enorme.length).toBeLessThanOrEqual(LIMITE_ARGS_AUDIT + 20);
    expect(enorme.endsWith("…(recortado)")).toBe(true);
  });

  // mcp.audit.003 — nunca lanza: un audit que revienta tumbaría la llamada que estaba auditando
  it("tolera cualquier entrada sin lanzar", () => {
    expect(sanitizarArgs(undefined)).toBe("{}");
    expect(sanitizarArgs(null)).toBe("{}");
    expect(sanitizarArgs("un string")).toContain("un string");
    expect(sanitizarArgs(42)).toBe("42");

    // Referencia circular: `JSON.stringify` normalmente explota acá.
    const circular: Record<string, unknown> = { tienda: "x" };
    circular.yo = circular;
    expect(() => sanitizarArgs(circular)).not.toThrow();
  });
});
