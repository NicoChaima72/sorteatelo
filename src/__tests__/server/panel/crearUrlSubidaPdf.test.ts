import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearUrlSubidaPdf } from "~/server/domain/panel/crearUrlSubidaPdf";

/**
 * Tests del use case `crearUrlSubidaPdf` (F03/D4) con `db` FAKE + storage FAKE (sin R2). Clave:
 * la key la computa el server con `keyDePdfProducto(tenantId, productId)` — el cliente NUNCA la
 * elige (I6); el producto se carga scopeado por el `tenantId` del acceso (I1), así un producto
 * inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible.
 */

function fakeDb(productos: { id: string; tenantId: string }[]) {
  const db = {
    product: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const p = productos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p ? { id: p.id } : null;
      },
    },
  } as unknown as PrismaClient;
  return { db };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

describe("domain/panel/crearUrlSubidaPdf (fake db + fake storage)", () => {
  // panel.pdf.subir.001 — producto propio ⇒ URL PUT para la key determinística
  it("de un producto propio devuelve la URL PUT prefirmada para la key `<tenantId>/<productId>.pdf`", async () => {
    const { db } = fakeDb([{ id: "p1", tenantId: "A" }]);
    const presignarSubida = vi
      .fn<(input: { key: string }) => Promise<string>>()
      .mockResolvedValue("https://r2.example/put-url");

    const res = await crearUrlSubidaPdf({
      db,
      acceso: acceso(["A"]),
      input: { productId: "p1" },
      storage: { presignarSubida },
    });

    expect(res.url).toBe("https://r2.example/put-url");
    // la key la computó el server (I6): tenantId del acceso + productId
    expect(presignarSubida).toHaveBeenCalledWith({ key: "A/p1.pdf" });
  });

  // panel.pdf.subir.002 — producto de OTRA Tienda ⇒ NOT_FOUND (no presigna)
  it("un producto de OTRA Tienda ⇒ NOT_FOUND y NO presigna", async () => {
    const { db } = fakeDb([{ id: "pB", tenantId: "B" }]);
    const presignarSubida = vi
      .fn<(input: { key: string }) => Promise<string>>()
      .mockResolvedValue("no-deberia");

    await expect(
      crearUrlSubidaPdf({
        db,
        acceso: acceso(["A"]),
        input: { productId: "pB" },
        storage: { presignarSubida },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(presignarSubida).not.toHaveBeenCalled();
  });

  // panel.pdf.subir.003 — producto inexistente ⇒ NOT_FOUND (indistinguible del anterior)
  it("un producto inexistente ⇒ NOT_FOUND (misma respuesta que uno ajeno)", async () => {
    const { db } = fakeDb([]);
    const presignarSubida = vi
      .fn<(input: { key: string }) => Promise<string>>()
      .mockResolvedValue("no-deberia");

    await expect(
      crearUrlSubidaPdf({
        db,
        acceso: acceso(["A"]),
        input: { productId: "no-existe" },
        storage: { presignarSubida },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(presignarSubida).not.toHaveBeenCalled();
  });
});
