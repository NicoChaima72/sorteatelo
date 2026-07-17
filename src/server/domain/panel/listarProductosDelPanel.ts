import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";

/**
 * Use case del panel (F05): lista los productos de la Tienda del Organizador — TODOS,
 * incluidos los inactivos (a diferencia del catálogo del storefront, que filtra
 * `activo: true`). El `tenantId` se resuelve SERVER-SIDE desde `acceso` (membresía / flag
 * Operador), nunca del input (I1/ADR-0005). Sin membresía ⇒ `FORBIDDEN` (fail-closed).
 *
 * El `precio` se devuelve como string entero CLP (display-only): el monto autoritativo es
 * `Product.precio` (Decimal); acá se cruza solo en el borde de presentación (nunca aritmética).
 */
export async function listarProductosDelPanel({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<
  Array<{
    id: string;
    titulo: string;
    descripcion: string;
    precio: string;
    activo: boolean;
    participaEnSorteo: boolean; // ADR-0012/D1 — el form del panel lo hidrata
    portadaUrl: string | null;
    pdfPath: string | null; // null = PDF pendiente (F03/D4)
    createdAt: Date;
  }>
> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const productos = await db.product.findMany({
    where: { tenantId },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      precio: true,
      activo: true,
      participaEnSorteo: true,
      portadaUrl: true,
      pdfPath: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return productos.map((p) => ({
    ...p,
    precio: p.precio.toFixed(0), // CLP entero, string (nunca number en el server)
  }));
}
