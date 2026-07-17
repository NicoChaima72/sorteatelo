import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type CrearProductoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05): crea un producto en la Tienda del Organizador. El `tenantId`
 * sale del `acceso` resuelto server-side, NUNCA del input (I1/ADR-0005): un producto no
 * puede crearse "para otra Tienda" desde el cliente. El precio se persiste como `Decimal`
 * (I4). `pdfPath` es el seam de F03 — texto por ahora; la subida real llega con F03 (I6).
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
      pdfPath: input.pdfPath,
      portadaUrl: textoOpcionalANull(input.portadaUrl),
      activo: true,
    },
    select: { id: true },
  });

  return { id: producto.id };
}
