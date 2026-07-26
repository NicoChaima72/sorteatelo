import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guard de la decisión D6: el transporte del MCP es el **SDK oficial**
 * (`@modelcontextprotocol/sdk`, `StreamableHTTPServerTransport` stateless), y `mcp-handler` —la
 * dependencia del approach viejo, que quedó huérfana cuando ADR-0023 borró el MCP god-mode— NO
 * vuelve.
 *
 * Es un test de una línea que evita una confusión de una tarde: `mcp-handler` (el wrapper de
 * Vercel, pensado para app router) y el SDK oficial resuelven lo mismo de formas incompatibles,
 * y tener las dos instaladas invita a mezclarlas.
 */

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe("mcp/transporte — dependencias", () => {
  // mcp.transporte.020 — SDK oficial dentro, mcp-handler fuera
  it("usa @modelcontextprotocol/sdk y no tiene mcp-handler", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
    ) as PackageJson;

    const todas = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(todas["@modelcontextprotocol/sdk"]).toBeDefined();
    expect(todas["mcp-handler"]).toBeUndefined();
  });
});
