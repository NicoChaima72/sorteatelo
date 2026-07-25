import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarSorteosDelTenant } from "~/server/domain/panel/listarSorteosDelTenant";

/**
 * Tests del use case de lectura `listarSorteosDelTenant` (F01/D12) con `db` FAKE. Devuelve TODOS los
 * raffles del tenant resuelto SERVER-SIDE con `totalParticipaciones` (= `_count.entries`) y datos de
 * ganador; un tenant ajeno JAMÁS aparece; sin membresía ⇒ FORBIDDEN.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds,
});

interface RaffleRow {
  id: string;
  tenantId: string;
  nombre: string;
  premio: string;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date;
  basesUrl: string | null;
  premioImageUrl: string | null;
  ganadorEmail: string | null;
  ejecutadoAt: Date | null;
  ejecutadoPor: string | null;
  createdAt: Date;
  _count: { entries: number };
}

function fakeDb(rows: RaffleRow[]) {
  return {
    raffle: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        rows.filter((r) => r.tenantId === where.tenantId),
    },
  } as unknown as PrismaClient;
}

const base = (over: Partial<RaffleRow>): RaffleRow => ({
  id: "r",
  tenantId: "A",
  nombre: "Sorteo",
  premio: "Premio",
  estado: "CERRADO",
  fechaInicio: new Date("2026-01-01T00:00:00Z"),
  fechaFin: new Date("2026-02-01T00:00:00Z"),
  basesUrl: null,
  premioImageUrl: null,
  ganadorEmail: null,
  ejecutadoAt: null,
  ejecutadoPor: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  _count: { entries: 0 },
  ...over,
});

describe("domain/panel/listarSorteosDelTenant (fake db, scoped por tenant)", () => {
  // panel.sorteo.listar.001 — mapea _count.entries ⇒ totalParticipaciones + datos de ganador
  it("devuelve los raffles del tenant con conteo de tickets y datos de ganador", async () => {
    const db = fakeDb([
      base({
        id: "r-cerrado",
        estado: "CERRADO",
        ganadorEmail: "ganador@x.cl",
        ejecutadoAt: new Date("2026-02-01T10:00:00Z"),
        ejecutadoPor: "org@x.cl",
        _count: { entries: 12 },
      }),
      base({ id: "r-activo", estado: "ACTIVO", _count: { entries: 3 } }),
    ]);
    const { sorteos } = await listarSorteosDelTenant({ db, acceso: acceso(["A"]) });

    expect(sorteos).toHaveLength(2);
    const cerrado = sorteos.find((s) => s.id === "r-cerrado")!;
    expect(cerrado.totalParticipaciones).toBe(12);
    expect(cerrado.ganadorEmail).toBe("ganador@x.cl");
    expect(cerrado.ejecutadoPor).toBe("org@x.cl");
    expect("_count" in cerrado).toBe(false); // el _count no se filtra al cliente
    const activo = sorteos.find((s) => s.id === "r-activo")!;
    expect(activo.totalParticipaciones).toBe(3);
  });

  // panel.sorteo.listar.002 — un raffle de OTRO tenant nunca aparece
  it("no incluye raffles de otro tenant (scoped server-side)", async () => {
    const db = fakeDb([
      base({ id: "mio", tenantId: "A" }),
      base({ id: "ajeno", tenantId: "B" }),
    ]);
    const { sorteos } = await listarSorteosDelTenant({ db, acceso: acceso(["A"]) });
    expect(sorteos.map((s) => s.id)).toEqual(["mio"]);
  });

  // panel.sorteo.listar.003 — sin membresía ⇒ FORBIDDEN (nunca usa tenantId del input)
  it("sin membresía ⇒ FORBIDDEN", async () => {
    const db = fakeDb([base({ id: "r", tenantId: "A" })]);
    await expect(
      listarSorteosDelTenant({ db, acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
