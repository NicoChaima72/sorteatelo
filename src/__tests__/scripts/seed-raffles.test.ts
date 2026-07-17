import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  type EspecificacionRaffle,
  sembrarRafflesActivos,
} from "../../../scripts/seed-raffles";

/**
 * Test DB-backed del núcleo del seed de sorteos (F02). La idempotencia es la propiedad
 * clave: el seed puede correrse muchas veces sin duplicar el Raffle ACTIVO de ningún
 * tenant (S5: a lo sumo uno ACTIVO por tenant). Los tenants se crean antes (el seed de
 * raffles depende de ellos); slugs de prueba scopeados y limpiados antes/después.
 */

const SLUGS = ["test-raffle-a", "test-raffle-b"];

const INICIO = new Date(Date.UTC(2026, 0, 1));
const FIN = new Date(Date.UTC(2026, 3, 1));

const SPECS: EspecificacionRaffle[] = [
  {
    tenantSlug: "test-raffle-a",
    nombre: "Sorteo A",
    premio: "2 entradas a un recital",
    fechaInicio: INICIO,
    fechaFin: FIN,
  },
  {
    tenantSlug: "test-raffle-b",
    nombre: "Sorteo B",
    premio: "Premio de prueba B",
    fechaInicio: INICIO,
    fechaFin: FIN,
  },
];

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { in: SLUGS } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // Orden FK-safe: hijos (Restrict hacia Tenant/Raffle) antes que el Tenant.
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

async function crearTenants() {
  for (const slug of SLUGS) {
    await db.tenant.create({
      data: { slug, nombre: `Tenant ${slug}`, estado: "PUBLICADA" },
    });
  }
}

beforeEach(async () => {
  await limpiar();
  await crearTenants();
});
afterEach(limpiar);

describe("scripts/seed-raffles — sembrarRafflesActivos (DB-backed)", () => {
  // seed.raffles.001
  it("crea un Raffle ACTIVO por tenant seed, con nombre, premio, fechas y su tenantId", async () => {
    const res = await sembrarRafflesActivos({ db, specs: SPECS });

    expect(res).toHaveLength(2);
    expect(res.every((r) => r.raffleCreado)).toBe(true);
    expect(res.every((r) => !r.omitido)).toBe(true);

    for (const spec of SPECS) {
      const tenant = await db.tenant.findUniqueOrThrow({
        where: { slug: spec.tenantSlug },
        select: { id: true },
      });
      const raffles = await db.raffle.findMany({
        where: { tenantId: tenant.id },
      });
      expect(raffles).toHaveLength(1);
      const raffle = raffles[0]!;
      expect(raffle.estado).toBe("ACTIVO");
      expect(raffle.nombre).toBe(spec.nombre);
      expect(raffle.premio).toBe(spec.premio);
      expect(raffle.tenantId).toBe(tenant.id); // scoped a ESA tienda
      expect(raffle.fechaInicio.toISOString()).toBe(spec.fechaInicio.toISOString());
      expect(raffle.fechaFin.toISOString()).toBe(spec.fechaFin.toISOString());
    }
  });

  // seed.raffles.002
  it("es idempotente: correrlo dos veces NO duplica el Raffle ACTIVO de ningún tenant", async () => {
    const primera = await sembrarRafflesActivos({ db, specs: SPECS });
    const segunda = await sembrarRafflesActivos({ db, specs: SPECS });

    expect(primera.every((r) => r.raffleCreado)).toBe(true);
    expect(segunda.every((r) => r.raffleCreado)).toBe(false); // ya existían
    // El id del ACTIVO es el mismo en ambas corridas (no se creó otro).
    expect(segunda.map((r) => r.raffleId)).toEqual(primera.map((r) => r.raffleId));

    for (const slug of SLUGS) {
      const tenant = await db.tenant.findUniqueOrThrow({
        where: { slug },
        select: { id: true },
      });
      expect(
        await db.raffle.count({
          where: { tenantId: tenant.id, estado: "ACTIVO" },
        }),
      ).toBe(1);
    }
  });

  // seed.raffles.003 — el tenant inexistente se OMITE sin crashear (orden de sembrado)
  it("omite (sin crashear) un tenant que no existe todavía", async () => {
    const res = await sembrarRafflesActivos({
      db,
      specs: [
        {
          tenantSlug: "test-raffle-no-existe",
          nombre: "Sorteo huérfano",
          premio: "n/a",
          fechaInicio: INICIO,
          fechaFin: FIN,
        },
      ],
    });

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      tenantSlug: "test-raffle-no-existe",
      tenantId: null,
      raffleId: null,
      raffleCreado: false,
      omitido: true,
    });
  });
});
