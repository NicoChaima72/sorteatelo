import { type PrismaClient } from "@prisma/client";

import { type RepoTenants } from "~/server/tenancy/resolverTenant";

/**
 * Envuelve un `RepoTenants` cacheando por slug DENTRO del request (admin-multi-tienda F03).
 *
 * El contexto tRPC resuelve el MISMO host con dos políticas —la del storefront (exige PUBLICADA) y
 * la del admin (no la exige)—, y sin esto serían dos roundtrips idénticos a la DB por request. Se
 * cachea la PROMESA (no el resultado) para que dos llamadas concurrentes compartan una sola query.
 *
 * El caché vive lo que vive el request (se crea uno por contexto): no hay riesgo de servir la Tienda
 * de un request a otro.
 */
export function repoTenantsMemoizado(repo: RepoTenants): RepoTenants {
  const cache = new Map<string, ReturnType<RepoTenants["findTenantBySlug"]>>();
  return {
    findTenantBySlug: (slug) => {
      const cacheado = cache.get(slug);
      if (cacheado) return cacheado;
      const consulta = repo.findTenantBySlug(slug);
      cache.set(slug, consulta);
      return consulta;
    },
  };
}

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
