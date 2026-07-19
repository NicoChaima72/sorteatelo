import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import { galeriaProps } from "~/lib/pagebuilder/widgets";
import {
  confirmarPageAsset,
  crearUrlSubidaPageAsset,
  crearUrlSubidaPageAssetInput,
  eliminarPageAsset,
  listarPageAssets,
  MAX_ASSETS_POR_TENANT,
  MAX_BYTES_PAGE_ASSET,
} from "~/server/domain/pagebuilder/pageAssets";
import { type StoragePublicoService } from "~/server/services/storagePublico";

/**
 * Tests del ciclo de vida de `PageAsset` (catálogo-v2 F08): la KEY se deriva server-side
 * (`<tenantId>/pagina/<assetId>`) jamás del input (I1/I6); límites D11 (allowlist + peso + cuota);
 * `confirm` verifica headObject antes de persistir; listar/eliminar tenant-scoped. `db`/`storage` fakes.
 */

interface AssetRow {
  id: string;
  tenantId: string;
  contentType: string;
  bytes: number;
  createdAt: Date;
}

function fakeDb(seed: AssetRow[] = []) {
  const rows = [...seed];
  const db = {
    pageAsset: {
      count: async ({ where }: { where: { tenantId: string } }) =>
        rows.filter((r) => r.tenantId === where.tenantId).length,
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        rows.filter((r) => r.tenantId === where.tenantId),
      create: async ({ data }: { data: AssetRow }) => {
        const row = { ...data, createdAt: data.createdAt ?? new Date() };
        rows.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { id: string; tenantId: string } }) => {
        const antes = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]!.id === where.id && rows[i]!.tenantId === where.tenantId) rows.splice(i, 1);
        }
        return { count: antes - rows.length };
      },
    },
  } as unknown as PrismaClient;
  return { db, rows };
}

/** Storage fake: registra las keys presignadas/borradas; `headObject` responde según un set de existentes. */
function fakeStorage(existentes = new Set<string>()) {
  const presignadas: { key: string; contentType: string }[] = [];
  const borradas: string[] = [];
  const storage = {
    presignarSubidaImagen: async ({ key, contentType }: { key: string; contentType: string }) => {
      presignadas.push({ key, contentType });
      return `https://r2.example/PUT/${key}`;
    },
    headObject: async (key: string) => existentes.has(key),
    urlPublica: (key: string) => `https://pub.r2.dev/${key}?v=1`,
    deleteObject: async (key: string) => {
      borradas.push(key);
    },
  } as unknown as StoragePublicoService;
  return { storage, presignadas, borradas };
}

describe("domain/pagebuilder/pageAssets — límites, key server-side, tenancy (F08)", () => {
  // page.asset.001 — la key se deriva server-side (<tenantId>/pagina/<assetId>), nunca del input
  it("crearUrl presigna una key <tenantId>/pagina/<assetId> derivada server-side", async () => {
    const { db } = fakeDb();
    const { storage, presignadas } = fakeStorage();
    const res = await crearUrlSubidaPageAsset({
      db,
      tenantId: "t-A",
      input: { contentType: "image/png", bytes: 1000 },
      storage,
    });
    expect(presignadas).toHaveLength(1);
    expect(presignadas[0]!.key).toBe(`t-A/pagina/${res.assetId}`);
    expect(res.assetId).toMatch(/^[0-9a-f-]{36}$/); // UUID minteado por el server
  });

  // page.asset.002 — content-type fuera de allowlist o peso sobre el máximo ⇒ rechazo en el input
  it("rechaza content-type fuera de la allowlist o peso sobre el máximo (antes de firmar)", () => {
    expect(crearUrlSubidaPageAssetInput.safeParse({ contentType: "image/gif", bytes: 1000 }).success).toBe(false);
    expect(crearUrlSubidaPageAssetInput.safeParse({ contentType: "application/pdf", bytes: 1000 }).success).toBe(false);
    expect(crearUrlSubidaPageAssetInput.safeParse({ contentType: "image/png", bytes: MAX_BYTES_PAGE_ASSET + 1 }).success).toBe(false);
    expect(crearUrlSubidaPageAssetInput.safeParse({ contentType: "image/png", bytes: 1000 }).success).toBe(true);
  });

  // page.asset.003 — cuota por tenant excedida ⇒ rechazo estructurado, sin presignar
  it("cuota por tenant excedida ⇒ INVALID sin presignar", async () => {
    const seed = Array.from({ length: MAX_ASSETS_POR_TENANT }, (_, i) => ({
      id: `a${i}`, tenantId: "t-A", contentType: "image/png", bytes: 10, createdAt: new Date(),
    }));
    const { db } = fakeDb(seed);
    const { storage, presignadas } = fakeStorage();
    await expect(
      crearUrlSubidaPageAsset({ db, tenantId: "t-A", input: { contentType: "image/png", bytes: 1000 }, storage }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(presignadas).toHaveLength(0);
    // Otro tenant NO está sobre cuota (aislamiento del count).
    const ok = await crearUrlSubidaPageAsset({ db, tenantId: "t-B", input: { contentType: "image/png", bytes: 1000 }, storage });
    expect(ok.assetId).toBeTruthy();
  });

  // page.asset.004 — confirm verifica headObject antes de persistir; ausente ⇒ INVALID sin fila
  it("confirm exige que el objeto exista (headObject) antes de persistir el PageAsset", async () => {
    const { db, rows } = fakeDb();
    const assetId = "550e8400-e29b-41d4-a716-446655440000";
    // Objeto NO subido ⇒ INVALID, sin fila.
    const { storage: sinObjeto } = fakeStorage(new Set());
    await expect(
      confirmarPageAsset({ db, tenantId: "t-A", input: { assetId, contentType: "image/png", bytes: 500 }, storage: sinObjeto }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(rows).toHaveLength(0);
    // Objeto subido ⇒ persiste y devuelve la URL pública.
    const { storage: conObjeto } = fakeStorage(new Set([`t-A/pagina/${assetId}`]));
    const res = await confirmarPageAsset({ db, tenantId: "t-A", input: { assetId, contentType: "image/png", bytes: 500 }, storage: conObjeto });
    expect(res.id).toBe(assetId);
    expect(res.url).toContain(`t-A/pagina/${assetId}`);
    expect(rows).toHaveLength(1);
    // Idempotente: confirmar de nuevo no duplica.
    await confirmarPageAsset({ db, tenantId: "t-A", input: { assetId, contentType: "image/png", bytes: 500 }, storage: conObjeto });
    expect(rows).toHaveLength(1);
  });

  // page.asset.005 — listar/eliminar tenant-scoped; eliminar de otro tenant ⇒ NOT_FOUND, sin borrar objeto
  it("listar y eliminar son tenant-scoped; un asset de otro tenant ⇒ NOT_FOUND", async () => {
    const { db } = fakeDb([
      { id: "a-A", tenantId: "t-A", contentType: "image/png", bytes: 10, createdAt: new Date() },
      { id: "a-B", tenantId: "t-B", contentType: "image/png", bytes: 10, createdAt: new Date() },
    ]);
    const { storage, borradas } = fakeStorage();
    const listaA = await listarPageAssets({ db, tenantId: "t-A", storage });
    expect(listaA.map((a) => a.id)).toEqual(["a-A"]);
    expect(listaA[0]!.url).toContain("t-A/pagina/a-A");

    // t-A intenta borrar el asset de t-B ⇒ NOT_FOUND, sin borrar el objeto.
    await expect(
      eliminarPageAsset({ db, tenantId: "t-A", input: { assetId: "a-B" }, storage }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(borradas).toHaveLength(0);

    // t-A borra el suyo ⇒ ok, borra el objeto.
    const res = await eliminarPageAsset({ db, tenantId: "t-A", input: { assetId: "a-A" }, storage });
    expect(res.eliminado).toBe(true);
    expect(borradas).toEqual(["t-A/pagina/a-A"]);
  });
});

describe("pagebuilder/widgets galeria (F08)", () => {
  // page.asset.galeria.001 — galeria: 2–24 items con url+alt, layouts del enum, .strict
  it("galeria valida 2–24 items con url+alt y layouts del enum", () => {
    const ok = {
      layout: "masonry",
      columnas: 4,
      items: [
        { url: "https://cdn.example/1.jpg", alt: "Una" },
        { url: "https://cdn.example/2.jpg", alt: "Dos", leyenda: "pie" },
      ],
    };
    expect(galeriaProps.safeParse(ok).success).toBe(true);
    // menos de 2 / más de 24 ⇒ rechazo
    expect(galeriaProps.safeParse({ items: [{ url: "https://cdn.example/1.jpg", alt: "x" }] }).success).toBe(false);
    expect(galeriaProps.safeParse({ items: Array(25).fill({ url: "https://cdn.example/1.jpg", alt: "x" }) }).success).toBe(false);
    // sin alt / url inválida ⇒ rechazo
    expect(galeriaProps.safeParse({ items: [{ url: "https://cdn.example/1.jpg" }, { url: "https://cdn.example/2.jpg", alt: "x" }] }).success).toBe(false);
    expect(galeriaProps.safeParse({ items: [{ url: "no-url", alt: "x" }, { url: "https://cdn.example/2.jpg", alt: "y" }] }).success).toBe(false);
    // layout / columnas fuera del enum ⇒ rechazo
    expect(galeriaProps.safeParse({ ...ok, layout: "mosaico" }).success).toBe(false);
    expect(galeriaProps.safeParse({ ...ok, columnas: 5 }).success).toBe(false);
    // campo extra ⇒ rechazo (.strict)
    expect(galeriaProps.safeParse({ ...ok, html: "<b>x</b>" }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "gal", tipo: "galeria", v: 1, props: ok }).success).toBe(true);
  });
});
