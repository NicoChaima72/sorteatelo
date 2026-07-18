import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";

/**
 * Tests del use case `getAccesoActual` con un `db` FAKE. Es lo que el layout del panel
 * consulta para decidir qué renderizar: las Tiendas del Organizador + si es Operador.
 * Aislamiento (F01, I1): solo surgen las Tiendas de la membresía (server-side), nunca
 * una Tienda a la que el usuario no pertenece. Devuelve `colorPrimario` para el swatch del
 * chip de tienda del chrome (admin-marca D7).
 */

interface TenantFake {
  id: string;
  nombre: string;
  slug: string;
  colorPrimario: string | null;
}

function fakeDb(tenants: TenantFake[]) {
  return {
    tenant: {
      findMany: async ({
        where,
        select,
      }: {
        where: { id: { in: string[] } };
        select?: Record<string, boolean>;
      }) =>
        tenants
          .filter((t) => where.id.in.includes(t.id))
          .map((t) => {
            // Proyecta SOLO los campos pedidos en `select` (como Prisma): así el test verifica
            // de verdad que el use case SELECCIONA `colorPrimario`, no solo que lo re-emite.
            const full: Record<string, unknown> = {
              id: t.id,
              nombre: t.nombre,
              slug: t.slug,
              colorPrimario: t.colorPrimario,
            };
            if (!select) return full;
            return Object.fromEntries(
              Object.keys(select)
                .filter((k) => select[k])
                .map((k) => [k, full[k]]),
            );
          }),
    },
  } as unknown as PrismaClient;
}

const TIENDAS: TenantFake[] = [
  { id: "A", nombre: "Tienda A", slug: "a", colorPrimario: "#7239d5" },
  { id: "B", nombre: "Tienda B", slug: "b", colorPrimario: null },
];

describe("domain/panel/getAccesoActual (fake db)", () => {
  // panel.acceso.001 — devuelve solo las Tiendas de la membresía del usuario, con su colorPrimario
  it("devuelve solo las Tiendas de la membresía del usuario, con esOperador y colorPrimario", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: { userId: "u1", esOperador: false, tenantIds: ["A"] },
    });
    expect(res.esOperador).toBe(false);
    expect(res.tenants).toEqual([
      { id: "A", nombre: "Tienda A", slug: "a", colorPrimario: "#7239d5" },
    ]);
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

  // panel.acceso.004 — colorPrimario viaja tal cual: con valor (hex) y con null (chip degrada a gris)
  it("incluye colorPrimario en cada tenant, con valor hex y con null", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: { userId: "op", esOperador: true, tenantIds: ["A", "B"] },
    });
    const a = res.tenants.find((t) => t.id === "A");
    const b = res.tenants.find((t) => t.id === "B");
    expect(a?.colorPrimario).toBe("#7239d5");
    expect(b?.colorPrimario).toBeNull();
  });
});
