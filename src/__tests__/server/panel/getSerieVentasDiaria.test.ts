import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getSerieVentasDiaria } from "~/server/domain/panel/getSerieVentasDiaria";

/**
 * Tests del use case `getSerieVentasDiaria` (serie diaria de ventas del dashboard, F03) con `db`
 * FAKE. La serie es de 14 días, SOLO del tenant resuelto server-side (I1), cuenta las órdenes
 * PAGADO por día y suma `total` con `Decimal` (I2) — los ingresos viajan como string, nunca
 * `number` en el server. La fecha "ahora" se inyecta para determinismo.
 */

interface OrdenFake {
  tenantId: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  total: Prisma.Decimal;
  createdAt: Date;
}

function fakeDb(ordenes: OrdenFake[]) {
  return {
    order: {
      findMany: async ({
        where,
      }: {
        where: {
          tenantId: string;
          estado?: string;
          createdAt?: { gte?: Date; lt?: Date };
        };
      }) =>
        ordenes
          .filter(
            (o) =>
              o.tenantId === where.tenantId &&
              (where.estado === undefined || o.estado === where.estado) &&
              (where.createdAt?.gte === undefined ||
                o.createdAt >= where.createdAt.gte) &&
              (where.createdAt?.lt === undefined ||
                o.createdAt < where.createdAt.lt),
          )
          .map((o) => ({ createdAt: o.createdAt, total: o.total })),
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

// Ancla fija de "ahora" para que la ventana de 14 días sea determinista.
const AHORA = new Date("2026-07-18T10:00:00.000Z");
const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("domain/panel/getSerieVentasDiaria (fake db, tenant-scoped)", () => {
  // panel.serieVentas.001 — 14 días, cuenta + suma Decimal (string) por día, días vacíos en cero
  it("devuelve 14 días con conteo y suma Decimal por día; días sin ventas en cero", async () => {
    const ordenes: OrdenFake[] = [
      { tenantId: "A", estado: "PAGADO", total: dec("5000"), createdAt: dia("2026-07-18") },
      { tenantId: "A", estado: "PAGADO", total: dec("3000"), createdAt: dia("2026-07-18") },
      { tenantId: "A", estado: "PAGADO", total: dec("2000"), createdAt: dia("2026-07-10") },
      { tenantId: "A", estado: "PAGADO", total: dec("1000"), createdAt: dia("2026-07-05") },
    ];

    const serie = await getSerieVentasDiaria({
      db: fakeDb(ordenes),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(serie).toHaveLength(14);
    // Orden ascendente: primer día = hoy - 13 = 2026-07-05; último = hoy = 2026-07-18.
    expect(serie[0]).toMatchObject({ ventas: 1, ingresos: "1000" });
    expect(serie[13]).toMatchObject({ ventas: 2, ingresos: "8000" });
    const jul10 = serie.find((d) => d.fecha.toISOString().slice(0, 10) === "2026-07-10");
    expect(jul10).toMatchObject({ ventas: 1, ingresos: "2000" });
    const jul11 = serie.find((d) => d.fecha.toISOString().slice(0, 10) === "2026-07-11");
    expect(jul11).toMatchObject({ ventas: 0, ingresos: "0" });
    // Los ingresos SIEMPRE son string (nunca number en el server).
    for (const d of serie) expect(typeof d.ingresos).toBe("string");
  });

  // panel.serieVentas.002 — solo PAGADO del tenant resuelto (excluye otra Tienda y otros estados)
  it("solo cuenta PAGADO del tenant resuelto (ignora otra Tienda y PENDIENTE/FALLIDO)", async () => {
    const ordenes: OrdenFake[] = [
      { tenantId: "A", estado: "PAGADO", total: dec("4000"), createdAt: dia("2026-07-18") },
      { tenantId: "A", estado: "PENDIENTE", total: dec("9000"), createdAt: dia("2026-07-18") },
      { tenantId: "A", estado: "FALLIDO", total: dec("9000"), createdAt: dia("2026-07-18") },
      { tenantId: "B", estado: "PAGADO", total: dec("9999"), createdAt: dia("2026-07-18") },
    ];

    const serie = await getSerieVentasDiaria({
      db: fakeDb(ordenes),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    // Hoy: solo la orden PAGADO de A (4000), NO la PENDIENTE/FALLIDO de A ni la PAGADO de B.
    expect(serie[13]).toMatchObject({ ventas: 1, ingresos: "4000" });
    // El total de la serie = solo esa orden.
    const totalVentas = serie.reduce((acc, d) => acc + d.ventas, 0);
    expect(totalVentas).toBe(1);
  });

  // panel.serieVentas.003 — sin membresía ⇒ FORBIDDEN (fail-closed, I1)
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getSerieVentasDiaria({ db: fakeDb([]), acceso: acceso([]), ahora: AHORA }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
