import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type AccesoPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import {
  definirToolDeCuenta,
  definirToolDeTienda,
} from "~/server/mcp/tools/definirTool";

/**
 * El seam que hace IMPOSIBLE que una tool se olvide de autorizar (D4/I1).
 *
 * El riesgo estructural del MCP es que hay ~20 tools y cada una recibe el slug de la Tienda por
 * argumento: alcanza con que UNA use el slug directo contra la DB para abrir una fuga
 * cross-tenant. La defensa no es "acordarse": es que el handler **nunca vea el slug** y reciba en
 * su lugar un `AccesoPanel` ya resuelto contra la membresía. Si la autorización falla, el handler
 * ni siquiera se ejecuta.
 */

const CTX: ContextoMcp = {
  db: {} as ContextoMcp["db"],
  userId: "user-1",
  email: "org@example.cl",
  clientId: "cli",
  scopes: ["mcp"],
  membresias: [{ tenantId: "tenant-a", slug: "mi-tienda" }],
};

describe("mcp/definirTool", () => {
  // mcp.tools.001 — el arg `tienda` lo agrega el seam, no cada tool
  it("inyecta el argumento `tienda` en el esquema de entrada", () => {
    const tool = definirToolDeTienda({
      nombre: "prueba",
      titulo: "Prueba",
      descripcion: "Tool de prueba.",
      entrada: { limite: z.number().optional() },
      manejar: async () => null,
    });

    expect(Object.keys(tool.entrada).sort()).toEqual(["limite", "tienda"]);
  });

  // mcp.tools.002 — el handler recibe el acceso YA resuelto, jamás el slug
  it("entrega al handler un acceso scopeado a la tienda pedida", async () => {
    let recibido: { args: unknown; acceso: AccesoPanel } | null = null;

    const tool = definirToolDeTienda({
      nombre: "prueba",
      titulo: "Prueba",
      descripcion: "Tool de prueba.",
      entrada: {},
      manejar: async (args, _ctx, acceso) => {
        recibido = { args, acceso };
        return "ok";
      },
    });

    await tool.manejar({ tienda: "mi-tienda" }, CTX);

    expect(recibido).not.toBeNull();
    const { args, acceso } = recibido!;
    expect(acceso).toEqual({
      userId: "user-1",
      email: "org@example.cl",
      tenantIds: ["tenant-a"],
      tenantIdDelHost: "tenant-a",
    });
    // El slug se consumió en la autorización: al handler no le llega para que no lo use.
    expect(args).not.toHaveProperty("tienda");
  });

  // mcp.tools.003 — con una tienda ajena el handler NO CORRE
  it("aborta antes del handler si la tienda no es del dueño del token", async () => {
    let corrio = false;
    const tool = definirToolDeTienda({
      nombre: "prueba",
      titulo: "Prueba",
      descripcion: "Tool de prueba.",
      entrada: {},
      manejar: async () => {
        corrio = true;
        return "no debería correr";
      },
    });

    await expect(tool.manejar({ tienda: "ajena" }, CTX)).rejects.toThrow(
      DomainError,
    );
    expect(corrio).toBe(false);
  });

  // mcp.tools.004 — las tools de cuenta no piden tienda y reciben acceso sin tienda
  it("las tools de cuenta no reciben tienda seleccionada", async () => {
    let accesoRecibido: AccesoPanel | null = null;
    const tool = definirToolDeCuenta({
      nombre: "cuenta",
      titulo: "Cuenta",
      descripcion: "Tool de cuenta.",
      entrada: { nombre: z.string() },
      manejar: async (_args, _ctx, acceso) => {
        accesoRecibido = acceso;
        return "ok";
      },
    });

    expect(Object.keys(tool.entrada)).toEqual(["nombre"]);

    await tool.manejar({ nombre: "x" }, CTX);
    expect(accesoRecibido).not.toBeNull();
    expect(accesoRecibido!.tenantIdDelHost).toBeNull();
  });
});
