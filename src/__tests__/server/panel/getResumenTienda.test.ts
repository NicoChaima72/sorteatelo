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

/**
 * Deltas de KPI (F03): ventas e ingresos del período actual (14 días) vs el período equivalente
 * anterior (los 14 días previos), computados con `Decimal` server-side. Fake que SÍ respeta el
 * filtro `createdAt` gte/lt para poder distinguir ambas ventanas.
 */
interface OrdenFechaFake {
  tenantId: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  total: Prisma.Decimal;
  createdAt: Date;
}

function fakeDbFechas(ordenes: OrdenFechaFake[], productos: ProductoFake[]) {
  const match = (
    o: OrdenFechaFake,
    where: {
      tenantId: string;
      estado?: string;
      createdAt?: { gte?: Date; lt?: Date };
    },
  ) =>
    o.tenantId === where.tenantId &&
    (where.estado === undefined || o.estado === where.estado) &&
    (where.createdAt?.gte === undefined || o.createdAt >= where.createdAt.gte) &&
    (where.createdAt?.lt === undefined || o.createdAt < where.createdAt.lt);

  return {
    order: {
      count: async ({ where }: { where: Parameters<typeof match>[1] }) =>
        ordenes.filter((o) => match(o, where)).length,
      aggregate: async ({ where }: { where: Parameters<typeof match>[1] }) => {
        const filas = ordenes.filter((o) => match(o, where));
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

const AHORA = new Date("2026-07-18T10:00:00.000Z");
const enDia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("domain/panel/getResumenTienda deltas (fake db con fechas)", () => {
  // panel.resumen.004 — deltas de ventas e ingresos vs período anterior (Decimal server-side)
  it("computa deltas de ventas e ingresos vs el período anterior (14d)", async () => {
    const ordenes: OrdenFechaFake[] = [
      // Período ACTUAL (>= 2026-07-05): 3 órdenes, 6000
      { tenantId: "A", estado: "PAGADO", total: dec("4000"), createdAt: enDia("2026-07-18") },
      { tenantId: "A", estado: "PAGADO", total: dec("1000"), createdAt: enDia("2026-07-10") },
      { tenantId: "A", estado: "PAGADO", total: dec("1000"), createdAt: enDia("2026-07-06") },
      // Período ANTERIOR (2026-06-21 .. 2026-07-04): 2 órdenes, 3000
      { tenantId: "A", estado: "PAGADO", total: dec("2000"), createdAt: enDia("2026-07-01") },
      { tenantId: "A", estado: "PAGADO", total: dec("1000"), createdAt: enDia("2026-06-25") },
      // Más viejo que ambas ventanas (cuenta en el all-time, no en los deltas)
      { tenantId: "A", estado: "PAGADO", total: dec("5000"), createdAt: enDia("2026-06-01") },
      // Ruido de otra Tienda
      { tenantId: "B", estado: "PAGADO", total: dec("9999"), createdAt: enDia("2026-07-18") },
    ];

    const res = await getResumenTienda({
      db: fakeDbFechas(ordenes, [{ tenantId: "A", activo: true }]),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    // Base all-time (solo A): 6 órdenes PAGADO, 14000.
    expect(res.ventasPagadas).toBe(6);
    expect(res.ingresos).toBe("14000");
    // Ventas: actual 3 vs anterior 2 ⇒ +50%.
    expect(res.deltas.ventas).toEqual({ pct: "50", dir: "up" });
    // Ingresos: actual 6000 vs anterior 3000 ⇒ +100%.
    expect(res.deltas.ingresos).toEqual({ pct: "100", dir: "up" });
  });

  // panel.resumen.005 — período anterior vacío ⇒ delta null (no hay base para el %)
  it("sin ventas en el período anterior ⇒ deltas null (sin base de comparación)", async () => {
    const ordenes: OrdenFechaFake[] = [
      { tenantId: "A", estado: "PAGADO", total: dec("4000"), createdAt: enDia("2026-07-18") },
    ];

    const res = await getResumenTienda({
      db: fakeDbFechas(ordenes, []),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(res.deltas.ventas).toBeNull();
    expect(res.deltas.ingresos).toBeNull();
  });

  // panel.resumen.006 — período actual < anterior ⇒ delta con dir "down"
  it("computa delta 'down' cuando el período actual cae respecto del anterior", async () => {
    const ordenes: OrdenFechaFake[] = [
      // Actual (>= 2026-07-05): 1 orden, 1000
      { tenantId: "A", estado: "PAGADO", total: dec("1000"), createdAt: enDia("2026-07-18") },
      // Anterior (2026-06-21 .. 2026-07-04): 2 órdenes, 4000
      { tenantId: "A", estado: "PAGADO", total: dec("2000"), createdAt: enDia("2026-07-02") },
      { tenantId: "A", estado: "PAGADO", total: dec("2000"), createdAt: enDia("2026-06-28") },
    ];

    const res = await getResumenTienda({
      db: fakeDbFechas(ordenes, []),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    // Ventas: actual 1 vs anterior 2 ⇒ -50%.
    expect(res.deltas.ventas).toEqual({ pct: "50", dir: "down" });
    // Ingresos: actual 1000 vs anterior 4000 ⇒ -75%.
    expect(res.deltas.ingresos).toEqual({ pct: "75", dir: "down" });
  });
});
