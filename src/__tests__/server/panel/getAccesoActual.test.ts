import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";

/**
 * Tests del use case `getAccesoActual` con un `db` FAKE. Es lo que el layout del panel
 * consulta para decidir qué renderizar: las Tiendas del Organizador + si es Operador.
 * Aislamiento (F01, I1): solo surgen las Tiendas de la membresía (server-side), nunca
 * una Tienda a la que el usuario no pertenece. Devuelve `colorPrimario` para el swatch del
 * chip de tienda del chrome (admin-marca D7).
 *
 * ORDEN (admin-multi-tienda D5/I5, ADR-0022): el listado respeta el ORDEN CANÓNICO de las
 * membresías (`TenantMembership.createdAt asc, id asc`) que `panelProcedure` ya resolvió en
 * `acceso.tenantIds` — NO reordena por `nombre asc` (como hacía antes) ni deja el orden crudo
 * del `findMany`. Es la misma secuencia que usa el redirect del apex ⇒ la "primera tienda" a
 * la que se redirige es SIEMPRE la que encabeza el switcher.
 *
 * TIENDA ACTIVA (D11, 2026-07-25): es la del HOST **si está en la membresía**. El rol Operador de
 * plataforma dejó de ser excepción, así que nunca hay una tienda activa fuera de `tenants`.
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
          // El fake devuelve SIEMPRE por `nombre asc` — el orden viejo (y el que daría
          // cualquier `findMany` sin `orderBy` estable). Así, si el use case no reordena
          // por el orden canónico de `acceso.tenantIds`, el test de orden falla de verdad.
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
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
      acceso: {
        userId: "u1",
        esOperador: false,
        tenantIds: ["A"],
        tenantIdDelHost: "A",
      },
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
      acceso: {
        userId: "u2",
        esOperador: false,
        tenantIds: [],
        tenantIdDelHost: null,
      },
    });
    expect(res.tenants).toEqual([]);
    expect(res.esOperador).toBe(false);
  });

  // panel.acceso.003 — expone el flag Operador
  it("expone esOperador=true cuando el usuario es Operador de plataforma", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: {
        userId: "op",
        esOperador: true,
        tenantIds: ["A", "B"],
        tenantIdDelHost: "A",
      },
    });
    expect(res.esOperador).toBe(true);
    expect(res.tenants).toHaveLength(2);
  });

  // panel.acceso.005 — ORDEN CANÓNICO: el listado sale en el orden de `acceso.tenantIds`
  // (membresía createdAt asc, id asc), no en `nombre asc`.
  it("devuelve las tiendas en el ORDEN CANÓNICO de acceso.tenantIds, no por nombre", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      // Membresía más antigua = la "Tienda B" (alfabéticamente segunda): el orden canónico
      // la pone PRIMERA, y el redirect del apex la elegiría a ella.
      acceso: {
        userId: "u1",
        esOperador: false,
        tenantIds: ["B", "A"],
        tenantIdDelHost: "B",
      },
    });
    expect(res.tenants.map((t) => t.id)).toEqual(["B", "A"]);
  });

  // panel.acceso.004 — colorPrimario viaja tal cual: con valor (hex) y con null (chip degrada a gris)
  it("incluye colorPrimario en cada tenant, con valor hex y con null", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: {
        userId: "op",
        esOperador: true,
        tenantIds: ["A", "B"],
        tenantIdDelHost: "A",
      },
    });
    const a = res.tenants.find((t) => t.id === "A");
    const b = res.tenants.find((t) => t.id === "B");
    expect(a?.colorPrimario).toBe("#7239d5");
    expect(b?.colorPrimario).toBeNull();
  });

  // panel.acceso.006 — la TIENDA ACTIVA es la del HOST (lo que muestra el chip del chrome)
  it("la tienda activa es la del host, aunque no encabece el listado", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: {
        userId: "u1",
        esOperador: false,
        tenantIds: ["A", "B"],
        tenantIdDelHost: "B",
      },
    });
    expect(res.tiendaActiva).toEqual({
      id: "B",
      nombre: "Tienda B",
      slug: "b",
      colorPrimario: null,
    });
  });

  // panel.acceso.007 — D11: la tienda activa sale de la MEMBRESÍA. Un host ajeno no la enciende ni
  // para el Operador de plataforma: su rol dejó de abrir el panel de tiendas que no son suyas, así
  // que el chrome nunca muestra una tienda que el usuario no administra (ni filtra su nombre).
  it("un host fuera de la membresía no es tienda activa, ni siquiera para el Operador", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: {
        userId: "op",
        esOperador: true,
        tenantIds: [],
        tenantIdDelHost: "A",
      },
    });
    expect(res.tenants).toEqual([]); // no tiene membresías: el switcher no lista nada
    expect(res.tiendaActiva).toBeNull();
    expect(res.esOperador).toBe(true); // el rol sigue existiendo: habilita `/admin/operador`
  });

  // panel.acceso.008 — en el apex no hay tienda activa (la página es el alta / empty state)
  it("sin tienda en el host no hay tienda activa", async () => {
    const res = await getAccesoActual({
      db: fakeDb(TIENDAS),
      acceso: {
        userId: "op",
        esOperador: true,
        tenantIds: ["A"],
        tenantIdDelHost: null,
      },
    });
    expect(res.tiendaActiva).toBeNull();
  });
});
