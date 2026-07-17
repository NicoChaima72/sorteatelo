import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getSorteoDelPanel } from "~/server/domain/panel/getSorteoDelPanel";

/**
 * Tests del use case `getSorteoDelPanel` (F05 interna) con `db` FAKE. Lee el sorteo actual
 * de la Tienda (el más reciente) con sus participaciones reales, scopeado por el `tenantId`
 * resuelto server-side. Sin membresía ⇒ FORBIDDEN. Sin sorteo ⇒ sorteo: null.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

function fakeDb(raffle: Record<string, unknown> | null) {
  return {
    raffle: {
      findFirst: async ({ where }: { where: { tenantId: string } }) =>
        where.tenantId === "A" ? raffle : null,
    },
  } as unknown as PrismaClient;
}

const RAFFLE_A = {
  id: "r1",
  nombre: "Sorteo BTS",
  premio: "2 entradas",
  estado: "ACTIVO",
  fechaInicio: new Date("2026-01-01"),
  fechaFin: new Date("2026-03-01"),
  ganadorEmail: null,
  ejecutadoAt: null,
  ejecutadoPor: null,
  entries: [
    { email: "a@x.cl", createdAt: new Date("2026-01-05") },
    { email: "b@x.cl", createdAt: new Date("2026-01-04") },
  ],
};

describe("domain/panel/getSorteoDelPanel (fake db, tenant-scoped)", () => {
  // panel.sorteo.get.001 — devuelve el sorteo del tenant con sus participaciones
  it("devuelve el sorteo del tenant con participantes y total, sin ejecutar", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb(RAFFLE_A),
      acceso: acceso(["A"]),
    });
    expect(res.sorteo).not.toBeNull();
    expect(res.sorteo!.nombre).toBe("Sorteo BTS");
    expect(res.sorteo!.totalParticipantes).toBe(2);
    expect(res.sorteo!.participantes.map((p) => p.email)).toEqual([
      "a@x.cl",
      "b@x.cl",
    ]);
    expect(res.sorteo!.ejecutadoAt).toBeNull();
    expect(res.sorteo!.ganadorEmail).toBeNull();
  });

  // panel.sorteo.get.002 — Tienda sin sorteo ⇒ sorteo: null
  it("sin sorteo devuelve sorteo: null (empty state)", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb(null),
      acceso: acceso(["A"]),
    });
    expect(res.sorteo).toBeNull();
  });

  // panel.sorteo.get.003 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getSorteoDelPanel({ db: fakeDb(RAFFLE_A), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
