import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { actualizarProducto } from "~/server/domain/panel/actualizarProducto";

/**
 * Tests del use case `actualizarProducto` con `db` FAKE. Clave (F02): el update se scopea
 * por el `tenantId` resuelto (`updateMany where { id, tenantId }`), así un producto de OTRA
 * Tienda ⇒ `NOT_FOUND` — indistinguible de "no existe" (sin fuga de existencia). Activar/
 * desactivar cambia `activo` (el catálogo del storefront filtra `activo: true` y deja de
 * listarlo). El `tenantId` sale del acceso, nunca del input.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
}

function fakeDb(productos: ProductoFake[]) {
  let updateArgs: {
    where: { id: string; tenantId: string };
    data: Record<string, unknown>;
  } | null = null;
  const db = {
    product: {
      updateMany: async (args: {
        where: { id: string; tenantId: string };
        data: Record<string, unknown>;
      }) => {
        updateArgs = args;
        const count = productos.filter(
          (p) => p.id === args.where.id && p.tenantId === args.where.tenantId,
        ).length;
        return { count };
      },
    },
  } as unknown as PrismaClient;
  return { db, getUpdateArgs: () => updateArgs };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

const inputBase = {
  titulo: "Editado",
  descripcion: "desc",
  precio: "5000",
  pdfPath: "A/x.pdf",
  portadaUrl: "",
  activo: true,
};

describe("domain/panel/actualizarProducto (fake db, tenant-scoped)", () => {
  // panel.productos.actualizar.001 — actualiza un producto propio (scoped por tenantId)
  it("actualiza un producto de la Tienda del Organizador, precio como Decimal", async () => {
    const { db, getUpdateArgs } = fakeDb([{ id: "p1", tenantId: "A" }]);
    const res = await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase },
    });
    expect(res.actualizado).toBe(true);
    const args = getUpdateArgs()!;
    expect(args.where).toEqual({ id: "p1", tenantId: "A" }); // scoping en el where
    expect(Prisma.Decimal.isDecimal(args.data.precio)).toBe(true);
    expect((args.data.precio as Prisma.Decimal).toFixed(2)).toBe("5000.00");
  });

  // panel.productos.actualizar.002 — producto de OTRO tenant ⇒ NOT_FOUND (sin fuga de existencia)
  it("un producto de OTRA Tienda ⇒ NOT_FOUND (indistinguible de inexistente)", async () => {
    // el producto existe pero en el tenant B; el Organizador opera el tenant A
    const { db } = fakeDb([{ id: "pB", tenantId: "B" }]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "pB", ...inputBase },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // panel.productos.actualizar.003 — desactivar cambia `activo` a false
  it("desactivar un producto escribe activo: false", async () => {
    const { db, getUpdateArgs } = fakeDb([{ id: "p1", tenantId: "A" }]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: false },
    });
    expect(getUpdateArgs()!.data.activo).toBe(false);
  });
});
