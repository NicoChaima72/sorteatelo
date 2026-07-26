import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarTiendas } from "~/server/domain/operador/listarTiendas";
import { reactivarTienda } from "~/server/domain/operador/reactivarTienda";
import { suspenderTienda } from "~/server/domain/operador/suspenderTienda";

/**
 * Tests del panel del Operador (F08/F04, D9/I5) con `db` FAKE. Los tres use cases gatean por
 * `acceso.esOperador` (server-side, del env `PLATFORM_OPERATOR_EMAILS`); un no-operador ⇒
 * FORBIDDEN aunque pase un `tenantId` por input — el input SELECCIONA sobre qué Tienda operar,
 * el flag Operador AUTORIZA (I1; lección H1). El Operador solo cambia el ESTADO, no edita
 * contenido (I5/ADR-0006).
 */

const operador = (): AccesoPanel => ({
  userId: "op",
  email: "op@plataforma.cl",
  esOperador: true,
  tenantIds: [],
  // El panel del Operador es CROSS-tenant: sus use cases no resuelven tienda del host.
  tenantIdDelHost: null,
});
const organizador = (): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds: ["A"],
  tenantIdDelHost: "A",
});

describe("domain/operador/listarTiendas (fake db, operador-only)", () => {
  function fakeDb() {
    return {
      tenant: {
        findMany: async () => [
          {
            id: "A",
            slug: "autora",
            nombre: "Tienda Autora",
            estado: "PUBLICADA",
            createdAt: new Date("2026-07-01"),
            _count: { products: 3, orders: 12 },
          },
          {
            id: "B",
            slug: "prueba",
            nombre: "Tienda Prueba",
            estado: "CONFIGURACION",
            createdAt: new Date("2026-07-05"),
            _count: { products: 1, orders: 0 },
          },
        ],
      },
    } as unknown as PrismaClient;
  }

  // operador.tiendas.001 — el Operador ve TODAS las Tiendas con su estado + KPIs mínimos
  it("como Operador, lista todas las Tiendas con estado y conteos", async () => {
    const res = await listarTiendas({ db: fakeDb(), acceso: operador() });
    expect(res.tiendas).toHaveLength(2);
    expect(res.tiendas[0]).toMatchObject({
      slug: "autora",
      estado: "PUBLICADA",
      productos: 3,
      ordenes: 12,
    });
  });

  // operador.tiendas.001b — un NO-operador ⇒ FORBIDDEN (no ve nada)
  it("un no-operador ⇒ FORBIDDEN", async () => {
    await expect(
      listarTiendas({ db: fakeDb(), acceso: organizador() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

/** Fake stateful de una Tienda por id, para las transiciones de estado del Operador. */
function fakeTiendas(estados: Record<string, string>) {
  const db = {
    tenant: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; estado: unknown };
        data: { estado: string };
      }) => {
        const actual = estados[where.id];
        if (actual === undefined) return { count: 0 };
        // where.estado puede ser { not: "SUSPENDIDA" } o "SUSPENDIDA"
        const cond = where.estado as { not?: string } | string;
        const matchea =
          typeof cond === "string"
            ? actual === cond
            : actual !== cond.not;
        if (!matchea) return { count: 0 };
        estados[where.id] = data.estado;
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  return { db, estados };
}

describe("domain/operador/suspenderTienda + reactivarTienda (fake db, operador-only)", () => {
  // operador.tiendas.002 — suspender ⇒ SUSPENDIDA; reactivar ⇒ CONFIGURACION
  it("suspende una Tienda PUBLICADA y luego la reactiva a CONFIGURACION", async () => {
    const { db, estados } = fakeTiendas({ A: "PUBLICADA" });
    const sus = await suspenderTienda({
      db,
      acceso: operador(),
      input: { tenantId: "A" },
    });
    expect(sus.estado).toBe("SUSPENDIDA");
    expect(estados.A).toBe("SUSPENDIDA");

    const rea = await reactivarTienda({
      db,
      acceso: operador(),
      input: { tenantId: "A" },
    });
    expect(rea.estado).toBe("CONFIGURACION"); // D6: siempre a CONFIGURACION, no a PUBLICADA
    expect(estados.A).toBe("CONFIGURACION");
  });

  // operador.tiendas.002b — no-operador NO puede suspender aunque pase el tenantId (el input no autoriza)
  it("un no-operador que pasa un tenantId ⇒ FORBIDDEN, no cambia el estado", async () => {
    const { db, estados } = fakeTiendas({ A: "PUBLICADA" });
    await expect(
      suspenderTienda({
        db,
        acceso: organizador(),
        input: { tenantId: "A" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reactivarTienda({
        db,
        acceso: organizador(),
        input: { tenantId: "A" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(estados.A).toBe("PUBLICADA"); // intacta
  });

  // operador.tiendas.002c — reactivar una Tienda que NO está suspendida ⇒ CONFLICT
  it("reactivar una Tienda no suspendida ⇒ CONFLICT", async () => {
    const { db } = fakeTiendas({ A: "CONFIGURACION" });
    await expect(
      reactivarTienda({ db, acceso: operador(), input: { tenantId: "A" } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  // operador.tiendas.002d — suspender una ya suspendida (o inexistente) ⇒ CONFLICT
  it("suspender una Tienda ya suspendida ⇒ CONFLICT", async () => {
    const { db } = fakeTiendas({ A: "SUSPENDIDA" });
    await expect(
      suspenderTienda({ db, acceso: operador(), input: { tenantId: "A" } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
