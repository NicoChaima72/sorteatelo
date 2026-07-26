import { type PrismaClient, type ProductMode } from "@prisma/client";

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
  participaEnSorteo: boolean;
  modalidad: ProductMode;
  opcionesDePack: Array<{ id: string; unidades: number; precio: number }>;
  /**
   * Precio del pack ACTIVO más barato (el "desde $X" que se muestra mientras el Comprador no ha
   * elegido), o `null` si no es sobre / no tiene opciones. Se computa ACÁ y no en el cliente para
   * que "el más barato" signifique lo mismo que en la tarjeta del catálogo (`resolverCatalogo`) —
   * si no, el mismo número sale de dos caminos distintos y pueden divergir.
   */
  precioDesde: number | null;
}> {
  const producto = await db.product.findFirst({
    where: { id: input.id, tenantId, activo: true },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      precio: true,
      portadaUrl: true,
      participaEnSorteo: true,
      // F07 — el menú del sobre. Solo las ACTIVAS: una opción apagada no se ofrece (y el checkout
      // la rechaza igual, así que ni siquiera se puede forzar desde la consola).
      modalidad: true,
      packOptions: {
        where: { activo: true },
        // De la más chica a la más grande: es el orden en que se leen los precios y el que hace el
        // `@@unique([productId, unidades])` determinista, así que el selector no necesita `posicion`.
        orderBy: { unidades: "asc" },
        select: { id: true, unidades: true, precio: true },
      },
      // NO se expone el tamaño del pool ni los archivos: qué hay adentro del sobre es justamente lo
      // que no se muestra antes de comprar (D10), y el inventario de la Tienda no es del Comprador.
    },
  });

  if (!producto) {
    throw new DomainError("NOT_FOUND", "Producto no encontrado");
  }

  const opcionesDePack = producto.packOptions.map((o) => ({
    id: o.id,
    unidades: o.unidades,
    // Display-only, igual que `precio` (I4): el monto autoritativo es el `Decimal` que
    // `iniciarCheckout` lee de esta misma fila y congela en el `OrderItem`.
    precio: o.precio.toNumber(),
  }));

  return {
    id: producto.id,
    titulo: producto.titulo,
    descripcion: producto.descripcion,
    precio: producto.precio.toNumber(),
    portadaUrl: producto.portadaUrl,
    participaEnSorteo: producto.participaEnSorteo,
    modalidad: producto.modalidad,
    opcionesDePack,
    // El mínimo se ELIGE comparando los `Decimal` de la DB, no se calcula: `reduce` sobre las filas
    // y recién el ganador se cruza a número (I4). El menú viene ordenado por `unidades`, y el más
    // barato no tiene por qué ser el de menos unidades — un Organizador puede poner el pack grande
    // más barato que el chico.
    precioDesde:
      producto.packOptions
        .reduce<(typeof producto.packOptions)[number] | null>(
          (min, o) => (min === null || o.precio.lessThan(min.precio) ? o : min),
          null,
        )
        ?.precio.toNumber() ?? null,
  };
}
