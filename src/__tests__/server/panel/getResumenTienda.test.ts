import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getResumenTienda } from "~/server/domain/panel/getResumenTienda";

/**
 * Tests del use case `getResumenTienda` (KPIs del dashboard, F03) con `db` FAKE. Los KPIs se
 * calculan SOLO sobre el tenant resuelto; los ingresos se suman con `Decimal` server-side
 * (`_sum`), nunca con aritmética `number`, y viajan como string.
 */

interface OrdenFake {
  tenantId: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  total: Prisma.Decimal;
}
interface ProductoFake {
  tenantId: string;
  activo: boolean;
}

function fakeDb(ordenes: OrdenFake[], productos: ProductoFake[]) {
  return {
    order: {
      count: async ({
        where,
      }: {
        where: { tenantId: string; estado?: string };
      }) =>
        ordenes.filter(
          (o) =>
            o.tenantId === where.tenantId &&
            (where.estado === undefined || o.estado === where.estado),
        ).length,
      aggregate: async ({
        where,
      }: {
        where: { tenantId: string; estado?: string };
      }) => {
        const filas = ordenes.filter(
          (o) =>
            o.tenantId === where.tenantId &&
            (where.estado === undefined || o.estado === where.estado),
        );
        // Prisma real: sin filas que agregar, `_sum.total` es null (no 0). Emularlo
        // aquí ejercita el coalesce `?? new Prisma.Decimal(0)` de getResumenTienda.ts.
        const total = filas.length
          ? filas.reduce((acc, o) => acc.plus(o.total), new Prisma.Decimal(0))
          : null;
        return { _sum: { total } };
      },
    },
    product: {
      count: async ({
        where,
      }: {
        where: { tenantId: string; activo?: boolean };
      }) =>
        productos.filter(
          (p) =>
            p.tenantId === where.tenantId &&
            (where.activo === undefined || p.activo === where.activo),
        ).length,
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

const ORDENES: OrdenFake[] = [
  { tenantId: "A", estado: "PAGADO", total: dec("5000") },
  { tenantId: "A", estado: "PAGADO", total: dec("3000") },
  { tenantId: "A", estado: "PENDIENTE", total: dec("3000") },
  { tenantId: "A", estado: "FALLIDO", total: dec("3000") },
  { tenantId: "B", estado: "PAGADO", total: dec("9999") }, // ruido de otra Tienda
];
const PRODUCTOS: ProductoFake[] = [
  { tenantId: "A", activo: true },
  { tenantId: "A", activo: true },
  { tenantId: "A", activo: false },
  { tenantId: "B", activo: true },
];

describe("domain/panel/getResumenTienda (fake db, tenant-scoped)", () => {
  // panel.resumen.001 — KPIs solo del tenant; ingresos como Decimal (string)
  it("calcula los KPIs solo del tenant, ingresos sumados con Decimal", async () => {
    const res = await getResumenTienda({
      db: fakeDb(ORDENES, PRODUCTOS),
      acceso: acceso(["A"]),
    });
    expect(res.ventasPagadas).toBe(2);
    expect(res.ingresos).toBe("8000"); // 5000 + 3000, NO 9999 de la Tienda B
    expect(res.ordenesPendientes).toBe(1);
    expect(res.productosActivos).toBe(2);
  });

  // panel.resumen.002 — tienda sin ventas: ingresos "0", no null
  it("una Tienda sin ventas devuelve ingresos '0' (no null)", async () => {
    const res = await getResumenTienda({
      db: fakeDb([], [{ tenantId: "A", activo: true }]),
      acceso: acceso(["A"]),
    });
    expect(res.ventasPagadas).toBe(0);
    expect(res.ingresos).toBe("0");
    expect(res.productosActivos).toBe(1);
  });

  // panel.resumen.003 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getResumenTienda({ db: fakeDb(ORDENES, PRODUCTOS), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
