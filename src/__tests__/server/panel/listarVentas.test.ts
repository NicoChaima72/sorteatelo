import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarVentas } from "~/server/domain/panel/listarVentas";

/**
 * Tests del use case `listarVentas` con `db` FAKE. Cubre (F03): aislamiento por tenant,
 * orden estable `[createdAt desc, id desc]`, paginación por cursor (sin repetir ni saltear;
 * última página ⇒ nextCursor null), y los montos como string `Decimal` (neto = total − fee
 * calculado con Decimal server-side, sin aritmética `number`). El `pageSize` se inyecta para
 * probar la paginación sin cientos de filas (el router usa el default).
 */

interface OrdenFake {
  id: string;
  tenantId: string;
  email: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  total: Prisma.Decimal;
  createdAt: Date;
  items: Array<{ product: { titulo: string } }>;
  payment: { fee: Prisma.Decimal | null; estado: string } | null;
}

/** Fake db: modela orderBy [createdAt desc, id desc] (recibe las órdenes YA ordenadas) + cursor/skip/take. */
function fakeDb(ordenesOrdenadas: OrdenFake[]) {
  return {
    order: {
      findMany: async ({
        where,
        take,
        cursor,
        skip,
      }: {
        where: { tenantId: string };
        take: number;
        cursor?: { id: string };
        skip?: number;
      }) => {
        const arr = ordenesOrdenadas.filter((o) => o.tenantId === where.tenantId);
        let start = 0;
        if (cursor) {
          const idx = arr.findIndex((o) => o.id === cursor.id);
          start = idx < 0 ? arr.length : idx + (skip ?? 0);
        }
        return arr.slice(start, start + take);
      },
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

/** Órdenes de la Tienda A (ya ordenadas desc por fecha), + 1 de la Tienda B (ruido). */
const ORDENES: OrdenFake[] = [
  { id: "o5", tenantId: "A", email: "e5@x.cl", estado: "PAGADO", total: dec("5000"), createdAt: new Date("2026-01-05"), items: [{ product: { titulo: "Libro 5" } }], payment: { fee: dec("160"), estado: "PAGADO" } },
  { id: "o4", tenantId: "A", email: "e4@x.cl", estado: "PENDIENTE", total: dec("3000"), createdAt: new Date("2026-01-04"), items: [{ product: { titulo: "Libro 4" } }], payment: { fee: null, estado: "PENDIENTE" } },
  { id: "o3", tenantId: "A", email: "e3@x.cl", estado: "PAGADO", total: dec("3000"), createdAt: new Date("2026-01-03"), items: [{ product: { titulo: "Libro 3" } }], payment: { fee: dec("96"), estado: "PAGADO" } },
  { id: "oB", tenantId: "B", email: "eB@x.cl", estado: "PAGADO", total: dec("9999"), createdAt: new Date("2026-01-03"), items: [{ product: { titulo: "Ajeno" } }], payment: { fee: dec("300"), estado: "PAGADO" } },
  { id: "o2", tenantId: "A", email: "e2@x.cl", estado: "FALLIDO", total: dec("3000"), createdAt: new Date("2026-01-02"), items: [{ product: { titulo: "Libro 2" } }], payment: { fee: null, estado: "FALLIDO" } },
  { id: "o1", tenantId: "A", email: "e1@x.cl", estado: "PAGADO", total: dec("3000"), createdAt: new Date("2026-01-01"), items: [{ product: { titulo: "Libro 1" } }], payment: { fee: dec("96"), estado: "PAGADO" } },
];

describe("domain/panel/listarVentas (fake db, tenant-scoped, cursor)", () => {
  // panel.ventas.listar.001 — solo órdenes del tenant, orden estable, neto Decimal
  it("devuelve solo órdenes del tenant, con neto = total − fee (Decimal) para las pagadas", async () => {
    const res = await listarVentas({
      db: fakeDb(ORDENES),
      acceso: acceso(["A"]),
      input: { cursor: null },
      pageSize: 10,
    });
    // ninguna orden de la Tienda B
    expect(res.items.some((o) => o.id === "oB")).toBe(false);
    // orden estable desc
    expect(res.items.map((o) => o.id)).toEqual(["o5", "o4", "o3", "o2", "o1"]);
    // neto de la pagada o5: 5000 − 160 = 4840 (string, Decimal server-side)
    const o5 = res.items.find((o) => o.id === "o5")!;
    expect(o5.total).toBe("5000");
    expect(o5.comision).toBe("160");
    expect(o5.neto).toBe("4840");
    // la pendiente no tiene neto ni comisión
    const o4 = res.items.find((o) => o.id === "o4")!;
    expect(o4.neto).toBeNull();
    expect(o4.comision).toBeNull();
    // títulos de los productos de la orden
    expect(o5.productos).toEqual(["Libro 5"]);
  });

  // panel.ventas.listar.002 — paginación por cursor: sin repetir ni saltear; última ⇒ null
  it("pagina por cursor sin repetir ni saltear filas; última página ⇒ nextCursor null", async () => {
    const db = fakeDb(ORDENES);
    const pageSize = 2;
    const vistos: string[] = [];
    let cursor: string | null = null;
    let vueltas = 0;
    do {
      const page = await listarVentas({
        db,
        acceso: acceso(["A"]),
        input: { cursor },
        pageSize,
      });
      vistos.push(...page.items.map((o) => o.id));
      cursor = page.nextCursor;
      vueltas++;
      expect(vueltas).toBeLessThan(10); // guard anti-loop
    } while (cursor !== null);

    // Las 5 órdenes de A, en orden, sin repetir ni saltear.
    expect(vistos).toEqual(["o5", "o4", "o3", "o2", "o1"]);
    expect(new Set(vistos).size).toBe(5);
  });

  // panel.ventas.listar.003 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN (no lista órdenes globales)", async () => {
    await expect(
      listarVentas({
        db: fakeDb(ORDENES),
        acceso: acceso([]),
        input: { cursor: null },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
