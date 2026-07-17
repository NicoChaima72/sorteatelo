import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearProducto } from "~/server/domain/panel/crearProducto";

/**
 * Tests del use case `crearProducto` con `db` FAKE. Clave (F02): el `tenantId` sale del
 * `acceso` resuelto server-side, NUNCA del input; el precio se persiste como `Decimal`;
 * el `pdfPath` es el seam de F03 (texto). Sin membresía ⇒ FORBIDDEN.
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
  // panel.productos.crear.001 — persiste con el tenantId resuelto, precio Decimal, pdfPath seam
  it("crea el producto con el tenantId resuelto server-side, precio Decimal y pdfPath", async () => {
    const { db, getCreado } = fakeDb();
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Nuevo libro",
        descripcion: "una descripción",
        precio: "3000",
        pdfPath: "A/pendiente/nuevo-libro.pdf",
        portadaUrl: "",
      },
    });
    const data = getCreado()!;
    expect(data.tenantId).toBe("A"); // del acceso, NO del input
    expect(data.titulo).toBe("Nuevo libro");
    expect(Prisma.Decimal.isDecimal(data.precio)).toBe(true);
    expect((data.precio as Prisma.Decimal).toFixed(2)).toBe("3000.00");
    expect(data.pdfPath).toBe("A/pendiente/nuevo-libro.pdf");
    expect(data.activo).toBe(true);
    // portadaUrl vacía ⇒ null (no string vacío)
    expect(data.portadaUrl).toBeNull();
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
          pdfPath: "x.pdf",
          portadaUrl: "",
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCreado()).toBeNull();
  });
});
