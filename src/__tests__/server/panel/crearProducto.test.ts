import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearProducto } from "~/server/domain/panel/crearProducto";

/**
 * Tests del use case `crearProducto` con `db` FAKE. Clave: el `tenantId` sale del `acceso`
 * resuelto server-side, NUNCA del input; el precio se persiste como `Decimal`. Actualizado
 * por F03/D4: el producto nace SIN PDF (`pdfPath: null`) y como BORRADOR (`activo: false`) —
 * fail-closed, sin PDF no hay venta (I7); el cliente ya no manda `pdfPath` (murió el seam).
 * Sin membresía ⇒ FORBIDDEN.
 */

function fakeDb() {
  let creado: Record<string, unknown> | null = null;
  const db = {
    product: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creado = data;
        return { id: "prod-nuevo", ...data };
      },
    },
  } as unknown as PrismaClient;
  return { db, getCreado: () => creado };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

describe("domain/panel/crearProducto (fake db, tenant-scoped)", () => {
  // panel.productos.crear.001 — persiste con el tenantId resuelto, precio Decimal, PDF pendiente, flag sorteo
  it("crea el producto con el tenantId resuelto server-side, precio Decimal, pdfPath null, activo false y participaEnSorteo del input", async () => {
    const { db, getCreado } = fakeDb();
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Nuevo libro",
        descripcion: "una descripción",
        precio: "3000",
        portadaUrl: "",
        participaEnSorteo: true,
      },
    });
    const data = getCreado()!;
    expect(data.tenantId).toBe("A"); // del acceso, NO del input
    expect(data.titulo).toBe("Nuevo libro");
    expect(Prisma.Decimal.isDecimal(data.precio)).toBe(true);
    expect((data.precio as Prisma.Decimal).toFixed(2)).toBe("3000.00");
    // F03/D4: nace SIN PDF y como borrador (fail-closed, I7).
    expect(data.pdfPath).toBeNull();
    expect(data.activo).toBe(false);
    // portadaUrl vacía ⇒ null (no string vacío)
    expect(data.portadaUrl).toBeNull();
    // ADR-0012/D1: el flag del sorteo se persiste tal cual del input.
    expect(data.participaEnSorteo).toBe(true);
  });

  // panel.productos.crear.002 — sin membresía ⇒ FORBIDDEN (no crea nada)
  it("sin membresía ⇒ FORBIDDEN y no crea nada", async () => {
    const { db, getCreado } = fakeDb();
    await expect(
      crearProducto({
        db,
        acceso: acceso([]),
        input: {
          titulo: "x",
          descripcion: "y",
          precio: "1000",
          portadaUrl: "",
          participaEnSorteo: false,
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCreado()).toBeNull();
  });
});
