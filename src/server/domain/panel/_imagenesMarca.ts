import { type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { type ConfirmarImagenSubidaInput } from "~/server/domain/panel/schemas";
import {
  keyLogoTenant,
  keyPortadaProducto,
  keyPremioSorteo,
} from "~/server/services/storagePublico";

/**
 * Interno del panel (plantilla-rica F03): resolución de KEY per-destino + persistencia de la URL
 * pública de un asset de marca. Compartido por `crearUrlSubidaImagen` y `confirmarImagenSubida`
 * para que la lógica de "qué recurso, qué key, qué columna" viva en UN solo lugar.
 *
 * - **I6 (la key la computa el server)**: la key sale SIEMPRE de los helpers de `storagePublico`
 *   con el `tenantId` del acceso + el id del recurso ya verificado. El cliente jamás la elige.
 * - **I1 (tenancy)**: para portada/premio, el recurso (producto/sorteo) se carga scopeado por el
 *   `tenantId` server-side. Inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible (sin fuga
 *   de existencia cross-tenant). `logo` no referencia un recurso: la key es del propio tenant.
 */

/**
 * Resuelve la key del bucket público del destino, validando la propiedad del recurso (I1). El
 * `tenantId` es autoritativo (viene del acceso); el input solo referencia el destino/recurso.
 */
export async function resolverKeyDestinoImagen({
  db,
  tenantId,
  input,
}: {
  db: PrismaClient;
  tenantId: string;
  input: ConfirmarImagenSubidaInput;
}): Promise<string> {
  switch (input.destino) {
    case "logo":
      return keyLogoTenant(tenantId);
    case "portada": {
      const producto = await db.product.findFirst({
        where: { id: input.productId, tenantId },
        select: { id: true },
      });
      if (!producto) {
        throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
      }
      return keyPortadaProducto(tenantId, producto.id);
    }
    case "premio": {
      const raffle = await db.raffle.findFirst({
        where: { id: input.raffleId, tenantId },
        select: { id: true },
      });
      if (!raffle) {
        throw new DomainError("NOT_FOUND", "El sorteo no existe en tu Tienda.");
      }
      return keyPremioSorteo(tenantId, raffle.id);
    }
  }
}

/**
 * Persiste la URL pública ya compuesta en la columna del destino. Para portada/premio usa
 * `updateMany` con el `tenantId` en el `where` (defensa en profundidad I1: no puede escribir un
 * recurso ajeno aunque el id fuera de otra Tienda). Para `logo`, el `tenantId` (del acceso) es
 * la clave. Es el ÚNICO lugar que escribe estas columnas de asset (D4/I6).
 */
export async function persistirUrlImagen({
  db,
  tenantId,
  input,
  url,
}: {
  db: PrismaClient;
  tenantId: string;
  input: ConfirmarImagenSubidaInput;
  url: string;
}): Promise<void> {
  switch (input.destino) {
    case "logo":
      await db.tenant.update({
        where: { id: tenantId },
        data: { logoUrl: url },
        select: { id: true },
      });
      return;
    case "portada":
      await db.product.updateMany({
        where: { id: input.productId, tenantId },
        data: { portadaUrl: url },
      });
      return;
    case "premio":
      await db.raffle.updateMany({
        where: { id: input.raffleId, tenantId },
        data: { premioImageUrl: url },
      });
      return;
  }
}
