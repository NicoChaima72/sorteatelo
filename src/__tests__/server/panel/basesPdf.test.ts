import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { confirmarBasesSubidas } from "~/server/domain/panel/confirmarBasesSubidas";
import { crearUrlSubidaBases } from "~/server/domain/panel/crearUrlSubidaBases";

/**
 * Tests del destino `bases` del bucket PÚBLICO (admin-bases-pdf F01, D1/D2, ADR-0008/0013) con `db`
 * FAKE + storage público FAKE (sin R2). Es el ÚNICO PDF admitido en el bucket público (I1: jamás un
 * PDF de PRODUCTO). Claves:
 *  - la key la computa el server (I6): `<tenantId>/sorteo/<raffleId>/bases.pdf`, patrón `keyDePdfProducto`;
 *  - el Raffle se carga scopeado por el `tenantId` del acceso (I1/I2) ⇒ ajeno o inexistente ⇒
 *    `NOT_FOUND` indistinguible, y NO presigna;
 *  - `application/pdf` SOLO vale para este destino: los destinos de imagen lo rechazan.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

/** Fake db con raffles por tenant + captura de las escrituras. */
function fakeDb(seed: { raffles?: { id: string; tenantId: string }[] }) {
  const escrituras: Array<{ modelo: string; where: unknown; data: unknown }> = [];
  const db = {
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
  } as unknown as PrismaClient;
  return { db, escrituras };
}

function fakeStorage(overrides?: { headObject?: boolean; url?: string }) {
  const presignarSubidaBases = vi
    .fn<(input: { key: string; contentType: string }) => Promise<string>>()
    .mockResolvedValue("https://r2.example/put-bases");
  const headObject = vi
    .fn<(key: string) => Promise<boolean>>()
    .mockResolvedValue(overrides?.headObject ?? true);
  const urlPublica = vi
    .fn<(key: string) => string>()
    .mockImplementation((key) => overrides?.url ?? `https://pub.r2.dev/${key}?v=123`);
  return { presignarSubidaBases, headObject, urlPublica };
}

describe("domain/panel/crearUrlSubidaBases (fake db + fake storage público)", () => {
  // panel.bases.subir.001 — key per-tenant/per-raffle computada server-side, content-type PDF firmado
  it("sorteo propio + application/pdf ⇒ presigna `<tenantId>/sorteo/<raffleId>/bases.pdf` (I6)", async () => {
    const { db } = fakeDb({ raffles: [{ id: "r1", tenantId: "A" }] });
    const storage = fakeStorage();
    const res = await crearUrlSubidaBases({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1", contentType: "application/pdf" },
      storage,
    });
    expect(res.url).toBe("https://r2.example/put-bases");
    expect(storage.presignarSubidaBases).toHaveBeenCalledWith({
      key: "A/sorteo/r1/bases.pdf",
      contentType: "application/pdf",
    });
  });

  // panel.bases.subir.002 — sorteo de OTRA Tienda ⇒ NOT_FOUND, no presigna (I1/I2)
  it("sorteo de OTRA Tienda ⇒ NOT_FOUND y NO presigna", async () => {
    const { db } = fakeDb({ raffles: [{ id: "rB", tenantId: "B" }] });
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaBases({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "rB", contentType: "application/pdf" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.presignarSubidaBases).not.toHaveBeenCalled();
  });

  // panel.bases.subir.003 — sorteo inexistente ⇒ MISMA respuesta que uno ajeno (indistinguible)
  it("sorteo inexistente ⇒ NOT_FOUND (indistinguible de uno ajeno)", async () => {
    const { db } = fakeDb({ raffles: [] });
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaBases({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "no-existe", contentType: "application/pdf" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.presignarSubidaBases).not.toHaveBeenCalled();
  });

  // panel.bases.subir.004 — sin membresía ⇒ FORBIDDEN antes de tocar db/storage
  it("sin membresía ⇒ FORBIDDEN y no presigna", async () => {
    const { db } = fakeDb({ raffles: [{ id: "r1", tenantId: "A" }] });
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaBases({
        db,
        acceso: acceso([]),
        input: { raffleId: "r1", contentType: "application/pdf" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage.presignarSubidaBases).not.toHaveBeenCalled();
  });
});

describe("domain/panel/confirmarBasesSubidas (fake db + fake storage público)", () => {
  // panel.bases.confirmar.001 — objeto presente ⇒ compone URL pública y persiste Raffle.basesPdfUrl
  it("con el PDF presente ⇒ persiste la URL pública en Raffle.basesPdfUrl scopeado por tenant", async () => {
    const { db, escrituras } = fakeDb({ raffles: [{ id: "r1", tenantId: "A" }] });
    const storage = fakeStorage({
      headObject: true,
      url: "https://pub.r2.dev/A/sorteo/r1/bases.pdf?v=999",
    });
    const res = await confirmarBasesSubidas({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      storage,
    });
    expect(res).toMatchObject({
      confirmado: true,
      url: "https://pub.r2.dev/A/sorteo/r1/bases.pdf?v=999",
    });
    expect(storage.headObject).toHaveBeenCalledWith("A/sorteo/r1/bases.pdf");
    expect(escrituras).toEqual([
      {
        modelo: "raffle",
        where: { id: "r1", tenantId: "A" },
        data: { basesPdfUrl: "https://pub.r2.dev/A/sorteo/r1/bases.pdf?v=999" },
      },
    ]);
  });

  // panel.bases.confirmar.002 — headObject=false ⇒ INVALID y NO persiste (la columna nunca apunta a nada)
  it("con headObject=false ⇒ INVALID y NO escribe la columna", async () => {
    const { db, escrituras } = fakeDb({ raffles: [{ id: "r1", tenantId: "A" }] });
    const storage = fakeStorage({ headObject: false });
    await expect(
      confirmarBasesSubidas({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "r1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(storage.urlPublica).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });

  // panel.bases.confirmar.003 — sorteo de OTRA Tienda ⇒ NOT_FOUND antes de tocar storage/DB (I1/I2)
  it("sorteo de OTRA Tienda ⇒ NOT_FOUND, no toca el storage ni escribe", async () => {
    const { db, escrituras } = fakeDb({ raffles: [{ id: "rB", tenantId: "B" }] });
    const storage = fakeStorage();
    await expect(
      confirmarBasesSubidas({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "rB" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });
});
