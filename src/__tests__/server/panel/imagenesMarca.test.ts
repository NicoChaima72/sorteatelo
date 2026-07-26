import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { confirmarImagenSubida } from "~/server/domain/panel/confirmarImagenSubida";
import { crearUrlSubidaImagen } from "~/server/domain/panel/crearUrlSubidaImagen";

/**
 * Tests de la subida de assets de marca al bucket PÚBLICO (plantilla-rica F03/ADR-0013) con `db`
 * FAKE + storage público FAKE (sin R2). Claves:
 *  - la key la computa el server per-destino (I6): logo/hero por tenant, portada/premio por recurso;
 *  - el recurso (producto/sorteo) se carga scopeado por el `tenantId` del acceso (I1) ⇒ inexistente
 *    O de otra Tienda ⇒ `NOT_FOUND` indistinguible, y NO presigna/persiste;
 *  - `confirmarImagenSubida` verifica con `headObject` antes de persistir, y escribe la columna del
 *    destino correcto con la URL pública compuesta.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

/** Fake db con productos/raffles por tenant + captura de las escrituras (update/updateMany). */
function fakeDb(seed: {
  productos?: { id: string; tenantId: string }[];
  raffles?: { id: string; tenantId: string }[];
}) {
  const escrituras: Array<{ modelo: string; where: unknown; data: unknown }> = [];
  const db = {
    product: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const p = (seed.productos ?? []).find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p ? { id: p.id } : null;
      },
      updateMany: async (args: { where: unknown; data: unknown }) => {
        escrituras.push({ modelo: "product", ...args });
        return { count: 1 };
      },
    },
    raffle: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const r = (seed.raffles ?? []).find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return r ? { id: r.id } : null;
      },
      updateMany: async (args: { where: unknown; data: unknown }) => {
        escrituras.push({ modelo: "raffle", ...args });
        return { count: 1 };
      },
    },
    tenant: {
      update: async (args: { where: unknown; data: unknown }) => {
        escrituras.push({ modelo: "tenant", ...args });
        return { id: "t" };
      },
    },
  } as unknown as PrismaClient;
  return { db, escrituras };
}

function fakeStorage(overrides?: {
  headObject?: boolean;
  url?: string;
}) {
  const presignarSubidaImagen = vi
    .fn<
      (input: { key: string; contentType: string }) => Promise<string>
    >()
    .mockResolvedValue("https://r2.example/put-url");
  const headObject = vi
    .fn<(key: string) => Promise<boolean>>()
    .mockResolvedValue(overrides?.headObject ?? true);
  const urlPublica = vi
    .fn<(key: string) => string>()
    .mockImplementation((key) => overrides?.url ?? `https://pub.r2.dev/${key}?v=123`);
  return { presignarSubidaImagen, headObject, urlPublica };
}

describe("domain/panel/crearUrlSubidaImagen (fake db + fake storage público)", () => {
  // panel.imagen.subir.001 — logo: key del tenant, sin lookup de recurso, content-type firmado
  it("logo ⇒ presigna la key `<tenantId>/branding/logo` con el content-type declarado (I6)", async () => {
    const { db } = fakeDb({});
    const storage = fakeStorage();
    const res = await crearUrlSubidaImagen({
      db,
      acceso: acceso(["A"]),
      input: { destino: "logo", contentType: "image/png" },
      storage,
    });
    expect(res.url).toBe("https://r2.example/put-url");
    expect(storage.presignarSubidaImagen).toHaveBeenCalledWith({
      key: "A/branding/logo",
      contentType: "image/png",
    });
  });

  // panel.imagen.subir.002 — portada de producto propio ⇒ key per-recurso
  it("portada de un producto propio ⇒ presigna `<tenantId>/productos/<productId>/portada`", async () => {
    const { db } = fakeDb({ productos: [{ id: "p1", tenantId: "A" }] });
    const storage = fakeStorage();
    await crearUrlSubidaImagen({
      db,
      acceso: acceso(["A"]),
      input: { destino: "portada", productId: "p1", contentType: "image/webp" },
      storage,
    });
    expect(storage.presignarSubidaImagen).toHaveBeenCalledWith({
      key: "A/productos/p1/portada",
      contentType: "image/webp",
    });
  });

  // panel.imagen.subir.003 — portada de producto de OTRA Tienda ⇒ NOT_FOUND, no presigna (I1)
  it("portada de un producto de OTRA Tienda ⇒ NOT_FOUND y NO presigna", async () => {
    const { db } = fakeDb({ productos: [{ id: "pB", tenantId: "B" }] });
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaImagen({
        db,
        acceso: acceso(["A"]),
        input: { destino: "portada", productId: "pB", contentType: "image/png" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.presignarSubidaImagen).not.toHaveBeenCalled();
  });

  // panel.imagen.subir.004 — premio de un sorteo inexistente ⇒ NOT_FOUND (indistinguible)
  it("premio de un sorteo inexistente ⇒ NOT_FOUND (misma respuesta que uno ajeno)", async () => {
    const { db } = fakeDb({ raffles: [] });
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaImagen({
        db,
        acceso: acceso(["A"]),
        input: { destino: "premio", raffleId: "no-existe", contentType: "image/png" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.presignarSubidaImagen).not.toHaveBeenCalled();
  });

  // panel.imagen.subir.005 — sin membresía ⇒ FORBIDDEN, no presigna
  it("sin membresía ⇒ FORBIDDEN y no presigna", async () => {
    const { db } = fakeDb({});
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaImagen({
        db,
        acceso: acceso([]),
        input: { destino: "logo", contentType: "image/png" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage.presignarSubidaImagen).not.toHaveBeenCalled();
  });
});

describe("domain/panel/confirmarImagenSubida (fake db + fake storage público)", () => {
  // panel.imagen.confirmar.001 — logo presente ⇒ compone URL y persiste en Tenant.logoUrl
  // Reescrito de `hero` a `logo` (admin-bases-pdf F06/D7): el destino `hero` MURIÓ con la card «Tu
  // tienda» (la imagen del hero es del Documento y se sube desde el editor), pero el camino que este
  // test cubre —destino SIN recurso asociado ⇒ escribe una columna del propio Tenant— sigue vivo en
  // `logo`. Cobertura preservada, assertion movida al comportamiento nuevo.
  it("logo con objeto presente ⇒ persiste la URL pública en Tenant.logoUrl", async () => {
    const { db, escrituras } = fakeDb({});
    const storage = fakeStorage({
      headObject: true,
      url: "https://pub.r2.dev/A/branding/logo?v=999",
    });
    const res = await confirmarImagenSubida({
      db,
      acceso: acceso(["A"]),
      input: { destino: "logo" },
      storage,
    });
    expect(res).toMatchObject({
      confirmado: true,
      url: "https://pub.r2.dev/A/branding/logo?v=999",
    });
    expect(escrituras).toEqual([
      {
        modelo: "tenant",
        where: { id: "A" },
        data: { logoUrl: "https://pub.r2.dev/A/branding/logo?v=999" },
        select: { id: true },
      },
    ]);
  });

  // panel.imagen.confirmar.002 — headObject=false ⇒ INVALID y NO persiste
  it("con headObject=false ⇒ INVALID y NO escribe nada", async () => {
    const { db, escrituras } = fakeDb({ productos: [{ id: "p1", tenantId: "A" }] });
    const storage = fakeStorage({ headObject: false });
    await expect(
      confirmarImagenSubida({
        db,
        acceso: acceso(["A"]),
        input: { destino: "portada", productId: "p1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(storage.urlPublica).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });

  // panel.imagen.confirmar.003 — premio presente ⇒ persiste en Raffle.premioImageUrl (columna correcta)
  it("premio con objeto presente ⇒ persiste en Raffle.premioImageUrl scopeado por tenant", async () => {
    const { db, escrituras } = fakeDb({ raffles: [{ id: "r1", tenantId: "A" }] });
    const storage = fakeStorage({
      headObject: true,
      url: "https://pub.r2.dev/A/sorteo/r1/premio?v=1",
    });
    await confirmarImagenSubida({
      db,
      acceso: acceso(["A"]),
      input: { destino: "premio", raffleId: "r1" },
      storage,
    });
    expect(escrituras).toEqual([
      {
        modelo: "raffle",
        where: { id: "r1", tenantId: "A" },
        data: { premioImageUrl: "https://pub.r2.dev/A/sorteo/r1/premio?v=1" },
      },
    ]);
  });

  // panel.imagen.confirmar.004 — sorteo de otra Tienda ⇒ NOT_FOUND antes de headObject
  it("premio de un sorteo de OTRA Tienda ⇒ NOT_FOUND y no toca el storage ni escribe", async () => {
    const { db, escrituras } = fakeDb({ raffles: [{ id: "rB", tenantId: "B" }] });
    const storage = fakeStorage();
    await expect(
      confirmarImagenSubida({
        db,
        acceso: acceso(["A"]),
        input: { destino: "premio", raffleId: "rB" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });
});
