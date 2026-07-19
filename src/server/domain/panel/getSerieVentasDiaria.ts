import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import {
  claveDiaUTC,
  inicioDiaUTC,
  restarDiasUTC,
} from "~/server/domain/panel/_fechas";

/** Ventana del gráfico del dashboard: hoy + los 13 días previos. */
const DIAS = 14;

export interface PuntoSerieVentas {
  /** Medianoche UTC del día (la UI la formatea con `~/lib/formato`). */
  fecha: Date;
  /** Nº de órdenes PAGADO ese día. */
  ventas: number;
  /** Suma `Decimal` de `total` de las órdenes PAGADO del día, como string (nunca `number`). */
  ingresos: string;
}

/**
 * Use case del panel (F03): serie diaria de ventas de los últimos 14 días para el gráfico del
 * dashboard. Scopeada por el `tenantId` resuelto SERVER-SIDE desde `acceso` (I1/ADR-0005); sin
 * membresía ⇒ `FORBIDDEN`. Cuenta las órdenes `PAGADO` por día y suma su `total` con `Decimal`
 * en JS server-side (I2) — los ingresos viajan como string. Los días sin ventas van en cero.
 *
 * La ventana se ancla a `ahora` (inyectable para tests deterministas; default el reloj real) y a
 * la medianoche UTC (aritmética sin librería, `_fechas.ts`). Devuelve 14 puntos en orden ascendente.
 */
export async function getSerieVentasDiaria({
  db,
  acceso,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  ahora?: Date;
}): Promise<PuntoSerieVentas[]> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const inicioHoy = inicioDiaUTC(ahora);
  const inicio = restarDiasUTC(inicioHoy, DIAS - 1);

  // Sin cota superior `lt`: `ahora` es el presente y no hay órdenes futuras que excluir.
  const rows = await db.order.findMany({
    where: { tenantId, estado: "PAGADO", createdAt: { gte: inicio } },
    select: { createdAt: true, total: true },
  });

  // Bucket por día UTC: conteo + suma Decimal.
  const buckets = new Map<string, { ventas: number; ingresos: Prisma.Decimal }>();
  for (const r of rows) {
    const clave = claveDiaUTC(r.createdAt);
    const b = buckets.get(clave) ?? {
      ventas: 0,
      ingresos: new Prisma.Decimal(0),
    };
    b.ventas += 1;
    b.ingresos = b.ingresos.plus(r.total);
    buckets.set(clave, b);
  }

  // Emite los 14 días en orden ascendente; los días sin órdenes quedan en cero.
  const serie: PuntoSerieVentas[] = [];
  for (let i = 0; i < DIAS; i++) {
    const fecha = restarDiasUTC(inicioHoy, DIAS - 1 - i);
    const b = buckets.get(claveDiaUTC(fecha));
    serie.push({
      fecha,
      ventas: b?.ventas ?? 0,
      ingresos: (b?.ingresos ?? new Prisma.Decimal(0)).toFixed(0),
    });
  }
  return serie;
}
