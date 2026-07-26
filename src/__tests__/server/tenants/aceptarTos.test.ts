import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { aceptarTos } from "~/server/domain/tenants/aceptarTos";
import { TOS_VERSION } from "~/server/tos/tos";

/**
 * Tests del use case `aceptarTos` (F08/F02, ADR-0008) con `db` FAKE. Graba la aceptación de los
 * Términos sobre la Tienda del acceso (quién = email snapshot / cuándo / qué versión, D2),
 * scopeada por membresía (sin membresía ⇒ FORBIDDEN, I1). Es idempotente: re-aceptar la misma
 * versión no falla, re-sella el timestamp (write-many, no write-once — divergencia con Raffle).
 */

const acceso = (
  tenantIds: string[],
  email: string | null = "org@x.cl",
): AccesoPanel => ({
  userId: "u1",
  email,
  esOperador: false,
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

function fakeDb() {
  let updateArgs: {
    where: { id: string };
    data: Record<string, unknown>;
  } | null = null;
  const db = {
    tenant: {
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        updateArgs = args;
        return { id: args.where.id };
      },
    },
  } as unknown as PrismaClient;
  return { db, getUpdateArgs: () => updateArgs };
}

const AHORA = new Date("2026-07-17T10:00:00Z");

describe("domain/tenants/aceptarTos (fake db, auditable + idempotente)", () => {
  // tenants.tos.001 — graba versión vigente + at + por (email) sobre la Tienda del acceso
  it("graba tosVersion vigente, tosAceptadoAt y tosAceptadoPor (email) en el tenant resuelto", async () => {
    const { db, getUpdateArgs } = fakeDb();
    const res = await aceptarTos({
      db,
      acceso: acceso(["A"], "org@x.cl"),
      ahora: AHORA,
    });

    const args = getUpdateArgs()!;
    expect(args.where).toEqual({ id: "A" }); // tenant del acceso (I1), no del input
    expect(args.data.tosVersion).toBe(TOS_VERSION); // la versión vigente
    expect(args.data.tosAceptadoAt).toEqual(AHORA);
    expect(args.data.tosAceptadoPor).toBe("org@x.cl"); // snapshot del email
    expect(res).toMatchObject({
      aceptada: true,
      version: TOS_VERSION,
      aceptadoPor: "org@x.cl",
    });
  });

  // tenants.tos.001b — sin email, cae al userId como "quién" (auditoría durable)
  it("si no hay email en el acceso, registra el userId como aceptante", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await aceptarTos({ db, acceso: acceso(["A"], null), ahora: AHORA });
    expect(getUpdateArgs()!.data.tosAceptadoPor).toBe("u1");
  });

  // tenants.tos.002 — re-aceptar la misma versión es idempotente: re-sella el timestamp
  it("re-aceptar la misma versión no falla y re-sella el timestamp", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await aceptarTos({ db, acceso: acceso(["A"]), ahora: AHORA });
    const despues = new Date("2026-08-01T12:00:00Z");
    const res = await aceptarTos({ db, acceso: acceso(["A"]), ahora: despues });
    expect(res.aceptada).toBe(true);
    expect(getUpdateArgs()!.data.tosAceptadoAt).toEqual(despues); // re-sellado al nuevo instante
  });

  // tenants.tos.003 — sin membresía ⇒ FORBIDDEN, no escribe
  it("sin membresía ⇒ FORBIDDEN y no escribe", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await expect(
      aceptarTos({ db, acceso: acceso([]), ahora: AHORA }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getUpdateArgs()).toBeNull();
  });
});
