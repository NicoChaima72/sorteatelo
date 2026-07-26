import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type CrearUrlSubidaPdfInput } from "~/server/domain/panel/schemas";
import { keyDePdfProducto, type StorageService } from "~/server/services/storage";

/**
 * Use case del panel (F03/D4): genera una URL prefirmada PUT para que el cliente suba el PDF
 * de SU producto directamente a R2 (presigned PUT desde el browser, D2/S1 — los bytes no
 * pasan por el server). Reglas duras:
 *
 * - **I1 (tenancy)**: el `tenantId` sale del `acceso` resuelto server-side; el producto se
 *   carga scopeado por ese tenant. Un `productId` inexistente O de OTRA Tienda ⇒ `NOT_FOUND`
 *   indistinguible (sin fuga de existencia cross-tenant).
 * - **I6 (el cliente nunca elige la key)**: la key la computa el server con
 *   `keyDePdfProducto(tenantId, productId)`. El input solo referencia el producto por id.
 *
 * El `storage` se inyecta (service de `services/storage.ts`, cableado desde env en el borde
 * del router). El dominio no instancia el S3Client ni lee env (I5).
 */
export async function crearUrlSubidaPdf({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearUrlSubidaPdfInput;
  storage: Pick<StorageService, "presignarSubida">;
}): Promise<{ url: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const producto = await db.product.findFirst({
    where: { id: input.productId, tenantId },
    select: { id: true },
  });
  if (!producto) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  const key = keyDePdfProducto(tenantId, producto.id);
  const url = await storage.presignarSubida({ key });
  return { url };
}
