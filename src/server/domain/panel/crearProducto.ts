import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { type CrearProductoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05, actualizado por F03/D4 y plantilla-rica): crea un producto en la Tienda
 * del Organizador. El `tenantId` sale del `acceso` resuelto server-side, NUNCA del input
 * (I1/ADR-0005): un producto no puede crearse "para otra Tienda" desde el cliente. El precio
 * se persiste como `Decimal` (I4).
 *
 * Nace **sin PDF** (`pdfPath: null` = pendiente), **sin portada** (`portadaUrl: null`) y **como
 * borrador** (`activo: false`) — fail-closed: sin PDF no hay venta (I7). La subida real del PDF la
 * hacen `crearUrlSubidaPdf` + `confirmarPdfProducto`; la de la PORTADA (asset público, plantilla-rica
 * D4/I6) la hacen `crearUrlSubidaImagen` + `confirmarImagenSubida`. El cliente ya no manda `pdfPath`
 * ni `portadaUrl` (murieron los seams de texto, I6).
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
  const tenantId = resolverTenantDelPanel(acceso);

  const producto = await db.product.create({
    data: {
      tenantId,
      titulo: input.titulo,
      descripcion: input.descripcion,
      precio: new Prisma.Decimal(input.precio), // CLP entero ⇒ Decimal (I4)
      pdfPath: null, // PDF pendiente; lo escribe solo confirmarPdfProducto (I6)
      // portadaUrl NO se setea acá: la escribe solo confirmarImagenSubida (asset público, D4/I6).
      participaEnSorteo: input.participaEnSorteo, // opt-in al sorteo (ADR-0012/D1)
      activo: false, // fail-closed: sin PDF no hay venta (I7)
    },
    select: { id: true },
  });

  return { id: producto.id };
}
