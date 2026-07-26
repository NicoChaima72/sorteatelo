import { parsearHost, type ConfigPlataforma } from "~/server/tenancy/parsearHost";
import {
  type RepoTenants,
  type TenantDeContexto,
} from "~/server/tenancy/resolverTenant";

/**
 * Resolución host → Tienda para el PANEL DE ADMINISTRACIÓN (admin-multi-tienda F02/D2, ADR-0022).
 *
 * Gemela de `resolverTenantDesdeHost` (storefront) con UNA diferencia deliberada: **no exige que la
 * Tienda esté PUBLICADA**. Son dos políticas distintas sobre el mismo dato, y por eso son dos
 * funciones y no un parámetro booleano:
 *
 * - El **storefront** solo existe si la tienda está publicada, y todo lo demás (inexistente, en
 *   configuración, suspendida) colapsa en UNA respuesta neutral indistinguible (ADR-0007).
 * - El **panel** tiene que existir ANTES de publicar (una tienda en CONFIGURACION se administra
 *   justamente para poder publicarse) y DESPUÉS de suspender (la suspensión apaga la vitrina, no la
 *   administración — el Organizador sigue viendo sus ventas). El aislamiento no lo da el estado sino
 *   la membresía, que el guard chequea a continuación.
 *
 * Devolver el tenant acá NO autoriza a nadie: `decidirAccesoAdmin` decide quién entra. Este módulo
 * solo responde "qué Tienda administra este host". La resolución del storefront queda INTACTA (I3).
 */

export type ResolucionAdmin =
  /** Apex/`www`: la puerta del panel (redirect a la primera tienda), no una tienda. */
  | { zona: "plataforma" }
  /** Subdominio de una Tienda existente, en CUALQUIER estado. */
  | { zona: "tienda"; tenant: TenantDeContexto }
  /** Host ininteligible o slug que no existe ⇒ el guard responde 404 neutral (ADR-0007). */
  | { zona: "sin-tienda" };

export async function resolverTenantAdminDesdeHost({
  host,
  config,
  repo,
}: {
  host: string | undefined | null;
  config: ConfigPlataforma;
  repo: RepoTenants;
}): Promise<ResolucionAdmin> {
  const zonaHost = parsearHost(host, config);

  // Host no interpretable ⇒ fail-closed sin tocar la DB (mismo criterio que el storefront).
  if (zonaHost === null) return { zona: "sin-tienda" };

  if (zonaHost.zona === "plataforma") return { zona: "plataforma" };

  const tenant = await repo.findTenantBySlug(zonaHost.slug);
  if (!tenant) return { zona: "sin-tienda" };

  // Cualquier estado sirve para administrar: el gate del panel es la MEMBRESÍA, no la publicación.
  return { zona: "tienda", tenant: { id: tenant.id, slug: tenant.slug } };
}
