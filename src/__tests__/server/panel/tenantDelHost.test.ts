import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { resolverTenantDelPanel, type AccesoPanel } from "~/server/authPolicy";
import { listarProductosDelPanel } from "~/server/domain/panel/listarProductosDelPanel";

/**
 * Tests del CABLEADO del tenant del HOST en los use cases del panel (admin-multi-tienda F03/D3,
 * ADR-0022) — con `listarProductosDelPanel` como use case representativo (el cambio en los ~20
 * restantes es idéntico y mecánico: todos resuelven por `resolverTenantDelPanel`).
 *
 * Lo que fijan: el panel opera SIEMPRE la Tienda del subdominio (server-authored), intersectada con
 * **la membresía y nada más**. Muere el fallback `tenantIds[0]` — el que hacía que, con más de una
 * membresía, se pudiera VER una tienda y OPERAR otra. Sin tienda en el host (apex, o host que no
 * resuelve) el panel no opera nada: FORBIDDEN, jamás "la primera que encuentre".
 *
 * D11 (2026-07-25): el rol **Operador de plataforma tampoco abre esta puerta**. `esOperador: true`
 * ya no selecciona tiendas ajenas en el panel de Organizador — es la red de seguridad de la capa de
 * datos que acompaña al guard de páginas (`guardAdmin.test.ts`). La política pura
 * `resolverTenantAutorizado` NO cambió (I2): sigue reconociendo al Operador; lo que cambió es que
 * `resolverTenantDelPanel` no le declara ese rol.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  activo: boolean;
  participaEnSorteo: boolean;
  portadaUrl: string | null;
  pdfPath: string;
  createdAt: Date;
}

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        productos.filter((p) => p.tenantId === where.tenantId),
    },
  } as unknown as PrismaClient;
}

const producto = (id: string, tenantId: string): ProductoFake => ({
  id,
  tenantId,
  titulo: `Producto ${id}`,
  descripcion: "d",
  precio: new Prisma.Decimal("3000"),
  activo: true,
  participaEnSorteo: false,
  portadaUrl: null,
  pdfPath: `${tenantId}/${id}.pdf`,
  createdAt: new Date("2026-01-01"),
});

const PRODUCTOS = [producto("p-a", "A"), producto("p-b", "B"), producto("p-c", "C")];

/** Usuario con DOS membresías: A es la más antigua (la que el viejo `tenantIds[0]` habría elegido). */
const dosMembresias = (over: Partial<AccesoPanel> = {}): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds: ["A", "B"],
  tenantIdDelHost: null,
  ...over,
});

describe("panel — el use case opera la Tienda del HOST (fake db)", () => {
  // panel.host.001 — con 2 membresías, manda el host (la segunda), no `tenantIds[0]`
  it("con dos membresías opera la tienda del host, no la primera de la lista", async () => {
    const res = await listarProductosDelPanel({
      db: fakeDb(PRODUCTOS),
      acceso: dosMembresias({ tenantIdDelHost: "B" }),
    });
    expect(res.map((p) => p.id)).toEqual(["p-b"]);
  });

  // panel.host.002 — host de tienda AJENA (no miembro, no Operador) ⇒ FORBIDDEN
  it("con el host de una tienda ajena tira FORBIDDEN", async () => {
    await expect(
      listarProductosDelPanel({
        db: fakeDb(PRODUCTOS),
        acceso: dosMembresias({ tenantIdDelHost: "C" }),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // panel.host.003 — D11: el Operador de plataforma con host ajeno TAMPOCO opera esa tienda. El
  // panel de Organizador es por membresía; su rol solo vale en su propio panel (`/admin/operador`).
  it("el Operador con el host de una tienda ajena tira FORBIDDEN, igual que cualquiera", async () => {
    await expect(
      listarProductosDelPanel({
        db: fakeDb(PRODUCTOS),
        acceso: dosMembresias({ esOperador: true, tenantIdDelHost: "C" }),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // …y sobre una tienda de la que SÍ es miembro opera con normalidad (no se rompió el caso bueno).
    const res = await listarProductosDelPanel({
      db: fakeDb(PRODUCTOS),
      acceso: dosMembresias({ esOperador: true, tenantIdDelHost: "B" }),
    });
    expect(res.map((p) => p.id)).toEqual(["p-b"]);
  });

  // panel.host.004 — sin tienda en el host (apex) ⇒ fail-closed: el fallback `tenantIds[0]` MURIÓ
  it("sin tienda en el host no cae a la primera membresía: FORBIDDEN", async () => {
    await expect(
      listarProductosDelPanel({
        db: fakeDb(PRODUCTOS),
        acceso: dosMembresias({ tenantIdDelHost: null }),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // …y tampoco para el Operador, que sin host no tiene tienda "por defecto".
    expect(() =>
      resolverTenantDelPanel(
        dosMembresias({ esOperador: true, tenantIdDelHost: null }),
      ),
    ).toThrowError();
  });
});
