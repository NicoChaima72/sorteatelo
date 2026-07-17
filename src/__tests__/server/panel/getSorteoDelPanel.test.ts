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
  // 3 tickets de a@x.cl + 1 de b@x.cl ⇒ 4 participaciones, 2 participantes (ADR-0012).
  entries: [
    { email: "a@x.cl", createdAt: new Date("2026-01-06") },
    { email: "a@x.cl", createdAt: new Date("2026-01-05") },
    { email: "a@x.cl", createdAt: new Date("2026-01-04") },
    { email: "b@x.cl", createdAt: new Date("2026-01-03") },
  ],
};

describe("domain/panel/getSorteoDelPanel (fake db, tenant-scoped)", () => {
  // panel.sorteo.get.001 — agrupa las participaciones por correo con su conteo de tickets
  it("agrupa las participaciones por correo con su conteo de tickets y devuelve totalParticipaciones", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb(RAFFLE_A),
      acceso: acceso(["A"]),
    });
    expect(res.sorteo).not.toBeNull();
    expect(res.sorteo!.nombre).toBe("Sorteo BTS");
    // totalParticipaciones = nº de tickets (RaffleEntry), no de participantes.
    expect(res.sorteo!.totalParticipaciones).toBe(4);
    const porCorreo = new Map(
      res.sorteo!.participantes.map((p) => [p.email, p]),
    );
    expect(porCorreo.size).toBe(2); // 2 participantes distintos
    expect(porCorreo.get("a@x.cl")!.tickets).toBe(3);
    expect(porCorreo.get("b@x.cl")!.tickets).toBe(1);
    // ultimaInscripcion = el ticket más reciente de ese correo
    expect(porCorreo.get("a@x.cl")!.ultimaInscripcion).toEqual(
      new Date("2026-01-06"),
    );
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
