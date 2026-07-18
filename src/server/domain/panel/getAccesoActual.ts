import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel } from "~/server/authPolicy";

/**
 * Use case del panel (F05): resuelve el ACCESO del usuario logueado para que el layout
 * decida qué renderizar. Devuelve las Tiendas de las que es miembro (nombre + slug para
 * mostrar, `colorPrimario` para el swatch del chip de tienda del chrome — admin-marca D7)
 * y si es Operador de plataforma.
 *
 * Aislamiento (I1/ADR-0005): las Tiendas salen de `acceso.tenantIds` (membresías
 * resueltas SERVER-SIDE en `panelProcedure`), nunca del input. Un usuario sin membresía
 * ⇒ `tenants: []` — el layout muestra el empty state "tu cuenta no tiene una tienda
 * asignada" (fail-closed, D2). En el MVP la UI opera sobre la primera Tienda (S8);
 * el selector multi-tienda / panel del Operador llega con F08.
 */
export async function getAccesoActual({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{
  tenants: Array<{
    id: string;
    nombre: string;
    slug: string;
    colorPrimario: string | null;
  }>;
  esOperador: boolean;
}> {
  const tenants =
    acceso.tenantIds.length === 0
      ? []
      : await db.tenant.findMany({
          where: { id: { in: acceso.tenantIds } },
          select: { id: true, nombre: true, slug: true, colorPrimario: true },
          orderBy: { nombre: "asc" },
        });
  return { tenants, esOperador: acceso.esOperador };
}
