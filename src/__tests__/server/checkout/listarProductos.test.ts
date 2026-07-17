import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { listarProductos } from "~/server/domain/checkout/listarProductos";

/**
 * Test del use case `listarProductos` (catálogo del STOREFRONT). Cierra la otra mitad de la
 * Validación F02 "activar/desactivar": el catálogo del comprador filtra `activo: true`, así
 * que un producto desactivado desde el panel deja de listarse. Complementa
 * `actualizarProducto.test.ts` (que verifica que desactivar escribe `activo: false`).
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  activo: boolean;
  createdAt: Date;
}

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; activo: boolean };
      }) =>
        productos.filter(
          (p) => p.tenantId === where.tenantId && p.activo === where.activo,
        ),
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);

describe("domain/checkout/listarProductos (storefront filtra activo:true)", () => {
  // checkout.listar.storefront.001 — el catálogo excluye productos inactivos
  it("no lista los productos desactivados (activo:false)", async () => {
    const db = fakeDb([
      { id: "act", tenantId: "A", titulo: "Activo", descripcion: "d", precio: dec("3000"), activo: true, createdAt: new Date() },
      { id: "inact", tenantId: "A", titulo: "Desactivado", descripcion: "d", precio: dec("3000"), activo: false, createdAt: new Date() },
    ]);
    const res = await listarProductos({ db, tenantId: "A" });
    expect(res.map((p) => p.id)).toEqual(["act"]);
    expect(res.some((p) => p.id === "inact")).toBe(false);
  });
});
