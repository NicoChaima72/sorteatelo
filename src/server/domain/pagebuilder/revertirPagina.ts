import { type PrismaClient } from "@prisma/client";

import { parsearDocumento } from "~/lib/pagebuilder/migrate";
import { type PageDocument } from "~/lib/pagebuilder/schema";
import { DomainError } from "~/server/domain/errors";

/**
 * ROLLBACK del page builder (F12/D4, ADR-0016): copia el Documento de una `revision` publicada vieja
 * al BORRADOR (no al publicado). La Organizadora la revisa y RE-PUBLICA (D4) — publicar sigue siendo acción
 * humana explícita (I6): revertir NO cambia lo que ven los visitantes hasta que se publique de nuevo.
 *
 * Tenancy (I1): `tenantId` resuelto server-side; la revisión se busca por `(tenantId, slug, revision)`.
 * Bumpea el `version` del borrador (lock optimista): invalida cualquier expectedVersion pendiente de
 * un editor que tuviera el draft anterior cargado (I10). El snapshot se revalida antes de escribir.
 */
export async function revertirPagina({
  db,
  tenantId,
  revision,
  slug = "home",
}: {
  db: Pick<PrismaClient, "storefrontPage" | "storefrontPageVersion">;
  tenantId: string;
  revision: number;
  slug?: string;
}): Promise<{ documento: PageDocument; version: number }> {
  const snapshot = await db.storefrontPageVersion.findUnique({
    where: { tenantId_slug_revision: { tenantId, slug, revision } },
    select: { documento: true },
  });
  if (!snapshot) {
    throw new DomainError("NOT_FOUND", `No existe la revisión ${revision}.`);
  }

  const page = await db.storefrontPage.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
    select: { id: true },
  });
  if (!page) {
    throw new DomainError("NOT_FOUND", "La página no existe.");
  }

  // Revalida el snapshot (defensa: siempre parsea, se guardó ya válido) y lo copia al BORRADOR.
  const doc = parsearDocumento(snapshot.documento);
  // Bump INCONDICIONAL del lock (EXCEPCIÓN intencional a I10, NIT-2): el rollback es un override de
  // quien edita, que invalida cualquier expectedVersion pendiente. Se captura el `version` REAL grabado
  // (el `increment` es atómico en SQL) para no reportar un valor stale si hubo edición concurrente.
  const actualizada = await db.storefrontPage.update({
    where: { tenantId_slug: { tenantId, slug } },
    data: { draftJson: doc, version: { increment: 1 } },
    select: { version: true },
  });

  return { documento: doc, version: actualizada.version };
}
