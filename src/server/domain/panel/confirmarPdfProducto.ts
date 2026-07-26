import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type ConfirmarPdfProductoInput } from "~/server/domain/panel/schemas";
import { keyDePdfProducto, type StorageService } from "~/server/services/storage";

/**
 * Use case del panel (F03/D4): confirma que el PDF de un producto quedó subido y persiste su
 * `pdfPath`. Es el ÚNICO lugar que escribe `pdfPath` (I6) — la key determinística, computada
 * server-side. Flujo: el cliente pidió la URL con `crearUrlSubidaPdf`, hizo el PUT, y ahora
 * confirma. Reglas duras:
 *
 * - **I1 (tenancy)**: el `tenantId` sale del `acceso`; el producto se carga scopeado por él.
 *   Un `productId` inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible.
 * - **Verificación real**: se comprueba con `headObject` que el objeto EXISTE en R2 antes de
 *   persistir. Si no está (el PUT no ocurrió / falló) ⇒ `INVALID` y NO se persiste nada. Así
 *   `pdfPath` no-null ⇒ el archivo realmente existe (no una promesa del cliente).
 *
 * El `storage` se inyecta (cableado desde env en el borde del router). No se auto-activa el
 * producto (S3): activarlo es acción explícita del Organizador (el form del panel la encadena).
 */
export async function confirmarPdfProducto({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ConfirmarPdfProductoInput;
  storage: Pick<StorageService, "headObject">;
}): Promise<{ confirmado: true; pdfPath: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const producto = await db.product.findFirst({
    where: { id: input.productId, tenantId },
    select: { id: true },
  });
  if (!producto) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  const key = keyDePdfProducto(tenantId, producto.id);
  const existe = await storage.headObject(key);
  if (!existe) {
    throw new DomainError(
      "INVALID",
      "No encontramos el PDF subido. Vuelve a intentar la subida.",
    );
  }

  await db.product.updateMany({
    where: { id: producto.id, tenantId },
    data: { pdfPath: key },
  });

  return { confirmado: true, pdfPath: key };
}
