import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { actualizarProducto } from "~/server/domain/panel/actualizarProducto";

/**
 * Tests del use case `actualizarProducto` con `db` FAKE. Clave: el update se scopea por el
 * `tenantId` resuelto (`updateMany where { id, tenantId }`), así un producto de OTRA Tienda ⇒
 * `NOT_FOUND` — indistinguible de "no existe" (sin fuga de existencia). El `tenantId` sale del
 * acceso, nunca del input.
 *
 * Actualizado por F03/D4: (a) el input ya NO lleva `pdfPath` (murió el seam de texto de F05,
 * I6); (b) guard fail-closed (I7): activar (`activo: true`) un producto con `pdfPath` null ⇒
 * `INVALID`. El guard lee el producto (findFirst scopeado por tenant) ANTES del update.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  pdfPath: string | null;
}

function fakeDb(productos: ProductoFake[]) {
  let updateArgs: {
    where: { id: string; tenantId: string };
    data: Record<string, unknown>;
  } | null = null;
  const db = {
    product: {
      findFirst: async (args: {
        where: { id: string; tenantId: string };
      }) => {
        const p = productos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p ? { pdfPath: p.pdfPath } : null;
      },
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
  portadaUrl: "",
  activo: true,
  participaEnSorteo: true,
};

describe("domain/panel/actualizarProducto (fake db, tenant-scoped)", () => {
  // panel.productos.actualizar.001 — actualiza un producto propio (scoped por tenantId)
  it("actualiza un producto de la Tienda del Organizador, precio como Decimal, sin escribir pdfPath", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: "A/p1.pdf" },
    ]);
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
    // ADR-0012/D1: persiste el flag del sorteo tal cual del input.
    expect(args.data.participaEnSorteo).toBe(true);
    // F03/D4/I6: el update NO toca pdfPath (lo escribe solo confirmarPdfProducto).
    expect("pdfPath" in args.data).toBe(false);
  });

  // panel.productos.actualizar.002 — producto de OTRO tenant ⇒ NOT_FOUND (sin fuga de existencia)
  it("un producto de OTRA Tienda ⇒ NOT_FOUND (indistinguible de inexistente)", async () => {
    // el producto existe pero en el tenant B; el Organizador opera el tenant A
    const { db } = fakeDb([{ id: "pB", tenantId: "B", pdfPath: "B/pB.pdf" }]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "pB", ...inputBase },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // panel.productos.actualizar.003 — desactivar cambia `activo` a false (sin guard de PDF)
  it("desactivar un producto escribe activo: false (no exige PDF)", async () => {
    // producto sin PDF: desactivar debe funcionar igual (el guard es solo para activar).
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: null },
    ]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: false },
    });
    expect(getUpdateArgs()!.data.activo).toBe(false);
  });

  // panel.productos.actualizar.004 — activar sin PDF ⇒ INVALID (fail-closed, I7)
  it("activar (activo: true) un producto con pdfPath null ⇒ INVALID y NO actualiza", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: null },
    ]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "p1", ...inputBase, activo: true },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getUpdateArgs()).toBeNull(); // no llegó al update
  });
});
