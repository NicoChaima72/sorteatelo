import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type ActualizarProductoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05): edita un producto de la Tienda del Organizador (incluye
 * activar/desactivar vía `activo`). El scoping vive en el `where` del `updateMany`
 * (`{ id, tenantId }` con el `tenantId` resuelto server-side): un `id` de OTRA Tienda
 * matchea 0 filas ⇒ `NOT_FOUND` — el aislamiento cross-tenant es indistinguible de "no
 * existe", sin fuga de existencia (I1/ADR-0005). El precio se persiste como `Decimal` (I4).
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

  const { count } = await db.product.updateMany({
    where: { id: input.id, tenantId },
    data: {
      titulo: input.titulo,
      descripcion: input.descripcion,
      precio: new Prisma.Decimal(input.precio),
      pdfPath: input.pdfPath,
      portadaUrl: textoOpcionalANull(input.portadaUrl),
      activo: input.activo,
    },
  });

  if (count === 0) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  return { actualizado: true };
}
