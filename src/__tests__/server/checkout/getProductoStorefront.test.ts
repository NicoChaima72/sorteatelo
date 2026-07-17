import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getProductoStorefront } from "~/server/domain/checkout/getProductoStorefront";

/**
 * Tests del use case `getProductoStorefront` (detalle de producto del STOREFRONT, F03). El
 * `tenantId` viene del contexto (subdominio), NUNCA del input (I1/ADR-0005): el `id` solo
 * SELECCIONA dentro de la Tienda. Un producto de otra Tienda / inactivo / inexistente ⇒
 * `NOT_FOUND` neutral (aislamiento por construcción, indistinguible de "no existe").
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  portadaUrl: string | null;
  activo: boolean;
}

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string; activo: boolean };
      }) =>
        productos.find(
          (p) =>
            p.id === where.id &&
            p.tenantId === where.tenantId &&
            p.activo === where.activo,
        ) ?? null,
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);
const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const producto = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p1",
  tenantId: TENANT_A,
  titulo: "Guía",
  descripcion: "una guía",
  precio: dec("3000"),
  portadaUrl: null,
  activo: true,
  ...over,
});

describe("domain/checkout/getProductoStorefront (fake db, tenant-scoped)", () => {
  // checkout.producto.storefront.001 — producto activo de la Tienda del contexto ⇒ devuelto (precio number)
  it("devuelve un producto activo de la Tienda del contexto, con precio como número entero (CLP)", async () => {
    const db = fakeDb([producto({ id: "p1", precio: dec("3000") })]);
    const res = await getProductoStorefront({
      db,
      tenantId: TENANT_A,
      input: { id: "p1" },
    });
    expect(res).toMatchObject({ id: "p1", titulo: "Guía", precio: 3000 });
    expect(typeof res.precio).toBe("number");
  });

  // checkout.producto.storefront.002 — producto de OTRA Tienda ⇒ NOT_FOUND (aislamiento)
  it("un producto de otra Tienda ⇒ NOT_FOUND (aislamiento cross-tenant)", async () => {
    const db = fakeDb([producto({ id: "pB", tenantId: TENANT_B })]);
    await expect(
      getProductoStorefront({ db, tenantId: TENANT_A, input: { id: "pB" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // checkout.producto.storefront.003 — producto inactivo ⇒ NOT_FOUND (no visible al comprador)
  it("un producto inactivo del propio tenant ⇒ NOT_FOUND", async () => {
    const db = fakeDb([producto({ id: "p1", activo: false })]);
    await expect(
      getProductoStorefront({ db, tenantId: TENANT_A, input: { id: "p1" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // checkout.producto.storefront.004 — inexistente ⇒ NOT_FOUND
  it("un producto inexistente ⇒ NOT_FOUND", async () => {
    const db = fakeDb([]);
    await expect(
      getProductoStorefront({ db, tenantId: TENANT_A, input: { id: "nope" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
