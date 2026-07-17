import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";

/**
 * Tests del use case `getAccesoActual` con un `db` FAKE. Es lo que el layout del panel
 * consulta para decidir qué renderizar: las Tiendas del Organizador + si es Operador.
 * Aislamiento (F01, I1): solo surgen las Tiendas de la membresía (server-side), nunca
 * una Tienda a la que el usuario no pertenece.
 */

interface TenantFake {
  id: string;
  nombre: string;
  slug: string;
}

function fakeDb(tenants: TenantFake[]) {
  return {
    tenant: {
      findMany: async ({
        where,
      }: {
        where: { id: { in: string[] } };
      }) =>
        tenants
          .filter((t) => where.id.in.includes(t.id))
          .map((t) => ({ id: t.id, nombre: t.nombre, slug: t.slug })),
    },
  } as unknown as PrismaClient;
}

const TIENDAS: TenantFake[] = [
  { id: "A", nombre: "Tienda A", slug: "a" },
  { id: "B", nombre: "Tienda B", slug: "b" },
];

describe("domain/panel/getAccesoActual (fake db)", () => {
  // panel.acceso.001 — devuelve solo las Tiendas de la membresía del usuario
  it("devuelve solo las Tiendas de la membresía del usuario, con esOperador", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: { userId: "u1", esOperador: false, tenantIds: ["A"] },
    });
    expect(res.esOperador).toBe(false);
    expect(res.tenants).toEqual([{ id: "A", nombre: "Tienda A", slug: "a" }]);
    // la Tienda B (ajena a la membresía) JAMÁS aparece
    expect(res.tenants.some((t) => t.id === "B")).toBe(false);
  });

  // panel.acceso.002 — sin membresía devuelve lista vacía (empty state "sin tienda")
  it("sin membresía devuelve tenants vacío (el layout muestra el empty state)", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: { userId: "u2", esOperador: false, tenantIds: [] },
    });
    expect(res.tenants).toEqual([]);
    expect(res.esOperador).toBe(false);
  });

  // panel.acceso.003 — expone el flag Operador
  it("expone esOperador=true cuando el usuario es Operador de plataforma", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: { userId: "op", esOperador: true, tenantIds: ["A", "B"] },
    });
    expect(res.esOperador).toBe(true);
    expect(res.tenants).toHaveLength(2);
  });
});
