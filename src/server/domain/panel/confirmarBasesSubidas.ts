import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import {
  persistirUrlBases,
  resolverKeyBasesDeSorteo,
} from "~/server/domain/panel/_basesSorteo";
import { DomainError } from "~/server/domain/errors";
import { type ConfirmarBasesSubidasInput } from "~/server/domain/panel/schemas";
import { type StoragePublicoService } from "~/server/services/storagePublico";

/**
 * Use case del panel (admin-bases-pdf F01, D1/D2, ADR-0008/0013): confirma que el PDF de bases quedó
 * subido al bucket público y persiste su URL pública en `Raffle.basesPdfUrl`. Espeja
 * `confirmarImagenSubida`. Es el ÚNICO lugar (junto con su helper) que escribe esa columna (D2/I6).
 *
 * - **I1/I2 (tenancy)**: el `tenantId` sale del `acceso`; el Raffle se carga scopeado por él ⇒ ajeno
 *   o inexistente ⇒ `NOT_FOUND` indistinguible, ANTES de tocar el storage. La persistencia lleva el
 *   `tenantId` en el `where` (defensa en profundidad).
 * - **Verificación real**: `headObject` comprueba que el objeto EXISTE antes de persistir. Si no está
 *   (el PUT no ocurrió / falló) ⇒ `INVALID` y no se escribe nada — la columna jamás apunta a un
 *   objeto inexistente, que en esta feature además significaría "el gate de publicación cree que hay
 *   bases legales y no las hay" (ADR-0008).
 * - **URL con cache-buster**: la compone el service (`R2_PUBLIC_BASE_URL` + key + `?v=<timestamp>`);
 *   al reemplazar las bases se re-sube sobre la MISMA key y el `?v=` fuerza el refetch del CDN.
 */
export async function confirmarBasesSubidas({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ConfirmarBasesSubidasInput;
  storage: Pick<StoragePublicoService, "headObject" | "urlPublica">;
}): Promise<{ confirmado: true; url: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const key = await resolverKeyBasesDeSorteo({
    db,
    tenantId,
    raffleId: input.raffleId,
  });

  const existe = await storage.headObject(key);
  if (!existe) {
    throw new DomainError(
      "INVALID",
      "No encontramos el PDF de bases subido. Vuelve a intentar la subida.",
    );
  }

  const url = storage.urlPublica(key);
  await persistirUrlBases({ db, tenantId, raffleId: input.raffleId, url });

  return { confirmado: true, url };
}
