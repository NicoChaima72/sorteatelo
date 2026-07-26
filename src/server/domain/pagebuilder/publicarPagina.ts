import { type PrismaClient } from "@prisma/client";

import { parsearDocumento } from "~/lib/pagebuilder/migrate";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case de PUBLICACIÓN (F04, ADR-0016/I6). Copia el Borrador → Publicado de forma ATÓMICA
 * (`$transaction`, I10): el storefront público lee SOLO `publishedJson` (I5), así que hasta este
 * momento nada de lo editado en el borrador es visible. Publicar es acción HUMANA explícita (I6): no
 * hay flujo que publique implícitamente.
 *
 * `expectedVersion` opcional (lock del borrador): si se pasa y no coincide ⇒ `CONFLICT` (el borrador
 * cambió desde que se lo revisó). El borrador se revalida (`parsearDocumento`) antes de
 * publicar — defensa: nunca se publica un documento que no parsea. Guardar borrador NO toca published;
 * solo este use case lo hace.
 *
 * La escritura es CONDICIONAL por `version` (`updateMany where version=<version leída>`): aunque la
 * publicación no cambie la `version` del borrador, esto cierra la carrera lectura→escritura DENTRO de
 * la tx (una mutación concurrente que bumpee la version entre el `findUnique` y el `update` ⇒ 0 filas
 * ⇒ `CONFLICT`, no se publica un draft que ya no es el que se leyó). Consistente con `aplicarMutacionPagina`.
 */
export async function publicarPagina({
  db,
  tenantId,
  expectedVersion,
  publicadoPor,
  slug = "home",
}: {
  db: Pick<PrismaClient, "storefrontPage" | "storefrontPageVersion" | "$transaction">;
  tenantId: string;
  expectedVersion?: number;
  /** Email de quien publica (la Organizadora), para el snapshot de auditoría (F12). */
  publicadoPor?: string;
  slug?: string;
}): Promise<{ publishedAt: Date; version: number; revision: number }> {
  return db.$transaction(async (tx) => {
    const page = await tx.storefrontPage.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
      select: { draftJson: true, version: true },
    });
    if (!page) {
      throw new DomainError("NOT_FOUND", "La página no existe.");
    }
    if (expectedVersion !== undefined && page.version !== expectedVersion) {
      throw new DomainError(
        "CONFLICT",
        "El borrador cambió. Recargá antes de publicar.",
      );
    }

    // Defensa: el borrador debe parsear (siempre lo hace tras una mutación válida).
    const doc = parsearDocumento(page.draftJson);
    const publishedAt = new Date();
    // Condicional por la version leída: cierra la carrera lectura→escritura (I10).
    const res = await tx.storefrontPage.updateMany({
      where: { tenantId, slug, version: page.version },
      data: { publishedJson: doc, publishedAt },
    });
    if (res.count === 0) {
      throw new DomainError(
        "CONFLICT",
        "El borrador cambió durante la publicación. Recargá y reintentá.",
      );
    }

    // Snapshot APPEND-ONLY (F12): revisión monotónica por (tenantId, slug), dentro de la MISMA tx (I10).
    const ultima = await tx.storefrontPageVersion.findFirst({
      where: { tenantId, slug },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });
    const revision = (ultima?.revision ?? 0) + 1;
    await tx.storefrontPageVersion.create({
      data: { tenantId, slug, revision, documento: doc, publishedBy: publicadoPor ?? null },
    });

    return { publishedAt, version: page.version, revision };
  });
}
