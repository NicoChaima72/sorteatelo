import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainError } from "~/server/domain/errors";
import { ejecutarTool, textoDe } from "~/server/mcp/ejecutarTool";

/**
 * Seam entre el borde MCP y los use cases del dominio — el hermano de `runDomain` (tRPC).
 * Traduce lo que sale de un use case al `CallToolResult` del SDK.
 *
 * Dos propiedades que importan más que el formato:
 * - Un `DomainError` es información ÚTIL para el agente (le dice qué hizo mal y cómo corregir),
 *   así que viaja completo. Cualquier OTRO error es un bug nuestro y no viaja: su mensaje puede
 *   llevar detalles internos, y el contexto de un LLM es un lugar del que la info no vuelve.
 * - Los montos son `Decimal` (regla de oro del dominio): tienen que serializarse como STRING
 *   exacto, nunca como float.
 */

describe("mcp/ejecutarTool", () => {
  // mcp.transporte.010 — resultado OK como JSON legible
  it("serializa el resultado como JSON con las fechas en ISO", async () => {
    const r = await ejecutarTool(async () => ({
      slug: "mi-tienda",
      creadaEl: new Date("2026-07-26T12:00:00.000Z"),
    }));

    expect(r.isError).toBeFalsy();
    const texto = textoDe(r);
    expect(JSON.parse(texto)).toEqual({
      slug: "mi-tienda",
      creadaEl: "2026-07-26T12:00:00.000Z",
    });
  });

  // mcp.transporte.011 — la regla de oro: dinero como string exacto, jamás float
  it("serializa un Decimal como string exacto", async () => {
    const r = await ejecutarTool(async () => ({
      total: new Prisma.Decimal("19990.50"),
    }));

    const parseado = JSON.parse(textoDe(r)) as { total: unknown };
    expect(parseado.total).toBe("19990.5");
    expect(typeof parseado.total).toBe("string");
  });

  // mcp.transporte.012 — el error de negocio SÍ le sirve al agente
  it("devuelve el DomainError con su código y mensaje", async () => {
    const r = await ejecutarTool(async () => {
      throw new DomainError("FORBIDDEN", "No tienes acceso a esa tienda.");
    });

    expect(r.isError).toBe(true);
    expect(textoDe(r)).toBe("FORBIDDEN: No tienes acceso a esa tienda.");
  });

  // mcp.transporte.014 — un error de validación SÍ le sirve al agente: le dice qué campo arreglar
  it("traduce un error de Zod a un INVALID legible con el campo y el motivo", async () => {
    const esquema = z.object({
      precio: z.string().regex(/^\d+$/, "El precio debe ser un número entero de pesos (CLP)"),
    });

    const r = await ejecutarTool(async () => esquema.parse({ precio: "mil pesos" }));

    expect(r.isError).toBe(true);
    const texto = textoDe(r);
    // Mismo formato que un DomainError, para que el agente lo lea igual que los otros errores.
    expect(texto.startsWith("INVALID: ")).toBe(true);
    expect(texto).toContain("precio");
    expect(texto).toContain("número entero de pesos");
  });

  // mcp.transporte.013 — un error inesperado NO se filtra al contexto del LLM
  it("no filtra el mensaje ni el stack de un error inesperado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const r = await ejecutarTool(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");
    });

    expect(r.isError).toBe(true);
    const texto = textoDe(r);
    expect(texto).toBe("Error interno.");
    expect(texto).not.toContain("hunter2");
    expect(texto).not.toContain("ECONNREFUSED");

    // Pero sí queda en el log del servidor, que es donde sirve.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
