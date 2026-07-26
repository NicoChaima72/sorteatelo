import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { getPagina } from "~/server/domain/pagebuilder/getPagina";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";

/**
 * Tests de los use cases DB del page builder (F04, ADR-0016) con `db` FAKE STATEFUL. Cubren: lock
 * optimista (expectedVersion), validación de referencias tenant-scoped (D6/I2, NOT_FOUND
 * indistinguible), publicación atómica draft→published, y lectura draft/published.
 */

const doc = () => documentoInicial({ heroTitulo: "Hola", heroSubtitulo: null, heroImageUrl: null });

// cuids válidos (z.string().cuid() exige `^c[^\s-]{8,}`): productos del tenant y uno ajeno.
const P1 = "cprod1aaaaaaaaaaaaaaaaaaaa";
const P2 = "cprod2aaaaaaaaaaaaaaaaaaaa";
const AJENO = "cajenoaaaaaaaaaaaaaaaaaaaa";

/** Fake stateful de una StorefrontPage + catálogo del tenant. */
function fakeDb(opts: {
  draftJson?: unknown;
  publishedJson?: unknown;
  version?: number;
  productosDelTenant?: string[];
}) {
  let version = opts.version ?? 1;
  let draftJson: unknown = opts.draftJson ?? doc();
  let publishedJson: unknown = opts.publishedJson ?? null;
  let publishedAt: Date | null = null;
  const productos = new Set(opts.productosDelTenant ?? []);
  const writes: { draftJson?: unknown; version?: unknown }[] = [];

  const storefrontPage = {
    findUnique: async () => ({ draftJson, publishedJson, version, publishedAt }),
    updateMany: async ({
      where,
      data,
    }: {
      where: { version: number };
      data: {
        draftJson?: unknown;
        version?: { increment: number };
        publishedJson?: unknown;
        publishedAt?: Date;
      };
    }) => {
      if (where.version !== version) return { count: 0 }; // lock: versión cambió ⇒ no escribe
      if (data.draftJson !== undefined) {
        // Camino mutación: escribe el borrador e incrementa version.
        draftJson = data.draftJson;
        version = version + (data.version?.increment ?? 0);
        writes.push({ draftJson: data.draftJson, version: data.version });
      } else if (data.publishedJson !== undefined) {
        // Camino publicación: escribe published (la version del borrador no cambia).
        publishedJson = data.publishedJson;
        publishedAt = data.publishedAt ?? null;
      }
      return { count: 1 };
    },
  };

  // Snapshots de publicación (F12).
  const versiones: { revision: number; documento: unknown; publishedBy: string | null }[] = [];
  const storefrontPageVersion = {
    findFirst: async () =>
      versiones.length ? { revision: Math.max(...versiones.map((v) => v.revision)) } : null,
    create: async ({ data }: { data: { revision: number; documento: unknown; publishedBy: string | null } }) => {
      versiones.push({ revision: data.revision, documento: data.documento, publishedBy: data.publishedBy });
      return { id: "ver" };
    },
  };

  const tx = { storefrontPage, storefrontPageVersion };
  const db = {
    storefrontPage,
    storefrontPageVersion,
    product: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => productos.has(id)).map((id) => ({ id })),
    },
    $transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return {
    db,
    getWrites: () => writes,
    getVersion: () => version,
    getPublished: () => publishedJson,
    getDraft: () => draftJson,
    getVersiones: () => versiones,
  };
}

describe("pagebuilder/getPagina", () => {
  // page.uc.001 — lee el borrador parseado + version; published null ⇒ NOT_FOUND si se pide published
  it("lee el borrador parseado con su version; pedir published sin publicar ⇒ NOT_FOUND", async () => {
    const { db } = fakeDb({ version: 4 });
    const res = await getPagina({ db, tenantId: "t1", cual: "draft" });
    expect(res.version).toBe(4);
    expect(res.documento.secciones.map((s) => s.tipo)).toEqual([
      "hero",
      "catalogo",
      "sorteo_vitrina",
      "como_funciona",
    ]);
    expect(res.publicado).toBe(false);
    await expect(
      getPagina({ db, tenantId: "t1", cual: "published" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("pagebuilder/aplicarMutacionPagina (lock + referencias)", () => {
  // page.uc.002 — expectedVersion desactualizada ⇒ CONFLICT SIN escribir
  it("con expectedVersion desactualizada ⇒ CONFLICT y no escribe", async () => {
    const { db, getWrites, getVersion } = fakeDb({ version: 5 });
    await expect(
      aplicarMutacionPagina({
        db,
        tenantId: "t1",
        mutacion: { accion: "remove_section", id: "sec-sorteo" },
        expectedVersion: 3, // stale
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getWrites()).toHaveLength(0);
    expect(getVersion()).toBe(5); // intacto
  });

  // page.uc.003 — con la version correcta ⇒ escribe e incrementa version
  it("con la expectedVersion correcta ⇒ escribe el borrador e incrementa version", async () => {
    const { db, getWrites, getVersion } = fakeDb({ version: 2 });
    const res = await aplicarMutacionPagina({
      db,
      tenantId: "t1",
      mutacion: { accion: "remove_section", id: "sec-sorteo" },
      expectedVersion: 2,
    });
    expect(getWrites()).toHaveLength(1);
    expect(getVersion()).toBe(3);
    expect(res.version).toBe(3);
    expect(res.documento.secciones.map((s) => s.id)).not.toContain("sec-sorteo");
  });

  // page.uc.004 — productoId de OTRO tenant ⇒ NOT_FOUND indistinguible, sin escribir (D6/I2/H1)
  it("rechaza un productoId ajeno con NOT_FOUND indistinguible del inexistente, sin escribir", async () => {
    const { db, getWrites } = fakeDb({ version: 1, productosDelTenant: [P1] });
    await expect(
      aplicarMutacionPagina({
        db,
        tenantId: "t1",
        mutacion: {
          accion: "add_section",
          tipo: "catalogo",
          props: { modo: "seleccion", productoIds: [P1, AJENO] },
        },
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getWrites()).toHaveLength(0);
  });

  it("acepta un catálogo seleccion con productoIds que SÍ son del tenant", async () => {
    const { db, getWrites } = fakeDb({ version: 1, productosDelTenant: [P1, P2] });
    const res = await aplicarMutacionPagina({
      db,
      tenantId: "t1",
      mutacion: {
        accion: "add_section",
        tipo: "catalogo",
        props: { modo: "seleccion", productoIds: [P1, P2] },
      },
      expectedVersion: 1,
    });
    expect(getWrites()).toHaveLength(1);
    expect(res.version).toBe(2);
  });

  // page.uc.005 — una mutación inválida (INVALID) no escribe nada
  it("una mutación inválida (INVALID) no muta ni escribe", async () => {
    const { db, getWrites } = fakeDb({ version: 1 });
    await expect(
      aplicarMutacionPagina({
        db,
        tenantId: "t1",
        mutacion: { accion: "add_section", tipo: "tipo_inexistente" },
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getWrites()).toHaveLength(0);
  });
});

describe("pagebuilder/publicarPagina (draft→published atómico)", () => {
  // page.uc.006 — publicar copia el borrador a published; guardar borrador NO tocaba published antes
  it("copia el borrador a published de forma atómica (published previo reemplazado solo al publicar) + snapshot", async () => {
    const { db, getPublished, getDraft, getVersiones } = fakeDb({ version: 3 });
    // Antes de publicar: published era null (guardar borrador no lo tocó).
    expect(getPublished()).toBeNull();
    const res = await publicarPagina({
      db,
      tenantId: "t1",
      expectedVersion: 3,
      publicadoPor: "duena@tienda.cl",
    });
    expect(res.publishedAt).toBeInstanceOf(Date);
    expect(res.revision).toBe(1); // primer snapshot
    // published quedó igual al borrador vigente.
    expect(getPublished()).toEqual(getDraft());
    // Se appendeó un snapshot (F12) con el documento publicado.
    expect(getVersiones()).toHaveLength(1);
    expect(getVersiones()[0]!.publishedBy).toBe("duena@tienda.cl");
  });

  // page.uc.007 — la revisión es monotónica: 2ª publicación ⇒ revision 2 (append-only)
  it("appendea revisiones monotónicas (no update/delete): 2ª publicación ⇒ revision 2", async () => {
    const { db, getVersiones } = fakeDb({ version: 1 });
    const r1 = await publicarPagina({ db, tenantId: "t1", expectedVersion: 1 });
    const r2 = await publicarPagina({ db, tenantId: "t1", expectedVersion: 1 });
    expect(r1.revision).toBe(1);
    expect(r2.revision).toBe(2);
    expect(getVersiones().map((v) => v.revision)).toEqual([1, 2]); // 2 filas, append-only
  });

  it("con expectedVersion desactualizada ⇒ CONFLICT y no publica", async () => {
    const { db, getPublished } = fakeDb({ version: 5 });
    await expect(
      publicarPagina({ db, tenantId: "t1", expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getPublished()).toBeNull();
  });
});
