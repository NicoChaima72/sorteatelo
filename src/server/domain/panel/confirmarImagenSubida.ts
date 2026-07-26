import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import {
  persistirUrlImagen,
  resolverKeyDestinoImagen,
} from "~/server/domain/panel/_imagenesMarca";
import { DomainError } from "~/server/domain/errors";
import { type ConfirmarImagenSubidaInput } from "~/server/domain/panel/schemas";
import { type StoragePublicoService } from "~/server/services/storagePublico";

/**
 * Use case del panel (plantilla-rica F03/ADR-0013): confirma que un asset de marca quedó subido al
 * bucket público y persiste su URL pública en la columna del destino. Espeja `confirmarPdfProducto`
 * de F03. Es el ÚNICO lugar (junto con su helper) que escribe estas columnas de asset (D4/I6).
 * Reglas duras:
 *
 * - **I1 (tenancy)**: el `tenantId` sale del `acceso`; el recurso se carga scopeado por él.
 *   Inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible; la persistencia usa el `tenantId`
 *   en el `where` (defensa en profundidad).
 * - **Verificación real**: se comprueba con `headObject` que el objeto EXISTE en el bucket público
 *   antes de persistir. Si no está (el PUT no ocurrió / falló) ⇒ `INVALID` y NO se persiste nada.
 *   Así la columna nunca apunta a un objeto inexistente (mismo contrato que `confirmarPdfProducto`).
 * - **URL con cache-buster**: la URL pública la compone el service (`R2_PUBLIC_BASE_URL` + key +
 *   `?v=<timestamp>`, D2) — el `?v=` fuerza el refetch del CDN al re-subir sobre la misma key.
 *
 * El `storage` público se inyecta (cableado desde env en el borde del router).
 */
export async function confirmarImagenSubida({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ConfirmarImagenSubidaInput;
  storage: Pick<StoragePublicoService, "headObject" | "urlPublica">;
}): Promise<{ confirmado: true; url: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const key = await resolverKeyDestinoImagen({ db, tenantId, input });

  const existe = await storage.headObject(key);
  if (!existe) {
    throw new DomainError(
      "INVALID",
      "No encontramos la imagen subida. Vuelve a intentar la subida.",
    );
  }

  const url = storage.urlPublica(key);
  await persistirUrlImagen({ db, tenantId, input, url });

  return { confirmado: true, url };
}
