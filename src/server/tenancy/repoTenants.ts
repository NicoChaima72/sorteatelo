import { type PrismaClient } from "@prisma/client";

import { type RepoTenants } from "~/server/tenancy/resolverTenant";

/**
 * Cableado del puerto de datos de tenancy contra Prisma (borde, no unit-testeado
 * — la política vive en `resolverTenant.ts` y se testea con un repo fake).
 *
 * Devuelve la Tienda **cualquiera sea su estado**: la regla "solo PUBLICADA
 * sirve storefront" es de `resolverTenantDesdeHost`, no del repo (un repo que
 * filtrara por estado haría intesteable la diferencia entre suspendida e
 * inexistente).
 */
export function crearRepoTenants(db: PrismaClient): RepoTenants {
  return {
    findTenantBySlug: (slug) =>
      db.tenant.findUnique({
        where: { slug },
        // `select` explícito (backend-conventions § Prisma en el server): el
        // storefront no necesita más, y así no arrastra la FlowCredential.
        select: { id: true, slug: true, estado: true },
      }),
  };
}
