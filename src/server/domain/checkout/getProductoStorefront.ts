import { type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { type GetProductoStorefrontInput } from "~/server/domain/checkout/schemas";

/**
 * Use case de dominio: detalle de UN producto del catálogo de una Tienda para el Comprador (F03).
 *
 * `tenantId` viene del contexto (subdominio), NUNCA del input (I1/ADR-0005); el `id` solo
 * SELECCIONA dentro de ESA Tienda. Un producto de otra Tienda, inactivo o inexistente ⇒
 * `NOT_FOUND` — el aislamiento cross-tenant es indistinguible de "no existe" (respuesta neutral,
 * ADR-0007). El `precio` se devuelve como número entero (CLP, display-only para `Intl.NumberFormat`):
 * NO se hace aritmética de dinero con él (I4); el monto autoritativo es `Product.precio` (Decimal),
 * que `iniciarCheckout` congela como snapshot en el `OrderItem`.
 */
export async function getProductoStorefront({
  db,
  tenantId,
  input,
}: {
  db: PrismaClient;
  tenantId: string;
  input: GetProductoStorefrontInput;
}): Promise<{
  id: string;
  titulo: string;
  descripcion: string;
  precio: number;
  portadaUrl: string | null;
}> {
  const producto = await db.product.findFirst({
    where: { id: input.id, tenantId, activo: true },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      precio: true,
      portadaUrl: true,
    },
  });

  if (!producto) {
    throw new DomainError("NOT_FOUND", "Producto no encontrado");
  }

  return {
    id: producto.id,
    titulo: producto.titulo,
    descripcion: producto.descripcion,
    precio: producto.precio.toNumber(),
    portadaUrl: producto.portadaUrl,
  };
}
