import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getConfiguracionTienda } from "~/server/domain/panel/getConfiguracionTienda";
import { guardarConfiguracionTienda } from "~/server/domain/panel/guardarConfiguracionTienda";

/**
 * Tests de la configuración de Tienda (F04, D8): bases del sorteo (texto) + config básica de
 * plantilla (descripcion/logoUrl/colorPrimario). Solo se escribe sobre el tenant autorizado
 * (resuelto server-side); sin membresía ⇒ FORBIDDEN. Un email/tenant ajeno no puede llegar
 * acá porque el input NO lleva tenantId (I1).
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

describe("domain/panel/guardarConfiguracionTienda (fake db)", () => {
  function fakeDb() {
    let updateArgs: {
      where: { id: string };
      data: Record<string, unknown>;
    } | null = null;
    const db = {
      tenant: {
        update: async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updateArgs = args;
          return { id: args.where.id };
        },
      },
    } as unknown as PrismaClient;
    return { db, getUpdateArgs: () => updateArgs };
  }

  // panel.config.guardar.001 — persiste bases + plantilla SOLO en el tenant autorizado
  it("guarda bases del sorteo + campos de plantilla en el tenant resuelto (no del input)", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await guardarConfiguracionTienda({
      db,
      acceso: acceso(["A"]),
      input: {
        descripcion: "Mi tienda",
        logoUrl: "https://x.cl/logo.png",
        colorPrimario: "#4f46e5",
        basesSorteo: "Bases del sorteo: participan las compras pagadas…",
      },
    });
    const args = getUpdateArgs()!;
    expect(args.where).toEqual({ id: "A" }); // tenant del acceso
    expect(args.data.descripcion).toBe("Mi tienda");
    expect(args.data.colorPrimario).toBe("#4f46e5");
    expect(args.data.basesSorteo).toContain("Bases del sorteo");
  });

  // panel.config.guardar.002 — campos vacíos ⇒ null (limpia el valor)
  it("los campos vacíos se guardan como null (no string vacío)", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await guardarConfiguracionTienda({
      db,
      acceso: acceso(["A"]),
      input: { descripcion: "", logoUrl: "", colorPrimario: "", basesSorteo: "" },
    });
    const args = getUpdateArgs()!;
    expect(args.data.descripcion).toBeNull();
    expect(args.data.logoUrl).toBeNull();
    expect(args.data.colorPrimario).toBeNull();
    expect(args.data.basesSorteo).toBeNull();
  });

  // panel.config.guardar.003 — sin membresía ⇒ FORBIDDEN, no escribe
  it("sin membresía ⇒ FORBIDDEN y no escribe", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await expect(
      guardarConfiguracionTienda({
        db,
        acceso: acceso([]),
        input: { descripcion: "x", logoUrl: "", colorPrimario: "", basesSorteo: "" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getUpdateArgs()).toBeNull();
  });
});

describe("domain/panel/getConfiguracionTienda (fake db)", () => {
  function fakeDb(tenant: Record<string, unknown> | null) {
    return {
      tenant: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          if (where.id === "A" && tenant) return tenant;
          throw new Error("no encontrado");
        },
      },
    } as unknown as PrismaClient;
  }

  // panel.config.get.001 — devuelve la config del tenant autorizado
  it("devuelve nombre/slug/estado + config de plantilla + bases del tenant", async () => {
    const res = await getConfiguracionTienda({
      db: fakeDb({
        nombre: "Tienda A",
        slug: "a",
        estado: "PUBLICADA",
        descripcion: "desc",
        logoUrl: null,
        colorPrimario: "#4f46e5",
        basesSorteo: "bases…",
      }),
      acceso: acceso(["A"]),
    });
    expect(res).toMatchObject({
      nombre: "Tienda A",
      slug: "a",
      colorPrimario: "#4f46e5",
      basesSorteo: "bases…",
    });
  });

  // panel.config.get.002 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getConfiguracionTienda({ db: fakeDb(null), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
