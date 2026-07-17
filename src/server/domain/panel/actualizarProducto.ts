import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type ActualizarProductoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05, actualizado por F03/D4): edita un producto de la Tienda del
 * Organizador (incluye activar/desactivar vía `activo`). El scoping vive en el `where` del
 * `updateMany` (`{ id, tenantId }` con el `tenantId` resuelto server-side): un `id` de OTRA
 * Tienda matchea 0 filas ⇒ `NOT_FOUND` — el aislamiento cross-tenant es indistinguible de
 * "no existe", sin fuga de existencia (I1/ADR-0005). El precio se persiste como `Decimal`
 * (I4). Ya NO recibe `pdfPath` del input (murió el seam de texto de F05, I6): la ruta la
 * escribe únicamente `confirmarPdfProducto`.
 *
 * Guard fail-closed (I7): no se puede **activar** (`activo: true`) un producto con `pdfPath`
 * null (PDF pendiente) ⇒ `INVALID`. Se verifica leyendo el producto scopeado por tenant
 * ANTES del update; si no existe en la Tienda ⇒ `NOT_FOUND` (mismo criterio de neutralidad).
 *
 * Desactivar (`activo: false`) hace que el catálogo del storefront —que filtra
 * `activo: true`— deje de listar el producto (las ventas ya hechas se conservan).
 */
export async function actualizarProducto({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ActualizarProductoInput;
}): Promise<{ actualizado: true }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  // Guard de activación (I7): activar exige PDF confirmado. Carga scopeada por tenant — un
  // id de otra Tienda no matchea ⇒ NOT_FOUND (indistinguible de inexistente).
  if (input.activo) {
    const producto = await db.product.findFirst({
      where: { id: input.id, tenantId },
      select: { pdfPath: true },
    });
    if (!producto) {
      throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
    }
    if (producto.pdfPath === null) {
      throw new DomainError(
        "INVALID",
        "No puedes poner a la venta un producto sin PDF. Sube el archivo primero.",
      );
    }
  }

  const { count } = await db.product.updateMany({
    where: { id: input.id, tenantId },
    data: {
      titulo: input.titulo,
      descripcion: input.descripcion,
      precio: new Prisma.Decimal(input.precio),
      portadaUrl: textoOpcionalANull(input.portadaUrl),
      participaEnSorteo: input.participaEnSorteo, // opt-in al sorteo (ADR-0012/D1)
      activo: input.activo,
    },
  });

  if (count === 0) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  return { actualizado: true };
}
