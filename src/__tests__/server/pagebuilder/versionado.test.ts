import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { listarVersiones } from "~/server/domain/pagebuilder/listarVersiones";
import { revertirPagina } from "~/server/domain/pagebuilder/revertirPagina";

/**
 * Tests de snapshots + rollback (F12/D4, ADR-0016): `revertirPagina` copia una revisión vieja al
 * BORRADOR (no al publicado) y bumpea el lock; `listarVersiones` devuelve el historial desc. Fake db.
 */

const docV1 = () =>
  documentoInicial({ heroTitulo: "Versión 1", heroSubtitulo: null, heroImageUrl: null });
const docV2 = () =>
  documentoInicial({ heroTitulo: "Versión 2", heroSubtitulo: null, heroImageUrl: null });

function fakeDb(opts: {
  versiones: { revision: number; documento: unknown; publishedBy: string | null; createdAt: Date }[];
  pageVersion?: number;
  hayPage?: boolean;
}) {
  let draftJson: unknown = null;
  let version = opts.pageVersion ?? 5;

  const db = {
    storefrontPageVersion: {
      findUnique: async ({
        where,
      }: {
        where: { tenantId_slug_revision: { revision: number } };
      }) => opts.versiones.find((v) => v.revision === where.tenantId_slug_revision.revision) ?? null,
      // Emula el `select: { revision, publishedBy, createdAt }` del use case (sin `documento`).
      findMany: async () =>
        [...opts.versiones]
          .sort((a, b) => b.revision - a.revision)
          .map((v) => ({ revision: v.revision, publishedBy: v.publishedBy, createdAt: v.createdAt })),
    },
    storefrontPage: {
      findUnique: async () => (opts.hayPage === false ? null : { version }),
      update: async ({ data }: { data: { draftJson?: unknown; version?: { increment: number } } }) => {
        if (data.draftJson !== undefined) draftJson = data.draftJson;
        if (data.version?.increment) version += data.version.increment;
        return { version }; // el use case lee el version REAL post-increment (NIT-1)
      },
    },
  } as unknown as PrismaClient;

  return { db, getDraft: () => draftJson, getVersion: () => version };
}

describe("pagebuilder/revertirPagina (rollback al borrador)", () => {
  // page.ver.001 — copia la revisión vieja al BORRADOR (no al publicado) y bumpea el lock
  it("copia la revisión vieja al borrador y bumpea el version (exige re-publicar)", async () => {
    const { db, getDraft, getVersion } = fakeDb({
      versiones: [
        { revision: 1, documento: docV1(), publishedBy: "operador", createdAt: new Date() },
        { revision: 2, documento: docV2(), publishedBy: "operador", createdAt: new Date() },
      ],
      pageVersion: 5,
    });
    const res = await revertirPagina({ db, tenantId: "t1", revision: 1 });
    expect(res.version).toBe(6); // bump del lock (5→6)
    expect(getVersion()).toBe(6);
    // el borrador ahora es el documento de la revisión 1 (titulo es RichTexto — Tanda 3 F02).
    const draft = getDraft() as {
      secciones: { tipo: string; props: { titulo?: { children: { t: string }[] } } }[];
    };
    const hero = draft.secciones[0]!;
    expect(hero.props.titulo?.children.map((r) => r.t).join("")).toBe("Versión 1");
  });

  // page.ver.002 — una revisión inexistente ⇒ NOT_FOUND sin tocar el borrador
  it("una revisión inexistente ⇒ NOT_FOUND", async () => {
    const { db, getDraft } = fakeDb({ versiones: [], pageVersion: 3 });
    await expect(
      revertirPagina({ db, tenantId: "t1", revision: 99 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getDraft()).toBeNull(); // no tocó el borrador
  });
});

describe("pagebuilder/listarVersiones (historial)", () => {
  // page.ver.003 — lista el historial más reciente primero, solo metadatos
  it("devuelve el historial de revisiones desc con metadatos (sin el documento completo)", async () => {
    const { db } = fakeDb({
      versiones: [
        { revision: 1, documento: docV1(), publishedBy: "operador", createdAt: new Date(Date.UTC(2026, 6, 1)) },
        { revision: 2, documento: docV2(), publishedBy: null, createdAt: new Date(Date.UTC(2026, 6, 2)) },
      ],
    });
    const res = await listarVersiones({ db, tenantId: "t1" });
    expect(res.map((v) => v.revision)).toEqual([2, 1]); // desc
    expect(res[0]).not.toHaveProperty("documento"); // solo metadatos
  });
});
