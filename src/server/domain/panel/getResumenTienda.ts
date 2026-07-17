import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";

/**
 * Use case del panel (F03): KPIs del dashboard de la Tienda. Todos scopeados por el
 * `tenantId` resuelto SERVER-SIDE desde `acceso` (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`.
 *
 * Los ingresos se suman con `_sum` sobre la columna `Decimal` (I4) — aritmética de dinero
 * en la DB, nunca `number` en JS — y viajan como string. Un tenant sin ventas ⇒ "0".
 */
export async function getResumenTienda({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{
  ventasPagadas: number;
  ingresos: string;
  ordenesPendientes: number;
  productosActivos: number;
}> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const [ventasPagadas, ingresosAgg, ordenesPendientes, productosActivos] =
    await Promise.all([
      db.order.count({ where: { tenantId, estado: "PAGADO" } }),
      db.order.aggregate({
        where: { tenantId, estado: "PAGADO" },
        _sum: { total: true },
      }),
      db.order.count({ where: { tenantId, estado: "PENDIENTE" } }),
      db.product.count({ where: { tenantId, activo: true } }),
    ]);

  return {
    ventasPagadas,
    ingresos: (ingresosAgg._sum.total ?? new Prisma.Decimal(0)).toFixed(0),
    ordenesPendientes,
    productosActivos,
  };
}
