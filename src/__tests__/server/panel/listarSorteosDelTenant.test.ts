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
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

interface RaffleRow {
  id: string;
  tenantId: string;
  nombre: string;
  premio: string;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date;
  basesPdfUrl: string | null;
  premioImageUrl: string | null;
  ganadorEmail: string | null;
  ganadorNumero: number | null;
  ejecutadoAt: Date | null;
  ejecutadoPor: string | null;
  createdAt: Date;
  _count: { entries: number };
  /** El prefijo de ticket es de la TIENDA (F08/D12): llega por la relación del raffle. */
  tenant: { prefijoTicket: string | null };
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
  basesPdfUrl: null,
  premioImageUrl: null,
  ganadorEmail: null,
  ganadorNumero: null,
  ejecutadoAt: null,
  ejecutadoPor: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  _count: { entries: 0 },
  tenant: { prefijoTicket: "ARMY" },
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
        ganadorNumero: 1057,
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
    // El Historial anuncia el TICKET ganador, no solo el correo (ADR-0024 §5).
    expect(cerrado.ganadorNumero).toBe(1057);
    expect(cerrado.ejecutadoPor).toBe("org@x.cl");
    expect("_count" in cerrado).toBe(false); // el _count no se filtra al cliente
    // F08/D12: el Historial pinta `Nº ARMY-1057`, así que el prefijo de la Tienda tiene que llegar
    // con cada fila — y la relación cruda NO se filtra al cliente.
    expect(cerrado.prefijoTicket).toBe("ARMY");
    expect("tenant" in cerrado).toBe(false);
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
