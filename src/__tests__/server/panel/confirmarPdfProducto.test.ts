import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { confirmarPdfProducto } from "~/server/domain/panel/confirmarPdfProducto";

/**
 * Tests del use case `confirmarPdfProducto` (F03/D4) con `db` FAKE + storage FAKE (headObject
 * simulado, sin R2). Clave: con el objeto PRESENTE (headObject true) persiste `pdfPath` = key
 * determinística; con el objeto AUSENTE ⇒ `INVALID` y NO persiste (pdfPath no-null ⇒ el archivo
 * realmente existe); producto ajeno/inexistente ⇒ `NOT_FOUND`. La key la computa el server (I6).
 */

function fakeDb(productos: { id: string; tenantId: string }[]) {
  let updateArgs: {
    where: { id: string; tenantId: string };
    data: Record<string, unknown>;
  } | null = null;
  const db = {
    product: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const p = productos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p ? { id: p.id } : null;
      },
      updateMany: async (args: {
        where: { id: string; tenantId: string };
        data: Record<string, unknown>;
      }) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  return { db, getUpdateArgs: () => updateArgs };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

describe("domain/panel/confirmarPdfProducto (fake db + fake storage)", () => {
  // panel.pdf.confirmar.001 — objeto presente ⇒ persiste pdfPath = key determinística
  it("con el objeto presente en el storage persiste pdfPath = `<tenantId>/<productId>.pdf`", async () => {
    const { db, getUpdateArgs } = fakeDb([{ id: "p1", tenantId: "A" }]);
    const headObject = vi
      .fn<(key: string) => Promise<boolean>>()
      .mockResolvedValue(true);

    const res = await confirmarPdfProducto({
      db,
      acceso: acceso(["A"]),
      input: { productId: "p1" },
      storage: { headObject },
    });

    expect(headObject).toHaveBeenCalledWith("A/p1.pdf"); // key computada server-side (I6)
    expect(res).toEqual({ confirmado: true, pdfPath: "A/p1.pdf" });
    const args = getUpdateArgs()!;
    expect(args.where).toEqual({ id: "p1", tenantId: "A" });
    expect(args.data.pdfPath).toBe("A/p1.pdf");
  });

  // panel.pdf.confirmar.002 — objeto ausente ⇒ INVALID y NO persiste
  it("con el objeto ausente (headObject false) ⇒ INVALID y NO persiste", async () => {
    const { db, getUpdateArgs } = fakeDb([{ id: "p1", tenantId: "A" }]);
    const headObject = vi
      .fn<(key: string) => Promise<boolean>>()
      .mockResolvedValue(false);

    await expect(
      confirmarPdfProducto({
        db,
        acceso: acceso(["A"]),
        input: { productId: "p1" },
        storage: { headObject },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getUpdateArgs()).toBeNull(); // no persistió nada
  });

  // panel.pdf.confirmar.003 — producto ajeno ⇒ NOT_FOUND (sin siquiera consultar el storage)
  it("un producto de OTRA Tienda ⇒ NOT_FOUND y NO consulta el storage", async () => {
    const { db, getUpdateArgs } = fakeDb([{ id: "pB", tenantId: "B" }]);
    const headObject = vi
      .fn<(key: string) => Promise<boolean>>()
      .mockResolvedValue(true);

    await expect(
      confirmarPdfProducto({
        db,
        acceso: acceso(["A"]),
        input: { productId: "pB" },
        storage: { headObject },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(headObject).not.toHaveBeenCalled();
    expect(getUpdateArgs()).toBeNull();
  });
});
