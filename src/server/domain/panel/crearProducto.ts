import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type CrearProductoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05, actualizado por F03/D4): crea un producto en la Tienda del
 * Organizador. El `tenantId` sale del `acceso` resuelto server-side, NUNCA del input
 * (I1/ADR-0005): un producto no puede crearse "para otra Tienda" desde el cliente. El precio
 * se persiste como `Decimal` (I4).
 *
 * Nace **sin PDF** (`pdfPath: null` = pendiente) y **como borrador** (`activo: false`) —
 * fail-closed: sin PDF no hay venta (I7). La subida real del archivo la hacen después
 * `crearUrlSubidaPdf` + `confirmarPdfProducto` (presigned PUT a R2); recién ahí puede
 * activarse. El cliente ya no manda ningún `pdfPath` (murió el seam de texto de F05, I6).
 */
export async function crearProducto({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearProductoInput;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const producto = await db.product.create({
    data: {
      tenantId,
      titulo: input.titulo,
      descripcion: input.descripcion,
      precio: new Prisma.Decimal(input.precio), // CLP entero ⇒ Decimal (I4)
      pdfPath: null, // PDF pendiente; lo escribe solo confirmarPdfProducto (I6)
      portadaUrl: textoOpcionalANull(input.portadaUrl),
      participaEnSorteo: input.participaEnSorteo, // opt-in al sorteo (ADR-0012/D1)
      activo: false, // fail-closed: sin PDF no hay venta (I7)
    },
    select: { id: true },
  });

  return { id: producto.id };
}
