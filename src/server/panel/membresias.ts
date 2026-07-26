import { type Prisma, type PrismaClient } from "@prisma/client";

/**
 * ORDEN CANÓNICO de las Tiendas de un usuario (admin-multi-tienda D5/I5, ADR-0022).
 *
 * Una sola secuencia gobierna TODO lo que enumera las tiendas de alguien: el redirect del apex
 * (`/admin` ⇒ la PRIMERA tienda), el listado del switcher del panel y `acceso.tenantIds`. Antes había
 * dos órdenes distintos —`nombre asc` en `getAccesoActual` (lo que se VEÍA) y el orden crudo del
 * `findMany` sin `orderBy` en `panelProcedure` (sobre lo que se OPERABA)—, y esa discrepancia era el
 * bug latente que ADR-0022 mata: con el panel scopeado por host el tenant activo sale del subdominio,
 * y lo que queda por ordenar (la "primera" tienda) tiene UNA definición sola.
 *
 * Antigüedad de la MEMBRESÍA (no del Tenant ni del nombre): la primera tienda de alguien es la
 * primera que administró. `id asc` desempata para que el orden sea TOTAL y estable (mismo criterio
 * que la paginación por cursor de backend-conventions).
 */
export const ORDEN_CANONICO_MEMBRESIAS: Prisma.TenantMembershipOrderByWithRelationInput[] =
  [{ createdAt: "asc" }, { id: "asc" }];

/** Una membresía en lo mínimo que el panel necesita: sobre qué Tienda, y en qué subdominio vive. */
export interface MembresiaCanonica {
  tenantId: string;
  slug: string;
}

/**
 * Carga las membresías del usuario en el orden canónico. ÚNICO punto de carga de membresías del
 * panel: lo consumen `panelProcedure` (que deriva `acceso.tenantIds`) y el guard de las páginas
 * admin (que deriva el destino del redirect del apex) — así la "primera tienda" es la misma en el
 * borde tRPC y en el borde de páginas, sin dos queries que puedan desincronizarse.
 *
 * El `userId` sale SIEMPRE de la sesión server-side, jamás del input (I1/ADR-0005).
 */
export async function cargarMembresiasCanonicas({
  db,
  userId,
}: {
  db: Pick<PrismaClient, "tenantMembership">;
  userId: string;
}): Promise<MembresiaCanonica[]> {
  const membresias = await db.tenantMembership.findMany({
    where: { userId },
    // `select` explícito (backend-conventions § Prisma en el server): el slug viene del Tenant
    // porque es la DIRECCIÓN del panel de esa tienda (`<slug>.<apex>/admin`).
    select: { tenantId: true, tenant: { select: { slug: true } } },
    orderBy: ORDEN_CANONICO_MEMBRESIAS,
  });
  return membresias.map((m) => ({ tenantId: m.tenantId, slug: m.tenant.slug }));
}
