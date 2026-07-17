import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { ejecutarSorteo } from "~/server/domain/panel/ejecutarSorteo";

/**
 * Tests del use case `ejecutarSorteo` (F05 interna) con `db` FAKE STATEFUL. La ejecución es
 * AUDITABLE e IDEMPOTENTE: marca ganador UNA sola vez, registra quién (email) y cuándo, y
 * transiciona ACTIVO→CERRADO. Re-ejecutar NO vuelve a sortear: devuelve el ganador guardado.
 * Scopeado por tenant; sin participantes ⇒ INVALID; raffle ajeno/inexistente ⇒ NOT_FOUND.
 */

const acceso = (tenantIds: string[], email?: string): AccesoPanel => ({
  userId: "u1",
  email: email ?? "org@x.cl",
  esOperador: false,
  tenantIds,
});

interface RaffleState {
  id: string;
  tenantId: string;
  estado: string;
  ejecutadoAt: Date | null;
  ganadorEmail: string | null;
  ejecutadoPor: string | null;
}

function fakeDb(
  raffle: RaffleState,
  entries: Array<{ raffleId: string; tenantId: string; email: string }>,
) {
  const tx = {
    raffle: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === raffle.id && where.tenantId === raffle.tenantId
          ? { ...raffle }
          : null,
      findFirstOrThrow: async () => ({ ...raffle }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; tenantId: string; ejecutadoAt: null };
        data: Partial<RaffleState>;
      }) => {
        // guard atómico: solo si sigue sin ejecutar
        if (where.ejecutadoAt === null && raffle.ejecutadoAt !== null) {
          return { count: 0 };
        }
        Object.assign(raffle, data);
        return { count: 1 };
      },
    },
    raffleEntry: {
      findMany: async ({ where }: { where: { raffleId: string; tenantId: string } }) =>
        entries.filter(
          (e) => e.raffleId === where.raffleId && e.tenantId === where.tenantId,
        ),
    },
  };
  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;
  return { db, raffle };
}

const AHORA = new Date("2026-02-15T12:00:00Z");

describe("domain/panel/ejecutarSorteo (fake db stateful, auditable + idempotente)", () => {
  // panel.sorteo.ejecutar.001 — ejecuta: elige ganador, marca quién/cuándo, cierra
  it("ejecuta el sorteo: ganador elegido, ejecutadoAt/ejecutadoPor registrados, estado CERRADO", async () => {
    const { db, raffle } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
        { raffleId: "r1", tenantId: "A", email: "b@x.cl" },
        { raffleId: "r1", tenantId: "A", email: "c@x.cl" },
      ],
    );
    const res = await ejecutarSorteo({
      db,
      acceso: acceso(["A"], "org@x.cl"),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: () => 1, // elige el 2º (b@x.cl)
    });
    expect(res.ganadorEmail).toBe("b@x.cl");
    expect(res.yaEjecutado).toBe(false);
    expect(res.ejecutadoAt).toEqual(AHORA);
    // persistido en el raffle
    expect(raffle.ganadorEmail).toBe("b@x.cl");
    expect(raffle.ejecutadoAt).toEqual(AHORA);
    expect(raffle.ejecutadoPor).toBe("org@x.cl"); // snapshot del email del ejecutor
    expect(raffle.estado).toBe("CERRADO");
  });

  // panel.sorteo.ejecutar.002 — IDEMPOTENTE: re-ejecutar NO vuelve a sortear
  it("re-ejecutar devuelve el MISMO ganador sin volver a sortear (idempotente)", async () => {
    const { db } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
        { raffleId: "r1", tenantId: "A", email: "b@x.cl" },
      ],
    );
    const elegir = vi.fn<(n: number) => number>().mockReturnValueOnce(0).mockReturnValue(1);

    const primera = await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: elegir,
    });
    const segunda = await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: new Date("2027-01-01"),
      elegirIndice: elegir,
    });

    expect(primera.ganadorEmail).toBe("a@x.cl");
    expect(segunda.ganadorEmail).toBe("a@x.cl"); // NO cambió aunque elegir devolvería 1
    expect(segunda.yaEjecutado).toBe(true);
    expect(segunda.ejecutadoAt).toEqual(AHORA); // la fecha original, no la segunda
  });

  // panel.sorteo.ejecutar.006 — carrera concurrente: el guard atómico pierde (count 0) ⇒
  // devuelve el ganador AUTORITATIVO re-leído, sin re-sortear (idempotencia bajo carrera real)
  it("bajo carrera (updateMany count 0) devuelve el ganador re-leído, descartando su propio sorteo", async () => {
    const ganadorConcurrente = {
      ganadorEmail: "concurrente@x.cl",
      ejecutadoAt: new Date("2026-02-10T00:00:00Z"),
      ejecutadoPor: "otro@x.cl",
    };
    // findFirst ve ejecutadoAt:null (pasa el chequeo temprano), pero updateMany devuelve
    // count 0 (otra transacción ganó la carrera entre findFirst y updateMany).
    const tx = {
      raffle: {
        findFirst: async () => ({
          id: "r1",
          ejecutadoAt: null,
          ganadorEmail: null,
          ejecutadoPor: null,
        }),
        updateMany: async () => ({ count: 0 }),
        findFirstOrThrow: async () => ganadorConcurrente,
      },
      raffleEntry: {
        findMany: async () => [
          { email: "a@x.cl" },
          { email: "b@x.cl" },
        ],
      },
    };
    const db = {
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
    } as unknown as PrismaClient;

    const elegir = vi.fn<(n: number) => number>().mockReturnValue(0); // habría elegido a@x.cl
    const res = await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: elegir,
    });

    // devuelve el ganador guardado por la ejecución que ganó la carrera, NO su propio pick
    expect(res.ganadorEmail).toBe("concurrente@x.cl");
    expect(res.yaEjecutado).toBe(true);
    expect(res.ejecutadoAt).toEqual(ganadorConcurrente.ejecutadoAt);
  });

  // panel.sorteo.ejecutar.003 — sin participantes ⇒ INVALID (no se puede sortear)
  it("un sorteo sin participantes ⇒ INVALID", async () => {
    const { db } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ejecutadoPor: null },
      [],
    );
    await expect(
      ejecutarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "r1" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  // panel.sorteo.ejecutar.004 — raffle de OTRA Tienda ⇒ NOT_FOUND
  it("un raffle de otra Tienda ⇒ NOT_FOUND", async () => {
    const { db } = fakeDb(
      { id: "rB", tenantId: "B", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ejecutadoPor: null },
      [{ raffleId: "rB", tenantId: "B", email: "x@x.cl" }],
    );
    await expect(
      ejecutarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "rB" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // panel.sorteo.ejecutar.005 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    const { db } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ejecutadoPor: null },
      [{ raffleId: "r1", tenantId: "A", email: "a@x.cl" }],
    );
    await expect(
      ejecutarSorteo({
        db,
        acceso: acceso([]),
        input: { raffleId: "r1" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
