import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { inicioDiaUTC, restarDiasUTC } from "~/server/domain/panel/_fechas";

/** Ventana de comparación de los deltas: período actual (14d) vs los 14d previos. */
const DIAS = 14;

/** Delta de un KPI vs el período anterior: `pct` sin signo (string) + dirección. `null` = sin base. */
export interface DeltaKpi {
  pct: string;
  dir: "up" | "down";
}

/**
 * Delta porcentual `(actual - anterior) / anterior * 100`, computado con `Decimal` (I2). Sin base
 * de comparación (período anterior en cero) ⇒ `null`: no se inventa un "∞%" ni un delta engañoso.
 * El `pct` viaja como string sin signo; la dirección la lleva `dir` (la UI pinta el ícono).
 */
function calcularDelta(
  actual: Prisma.Decimal,
  anterior: Prisma.Decimal,
): DeltaKpi | null {
  if (anterior.isZero()) return null;
  const cambio = actual.minus(anterior).div(anterior).times(100);
  // Empate exacto (cambio === 0) cae en "up" por convención (no-negativo); es un borde inocuo
  // (0% con flecha de alza) — no amerita un tercer estado "neutral" en el tipo.
  return { pct: cambio.abs().toFixed(0), dir: cambio.isNegative() ? "down" : "up" };
}

/**
 * Use case del panel (F03): KPIs del dashboard de la Tienda + deltas de ventas/ingresos vs el
 * período anterior. Todos scopeados por el `tenantId` resuelto SERVER-SIDE desde `acceso`
 * (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`.
 *
 * Los ingresos se suman con `_sum` sobre la columna `Decimal` (I2) — aritmética de dinero en la
 * DB, nunca `number` en JS — y viajan como string. Los deltas comparan el período actual (14 días)
 * con el equivalente anterior (los 14 días previos), también con `Decimal`. Un tenant sin ventas
 * ⇒ ingresos "0" y deltas `null`. `ahora` es inyectable para tests deterministas.
 */
export async function getResumenTienda({
  db,
  acceso,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  ahora?: Date;
}): Promise<{
  ventasPagadas: number;
  ingresos: string;
  ordenesPendientes: number;
  productosActivos: number;
  deltas: { ventas: DeltaKpi | null; ingresos: DeltaKpi | null };
}> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  // Ventanas de los deltas (medianoche UTC, aritmética sin librería).
  const inicioActual = restarDiasUTC(inicioDiaUTC(ahora), DIAS - 1);
  const inicioAnterior = restarDiasUTC(inicioActual, DIAS);
  // La ventana ACTUAL no lleva cota superior `lt` a propósito: `ahora` es el presente, no hay
  // órdenes futuras que excluir (asimetría intencional con la ventana ANTERIOR, que sí cierra en
  // `lt: inicioActual` para no solapar).
  const pagadoActual = { tenantId, estado: "PAGADO" as const, createdAt: { gte: inicioActual } };
  const pagadoAnterior = {
    tenantId,
    estado: "PAGADO" as const,
    createdAt: { gte: inicioAnterior, lt: inicioActual },
  };

  const [
    ventasPagadas,
    ingresosAgg,
    ordenesPendientes,
    productosActivos,
    ventasActual,
    ventasAnterior,
    ingresosActualAgg,
    ingresosAnteriorAgg,
  ] = await Promise.all([
    db.order.count({ where: { tenantId, estado: "PAGADO" } }),
    db.order.aggregate({
      where: { tenantId, estado: "PAGADO" },
      _sum: { total: true },
    }),
    db.order.count({ where: { tenantId, estado: "PENDIENTE" } }),
    db.product.count({ where: { tenantId, activo: true } }),
    db.order.count({ where: pagadoActual }),
    db.order.count({ where: pagadoAnterior }),
    db.order.aggregate({ where: pagadoActual, _sum: { total: true } }),
    db.order.aggregate({ where: pagadoAnterior, _sum: { total: true } }),
  ]);

  const cero = new Prisma.Decimal(0);

  return {
    ventasPagadas,
    ingresos: (ingresosAgg._sum.total ?? cero).toFixed(0),
    ordenesPendientes,
    productosActivos,
    deltas: {
      ventas: calcularDelta(
        new Prisma.Decimal(ventasActual),
        new Prisma.Decimal(ventasAnterior),
      ),
      ingresos: calcularDelta(
        ingresosActualAgg._sum.total ?? cero,
        ingresosAnteriorAgg._sum.total ?? cero,
      ),
    },
  };
}
