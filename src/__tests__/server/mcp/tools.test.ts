import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { ESQUEMAS_FONDO, PARES_TIPOGRAFICOS, PRESETS_ENTRADA } from "~/lib/pagebuilder/widgets";
import { verificarBearer } from "~/server/mcp/auth";
import {
  mcpGetPage,
  mcpListProducts,
  mcpListStyleOptions,
  mcpListVersions,
  mcpMutar,
  mcpPublishPage,
  mcpRollback,
  resolverTenantIdPorSlug,
} from "~/server/mcp/tools";

/**
 * Tests del Editor MCP (F06/PD5, ADR-0016): el gate Bearer, y que las tools direccionan por
 * `storeSlug` (resuelto SERVER-SIDE, jamás un `tenantId` crudo del cliente, I1) reusando los use
 * cases de F04. `db` FAKE STATEFUL. El borde HTTP (`route.ts`) solo cabla mcp-handler + auth.
 */

const doc = () => documentoInicial({ heroTitulo: "Hola", heroSubtitulo: null, heroImageUrl: null });
const dec = (v: string) => new Prisma.Decimal(v);

interface VersionFake {
  revision: number;
  documento: unknown;
  publishedBy: string | null;
  createdAt: Date;
}

function fakeDb(opts: {
  slugs?: Record<string, string>; // slug → tenantId
  version?: number;
  productos?: { id: string; tenantId: string; titulo: string; precio: Prisma.Decimal; activo: boolean; participaEnSorteo: boolean; createdAt: Date }[];
  versionesSeed?: VersionFake[];
}) {
  const slugs = opts.slugs ?? { autora: "t-autora" };
  let version = opts.version ?? 1;
  let draftJson: unknown = doc();
  let publishedJson: unknown = null;
  let publishedAt: Date | null = null;
  const productos = opts.productos ?? [];
  const writes: unknown[] = [];

  const storefrontPage = {
    findUnique: async () => ({ id: "page", draftJson, publishedJson, version, publishedAt }),
    updateMany: async ({ where, data }: { where: { version: number }; data: { draftJson?: unknown; version?: { increment: number }; publishedJson?: unknown; publishedAt?: Date } }) => {
      if (where.version !== version) return { count: 0 };
      if (data.draftJson !== undefined) {
        draftJson = data.draftJson;
        version += data.version?.increment ?? 0;
        writes.push(data.draftJson);
      } else if (data.publishedJson !== undefined) {
        publishedJson = data.publishedJson;
        publishedAt = data.publishedAt ?? null;
      }
      return { count: 1 };
    },
    update: async ({ data }: { data: { draftJson?: unknown; version?: { increment: number } } }) => {
      if (data.draftJson !== undefined) draftJson = data.draftJson;
      if (data.version?.increment) version += data.version.increment;
      return { version };
    },
  };

  const versiones: VersionFake[] = [...(opts.versionesSeed ?? [])];
  const storefrontPageVersion = {
    findFirst: async () =>
      versiones.length ? { revision: Math.max(...versiones.map((v) => v.revision)) } : null,
    create: async ({ data }: { data: VersionFake }) => {
      versiones.push(data);
      return { id: "v" };
    },
    findMany: async () =>
      [...versiones]
        .sort((a, b) => b.revision - a.revision)
        .map((v) => ({ revision: v.revision, publishedBy: v.publishedBy, createdAt: v.createdAt })),
    findUnique: async ({ where }: { where: { tenantId_slug_revision: { revision: number } } }) =>
      versiones.find((v) => v.revision === where.tenantId_slug_revision.revision) ?? null,
  };

  const db = {
    tenant: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        slugs[where.slug] ? { id: slugs[where.slug] } : null,
    },
    storefrontPage,
    storefrontPageVersion,
    product: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        productos
          .filter((p) => p.tenantId === where.tenantId)
          .map((p) => ({ id: p.id, titulo: p.titulo, precio: p.precio, activo: p.activo, participaEnSorteo: p.participaEnSorteo })),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ storefrontPage, storefrontPageVersion }),
  } as unknown as PrismaClient;

  return { db, getWrites: () => writes, getPublished: () => publishedJson, getVersion: () => version };
}

describe("mcp/auth — verificarBearer", () => {
  // mcp.auth.001 — token válido pasa; ausente/incorrecto/sin-configurar ⇒ falla (fail-closed)
  it("acepta solo el Bearer exacto; sin token configurado nadie entra", () => {
    expect(verificarBearer("Bearer secreto", "secreto")).toBe(true);
    expect(verificarBearer("Bearer malo", "secreto")).toBe(false);
    expect(verificarBearer(null, "secreto")).toBe(false);
    expect(verificarBearer("secreto", "secreto")).toBe(false); // sin prefijo "Bearer "
    expect(verificarBearer("Bearer loquesea", undefined)).toBe(false); // fail-closed
  });
});

describe("mcp/tools — direccionan por storeSlug y reusan los use cases de F04", () => {
  // mcp.tenant.001 — resuelve tenantId por slug (server-side); slug inexistente ⇒ NOT_FOUND
  it("resuelve el tenantId por storeSlug; slug inexistente ⇒ NOT_FOUND", async () => {
    const { db } = fakeDb({ slugs: { autora: "t-autora" } });
    expect(await resolverTenantIdPorSlug({ db, storeSlug: "autora" })).toBe("t-autora");
    await expect(
      resolverTenantIdPorSlug({ db, storeSlug: "no-existe" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // mcp.tools.001 — get_page resuelve por slug y devuelve outline + documento + version
  it("get_page devuelve outline + documento + version del tenant resuelto por slug", async () => {
    const { db } = fakeDb({ slugs: { autora: "t-autora" }, version: 7 });
    const res = await mcpGetPage({ db, storeSlug: "autora" });
    expect(res.version).toBe(7);
    expect(res.documento.secciones.map((s) => s.tipo)).toEqual([
      "hero",
      "catalogo",
      "sorteo_vitrina",
      "como_funciona",
    ]);
    expect(res.outline).toContain("0. hero");
  });

  // mcp.tools.002 — una mutación válida vía MCP escribe el borrador e incrementa version (reusa F04)
  it("una mutación válida escribe el borrador e incrementa version", async () => {
    const { db, getWrites, getVersion } = fakeDb({ slugs: { autora: "t-autora" }, version: 1 });
    const res = await mcpMutar({
      db,
      storeSlug: "autora",
      expectedVersion: 1,
      mutacion: { accion: "remove_section", id: "sec-sorteo" },
    });
    expect(getWrites()).toHaveLength(1);
    expect(getVersion()).toBe(2);
    expect(res.version).toBe(2);
    expect(res.outline).not.toContain("sorteo_vitrina");
  });

  // mcp.tools.003 — una mutación inválida ⇒ DomainError (INVALID) y el borrador NO cambia
  it("una mutación inválida ⇒ DomainError estructurado (INVALID) y el borrador no cambia", async () => {
    const { db, getWrites } = fakeDb({ slugs: { autora: "t-autora" }, version: 1 });
    await expect(
      mcpMutar({
        db,
        storeSlug: "autora",
        expectedVersion: 1,
        mutacion: { accion: "add_section", tipo: "widget_inexistente" },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getWrites()).toHaveLength(0);
  });

  // mcp.tools.004 — list_products es tenant-scoped por el slug resuelto
  it("list_products lista solo los productos del tenant resuelto por slug", async () => {
    const { db } = fakeDb({
      slugs: { autora: "t-autora" },
      productos: [
        { id: "p1", tenantId: "t-autora", titulo: "Propio", precio: dec("3000"), activo: true, participaEnSorteo: false, createdAt: new Date() },
        { id: "p2", tenantId: "otro", titulo: "Ajeno", precio: dec("5000"), activo: true, participaEnSorteo: false, createdAt: new Date() },
      ],
    });
    const res = await mcpListProducts({ db, storeSlug: "autora" });
    expect(res.map((p) => p.id)).toEqual(["p1"]);
    expect(res[0]!.precio).toBe(3000);
  });

  // mcp.tools.005 — publish_page publica el borrador del tenant resuelto por slug
  it("publish_page publica el borrador del tenant resuelto por slug", async () => {
    const { db, getPublished } = fakeDb({ slugs: { autora: "t-autora" }, version: 2 });
    expect(getPublished()).toBeNull();
    const res = await mcpPublishPage({ db, storeSlug: "autora", expectedVersion: 2 });
    expect(res.publishedAt).toBeInstanceOf(Date);
    expect(res.revision).toBe(1);
    expect(getPublished()).not.toBeNull();
  });

  // mcp.tools.006 — list_versions direcciona por slug y devuelve el historial desc (metadatos)
  it("list_versions devuelve el historial de revisiones del tenant resuelto por slug", async () => {
    const { db } = fakeDb({
      slugs: { autora: "t-autora" },
      versionesSeed: [
        { revision: 1, documento: doc(), publishedBy: "operador", createdAt: new Date(Date.UTC(2026, 6, 1)) },
        { revision: 2, documento: doc(), publishedBy: "operador", createdAt: new Date(Date.UTC(2026, 6, 2)) },
      ],
    });
    const res = await mcpListVersions({ db, storeSlug: "autora" });
    expect(res.map((v) => v.revision)).toEqual([2, 1]);
  });

  // mcp.tools.007 — rollback_page direcciona por slug, copia la revisión al borrador (no publica)
  it("rollback_page copia la revisión al borrador del tenant resuelto por slug", async () => {
    const { db, getPublished } = fakeDb({
      slugs: { autora: "t-autora" },
      version: 5,
      versionesSeed: [
        { revision: 1, documento: doc(), publishedBy: "operador", createdAt: new Date() },
      ],
    });
    const res = await mcpRollback({ db, storeSlug: "autora", revision: 1 });
    expect(res.version).toBe(6); // bump del lock
    expect(res.nota).toContain("Publicá");
    expect(getPublished()).toBeNull(); // NO tocó lo publicado (I6)
  });
});

describe("mcp/tools — paridad de estilo (F07): set_section_style / set_page_theme / list_style_options", () => {
  // mcp.style.001 — set_section_style delega en aplicarMutacionPagina: escribe el borrador (id de nodo),
  // respeta expectedVersion; estilo inválido ⇒ INVALID sin mutar.
  it("set_section_style escribe el estilo del nodo y rechaza un estilo inválido sin mutar", async () => {
    const { db, getVersion } = fakeDb({ slugs: { autora: "t-autora" }, version: 1 });
    const res = await mcpMutar({
      db,
      storeSlug: "autora",
      expectedVersion: 1,
      mutacion: { accion: "set_section_style", id: "sec-hero", estilo: { fondo: { tipo: "esquema", esquema: "marca" }, padY: "xl" } },
    });
    expect(getVersion()).toBe(2);
    expect(res.documento.secciones[0]).toMatchObject({ id: "sec-hero", estilo: { fondo: { esquema: "marca" } } });

    // Estilo inválido (esquema fuera del enum) ⇒ INVALID, sin escribir.
    const { db: db2, getWrites: getWrites2 } = fakeDb({ slugs: { autora: "t-autora" }, version: 1 });
    await expect(
      mcpMutar({
        db: db2,
        storeSlug: "autora",
        expectedVersion: 1,
        mutacion: { accion: "set_section_style", id: "sec-hero", estilo: { fondo: { tipo: "esquema", esquema: "no-existe" } } },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getWrites2()).toHaveLength(0);
  });

  // mcp.style.002 — set_page_theme escribe root.props validado; tema inválido ⇒ INVALID sin mutar
  it("set_page_theme escribe el tema (root.props) y rechaza un tema inválido sin mutar", async () => {
    const { db, getVersion } = fakeDb({ slugs: { autora: "t-autora" }, version: 1 });
    const res = await mcpMutar({
      db,
      storeSlug: "autora",
      expectedVersion: 1,
      mutacion: { accion: "set_page_theme", tema: { modo: "oscuro", tipografia: "editorial" } },
    });
    expect(getVersion()).toBe(2);
    expect(res.documento.root.props).toMatchObject({ modo: "oscuro", tipografia: "editorial" });

    const { db: db2, getWrites: getWrites2 } = fakeDb({ slugs: { autora: "t-autora" }, version: 1 });
    await expect(
      mcpMutar({
        db: db2,
        storeSlug: "autora",
        expectedVersion: 1,
        mutacion: { accion: "set_page_theme", tema: { modo: "morado" } },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getWrites2()).toHaveLength(0);
  });

  // mcp.style.003 — list_style_options devuelve TODOS los enums (derivados de la fuente única) con
  // descripción de una línea; no hay lista duplicada a mano.
  it("list_style_options espeja los enums de la fuente única con descripción por valor", () => {
    const opts = mcpListStyleOptions();
    // Los valores salen del enum de widgets.ts (fuente única), no de una lista a mano.
    expect(opts.estiloSeccion.fondoEsquema.map((o) => o.valor)).toEqual([...ESQUEMAS_FONDO]);
    expect(opts.estiloSeccion.entrada.map((o) => o.valor)).toEqual([...PRESETS_ENTRADA]);
    expect(opts.temaPagina.tipografia.map((o) => o.valor)).toEqual([...PARES_TIPOGRAFICOS]);
    expect(opts.temaPagina.fondoPagina.map((o) => o.valor)).toEqual([...ESQUEMAS_FONDO]);
    // Cada opción de cada dimensión tiene una descripción NO vacía (una línea).
    const dimensiones = [
      ...Object.values(opts.estiloSeccion),
      ...Object.values(opts.temaPagina),
    ];
    for (const dim of dimensiones) {
      for (const o of dim) {
        expect(o.descripcion.length, `descripción de "${o.valor}"`).toBeGreaterThan(0);
      }
    }
  });
});
