import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarProductosDelPanel } from "~/server/domain/panel/listarProductosDelPanel";

/**
 * Tests del use case `listarProductosDelPanel` con `db` FAKE. Aislamiento cross-tenant
 * (F01 checkbox 5 + F02): un Organizador de la Tienda A jamás ve productos de la Tienda B;
 * el listado del panel incluye TAMBIÉN los inactivos (a diferencia del catálogo del
 * storefront, que filtra `activo: true`). El `tenantId` sale de `acceso`, nunca del input.
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

const dec = (v: string) => new Prisma.Decimal(v);
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

const PRODUCTOS: ProductoFake[] = [
  { id: "pa1", tenantId: "A", titulo: "A activo", descripcion: "d", precio: dec("3000"), activo: true, participaEnSorteo: true, portadaUrl: null, pdfPath: "A/x.pdf", createdAt: new Date("2026-01-02") },
  { id: "pa2", tenantId: "A", titulo: "A inactivo", descripcion: "d", precio: dec("4000"), activo: false, participaEnSorteo: false, portadaUrl: null, pdfPath: "A/y.pdf", createdAt: new Date("2026-01-01") },
  { id: "pb1", tenantId: "B", titulo: "B activo", descripcion: "d", precio: dec("9999"), activo: true, participaEnSorteo: false, portadaUrl: null, pdfPath: "B/z.pdf", createdAt: new Date("2026-01-03") },
];

describe("domain/panel/listarProductosDelPanel (fake db, tenant-scoped)", () => {
  // panel.productos.listar.001 — solo productos del tenant autorizado, incluidos inactivos
  it("devuelve solo los productos del tenant autorizado, incluidos los inactivos", async () => {
    const res = await listarProductosDelPanel({ db: fakeDb(PRODUCTOS), acceso: acceso(["A"]) });
    expect(res.map((p) => p.id).sort()).toEqual(["pa1", "pa2"]);
    // el producto de la Tienda B JAMÁS aparece (aislamiento cross-tenant)
    expect(res.some((p) => p.id === "pb1")).toBe(false);
    // incluye el inactivo
    expect(res.some((p) => p.id === "pa2" && p.activo === false)).toBe(true);
    // precio viaja como string (nunca number en el server)
    expect(res.find((p) => p.id === "pa1")!.precio).toBe("3000");
    // el flag del sorteo viaja para que el form del panel lo hidrate (ADR-0012/D1)
    expect(res.find((p) => p.id === "pa1")!.participaEnSorteo).toBe(true);
    expect(res.find((p) => p.id === "pa2")!.participaEnSorteo).toBe(false);
  });

  // panel.productos.listar.002 — sin membresía ⇒ FORBIDDEN (fail-closed, nunca lista global)
  it("sin membresía y sin rol Operador ⇒ FORBIDDEN (no devuelve una lista global)", async () => {
    await expect(
      listarProductosDelPanel({ db: fakeDb(PRODUCTOS), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
