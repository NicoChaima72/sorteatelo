import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { resolverKeyDestinoImagen } from "~/server/domain/panel/_imagenesMarca";
import { type CrearUrlSubidaImagenInput } from "~/server/domain/panel/schemas";
import { type StoragePublicoService } from "~/server/services/storagePublico";

/**
 * Use case del panel (plantilla-rica F03/ADR-0013): genera una URL prefirmada PUT para que el
 * Organizador suba un asset de marca (logo/hero/portada/premio) directamente al bucket PÚBLICO de
 * R2 (presigned PUT desde el browser — los bytes no pasan por el server). Espeja `crearUrlSubidaPdf`
 * de F03, generalizado a destinos de imagen. Reglas duras:
 *
 * - **I1 (tenancy)**: el `tenantId` sale del `acceso` resuelto server-side; el recurso (producto/
 *   sorteo, para portada/premio) se carga scopeado por él. Inexistente O de OTRA Tienda ⇒
 *   `NOT_FOUND` indistinguible.
 * - **I6 (el cliente nunca elige la key)**: la key la computa el server per-destino (`_imagenesMarca`).
 *   El input solo referencia el destino + el id del recurso + el Content-Type (allowlist D6).
 *
 * El `storage` público se inyecta (cableado desde env en el borde del router). El dominio no
 * instancia el S3Client ni lee env (I5).
 */
export async function crearUrlSubidaImagen({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearUrlSubidaImagenInput;
  storage: Pick<StoragePublicoService, "presignarSubidaImagen">;
}): Promise<{ url: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const key = await resolverKeyDestinoImagen({ db, tenantId, input });
  const url = await storage.presignarSubidaImagen({
    key,
    contentType: input.contentType,
  });
  return { url };
}
