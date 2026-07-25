import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { editarSorteo } from "~/server/domain/panel/editarSorteo";

/**
 * Tests del use case `editarSorteo` (F02) con `db` FAKE STATEFUL. Solo edita un Raffle ACTIVO y NO
 * ejecutado; muta ÚNICAMENTE nombre/premio/fechaFin/basesUrl (nunca estado, premioImageUrl ni campos
 * de ejecución, I4). Ya ejecutado ⇒ CONFLICT; raffle ajeno/inexistente ⇒ NOT_FOUND. Scoped por
 * tenant server-side; el `raffleId` del input se valida contra el tenant.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds,
});

const AHORA = new Date("2026-02-15T12:00:00Z");
const FUTURO = new Date("2026-03-15T12:00:00Z");

function fakeDb(
  raffle: { id: string; tenantId: string; ejecutadoAt: Date | null } | null,
) {
  let updateData: Record<string, unknown> | null = null;

  const tx = {
    raffle: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string };
      }) =>
        raffle && where.id === raffle.id && where.tenantId === raffle.tenantId
          ? { id: raffle.id, ejecutadoAt: raffle.ejecutadoAt }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; tenantId: string; ejecutadoAt: null };
        data: Record<string, unknown>;
      }) => {
        if (
          !raffle ||
          where.id !== raffle.id ||
          where.tenantId !== raffle.tenantId
        ) {
          return { count: 0 };
        }
        // Guard atómico: solo si sigue sin ejecutar.
        if (where.ejecutadoAt === null && raffle.ejecutadoAt !== null) {
          return { count: 0 };
        }
        updateData = data;
        return { count: 1 };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return { db, getUpdateData: () => updateData };
}

describe("domain/panel/editarSorteo (fake db stateful, solo ACTIVO no ejecutado)", () => {
  // panel.sorteo.editar.001 — edita nombre/premio/fechaFin/basesUrl del ACTIVO
  it("actualiza nombre/premio/fechaFin/basesUrl del Raffle ACTIVO del tenant", async () => {
    const { db, getUpdateData } = fakeDb({
      id: "r1",
      tenantId: "A",
      ejecutadoAt: null,
    });
    const res = await editarSorteo({
      db,
      acceso: acceso(["A"]),
      input: {
        raffleId: "r1",
        nombre: "Nuevo nombre",
        premio: "Nuevo premio",
        fechaFin: FUTURO,
        basesUrl: "https://bases.cl/x",
      },
      ahora: AHORA,
    });
    expect(res.id).toBe("r1");
    const data = getUpdateData()!;
    expect(data.nombre).toBe("Nuevo nombre");
    expect(data.premio).toBe("Nuevo premio");
    expect(data.fechaFin).toEqual(FUTURO);
    expect(data.basesUrl).toBe("https://bases.cl/x");
  });

  // panel.sorteo.editar.002 — ya ejecutado ⇒ CONFLICT
  it("RECHAZA (CONFLICT) si el Raffle ya fue ejecutado (ejecutadoAt != null)", async () => {
    const { db, getUpdateData } = fakeDb({
      id: "r1",
      tenantId: "A",
      ejecutadoAt: new Date("2026-02-10T00:00:00Z"),
    });
    await expect(
      editarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "r1", nombre: "X", premio: "Y", fechaFin: FUTURO },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getUpdateData()).toBeNull();
  });

  // panel.sorteo.editar.003 — raffleId de otro tenant ⇒ NOT_FOUND
  it("con raffleId de otro tenant ⇒ NOT_FOUND", async () => {
    const { db, getUpdateData } = fakeDb({
      id: "rB",
      tenantId: "B",
      ejecutadoAt: null,
    });
    await expect(
      editarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "rB", nombre: "X", premio: "Y", fechaFin: FUTURO },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getUpdateData()).toBeNull();
  });

  // panel.sorteo.editar.005 — carrera concurrente: findFirst ve ejecutadoAt null pero updateMany
  //                            devuelve count 0 (otra tx ejecutó entre el read y el update) ⇒ CONFLICT
  it("bajo carrera (updateMany count 0 pese a findFirst sin ejecutar) ⇒ CONFLICT", async () => {
    let updateIntentado = false;
    const tx = {
      raffle: {
        findFirst: async () => ({ id: "r1", ejecutadoAt: null }), // pasa el chequeo temprano
        updateMany: async () => {
          updateIntentado = true;
          return { count: 0 }; // pero el guard atómico pierde la carrera
        },
      },
    };
    const db = {
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
    } as unknown as PrismaClient;

    await expect(
      editarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "r1", nombre: "X", premio: "Y", fechaFin: FUTURO },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updateIntentado).toBe(true); // llegó al guard atómico y rechazó ahí
  });

  // panel.sorteo.editar.004 — no muta estado, premioImageUrl ni campos de ejecución
  it("no permite mutar estado, premioImageUrl ni campos de ejecución (solo los 4 campos editables)", async () => {
    const { db, getUpdateData } = fakeDb({
      id: "r1",
      tenantId: "A",
      ejecutadoAt: null,
    });
    await editarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1", nombre: "N", premio: "P", fechaFin: FUTURO },
      ahora: AHORA,
    });
    const keys = Object.keys(getUpdateData()!).sort();
    expect(keys).toEqual(["basesUrl", "fechaFin", "nombre", "premio"]);
  });
});
