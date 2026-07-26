import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";
import {
  cargarMembresiasCanonicas,
  ORDEN_CANONICO_MEMBRESIAS,
} from "~/server/panel/membresias";

/**
 * Tests del ORDEN CANÓNICO de membresías (admin-multi-tienda F01/D5/I5, ADR-0022) con `db` FAKE.
 *
 * La regla que fijan: hay UN SOLO origen ordenado de "las tiendas de este usuario"
 * (`cargarMembresiasCanonicas`, `TenantMembership.createdAt asc, id asc`), y de ahí salen tanto la
 * PRIMERA tienda —a la que el apex `/admin` redirige— como el listado del switcher del panel. Antes
 * eran dos órdenes distintos (el chip por `nombre asc`, el server por el orden crudo del `findMany`)
 * y podían discrepar: se veía una tienda y se operaba otra.
 */

interface MembresiaFila {
  tenantId: string;
  createdAt: Date;
  id: string;
  tenant: { slug: string };
}

/** Fila de Tenant que devuelve el `findMany` de `getAccesoActual`. */
interface TenantFila {
  id: string;
  nombre: string;
  slug: string;
  colorPrimario: string | null;
}

/**
 * `db` fake que ORDENA de verdad según el `orderBy` recibido (solo los campos que el orden canónico
 * usa): así el test verifica el criterio real, no que se le haya pasado un objeto con cierta forma.
 * Sin `orderBy` devuelve el orden de inserción — el "orden crudo" que el bug tenía.
 */
function fakeDb(filas: MembresiaFila[]) {
  return {
    tenantMembership: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { userId: string };
        orderBy?: Array<Record<string, "asc" | "desc">>;
      }) => {
        const propias = filas.filter(() => where.userId === "u1");
        if (!orderBy) return propias;
        return [...propias].sort((a, b) => {
          for (const criterio of orderBy) {
            const [campo, dir] = Object.entries(criterio)[0]!;
            const va = campo === "createdAt" ? a.createdAt.getTime() : a.id;
            const vb = campo === "createdAt" ? b.createdAt.getTime() : b.id;
            if (va === vb) continue;
            const cmp = va < vb ? -1 : 1;
            return dir === "asc" ? cmp : -cmp;
          }
          return 0;
        });
      },
    },
  } as unknown as PrismaClient;
}

function fakeDbTenants(tenants: TenantFila[]) {
  return {
    tenant: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        // Devuelve en un orden AJENO al canónico (alfabético por nombre), como podría hacerlo la DB.
        tenants
          .filter((t) => where.id.in.includes(t.id))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    },
  } as unknown as PrismaClient;
}

/** Tres membresías donde la antigüedad NO coincide con el orden alfabético ni con el de inserción. */
const MEMBRESIAS: MembresiaFila[] = [
  {
    tenantId: "T-zeta",
    id: "m3",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    tenant: { slug: "zeta" },
  },
  {
    tenantId: "T-alfa",
    id: "m1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    tenant: { slug: "alfa" },
  },
  // Empate de `createdAt` con la anterior: desempata `id asc` (orden TOTAL).
  {
    tenantId: "T-beta",
    id: "m2",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    tenant: { slug: "beta" },
  },
];

describe("panel/membresias — orden canónico (fake db)", () => {
  // panel.orden.001 — el criterio canónico es antigüedad de membresía, con `id` de desempate
  it("carga las membresías por createdAt asc con id asc de desempate", async () => {
    const membresias = await cargarMembresiasCanonicas({
      db: fakeDb(MEMBRESIAS),
      userId: "u1",
    });
    expect(membresias.map((m) => m.slug)).toEqual(["alfa", "beta", "zeta"]);
    expect(ORDEN_CANONICO_MEMBRESIAS).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  // panel.orden.002 — un único origen ordenado: la primera tienda del redirect del apex ES la que
  // encabeza el listado del switcher
  it("la primera tienda del redirect del apex encabeza el listado del switcher", async () => {
    const membresias = await cargarMembresiasCanonicas({
      db: fakeDb(MEMBRESIAS),
      userId: "u1",
    });

    // (a) Destino del redirect del apex: la PRIMERA del orden canónico.
    const primera = membresias[0];

    // (b) Listado del switcher: `getAccesoActual` sobre los MISMOS tenantIds ya ordenados
    // (es lo que `panelProcedure` pone en `acceso.tenantIds`).
    const acceso = await getAccesoActual({
      db: fakeDbTenants([
        { id: "T-alfa", nombre: "Zapatería", slug: "alfa", colorPrimario: null },
        { id: "T-beta", nombre: "Almacén", slug: "beta", colorPrimario: null },
        { id: "T-zeta", nombre: "Bazar", slug: "zeta", colorPrimario: null },
      ]),
      acceso: {
        userId: "u1",
        esOperador: false,
        tenantIds: membresias.map((m) => m.tenantId),
        tenantIdDelHost: primera?.tenantId ?? null,
      },
    });

    expect(acceso.tenants[0]?.slug).toBe(primera?.slug);
    expect(acceso.tenants.map((t) => t.slug)).toEqual(
      membresias.map((m) => m.slug),
    );
  });
});
