import { type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { keyBasesSorteo } from "~/server/services/storagePublico";

/**
 * Interno del panel (admin-bases-pdf F01, D1/D2, ADR-0008/0013): resolución de la KEY del PDF de
 * BASES de un Sorteo + persistencia de su URL pública. Compartido por `crearUrlSubidaBases` y
 * `confirmarBasesSubidas` para que "qué sorteo, qué key, qué columna" viva en UN solo lugar
 * (espejo de `_imagenesMarca.ts`, que hace lo mismo para los assets de imagen).
 *
 * - **I6 (la key la computa el server)**: sale SIEMPRE de `keyBasesSorteo(tenantId, raffleId)` con el
 *   `tenantId` del acceso + el `raffleId` YA verificado como propio. El cliente jamás la elige.
 * - **I1/I2 (tenancy)**: el Raffle se carga scopeado por el `tenantId` server-side. Inexistente O de
 *   OTRA Tienda ⇒ `NOT_FOUND` indistinguible (sin fuga de existencia cross-tenant). Es el único
 *   vector cross-tenant de esta feature: un miembro del tenant A no puede presignar ni confirmar
 *   bases sobre un `raffleId` del tenant B.
 */

/**
 * Verifica que el sorteo sea de ESTA Tienda y devuelve la key de sus bases. El `tenantId` es
 * autoritativo (viene del acceso); el input solo referencia el sorteo por id.
 */
export async function resolverKeyBasesDeSorteo({
  db,
  tenantId,
  raffleId,
}: {
  db: PrismaClient;
  tenantId: string;
  raffleId: string;
}): Promise<string> {
  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, tenantId },
    select: { id: true },
  });
  if (!raffle) {
    throw new DomainError("NOT_FOUND", "El sorteo no existe en tu Tienda.");
  }
  return keyBasesSorteo(tenantId, raffle.id);
}

/**
 * Persiste la URL pública del PDF de bases en `Raffle.basesPdfUrl`. Usa `updateMany` con el
 * `tenantId` en el `where` (defensa en profundidad I1: no puede escribir un sorteo ajeno aunque el
 * id fuera de otra Tienda). Es el ÚNICO lugar que escribe esta columna (D2/I6) — ni el form de
 * crear/editar sorteo ni ninguna otra mutation la tocan.
 */
export async function persistirUrlBases({
  db,
  tenantId,
  raffleId,
  url,
}: {
  db: PrismaClient;
  tenantId: string;
  raffleId: string;
  url: string;
}): Promise<void> {
  await db.raffle.updateMany({
    where: { id: raffleId, tenantId },
    data: { basesPdfUrl: url },
  });
}
