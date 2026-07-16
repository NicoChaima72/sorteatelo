import { type ZonaHost } from "~/server/tenancy/parsearHost";

/**
 * Propagación del tenant resuelto desde el middleware (edge) hacia el runtime
 * Node, vía un header **escrito por el servidor**.
 */

/**
 * Header con el slug del tenant resuelto del host.
 *
 * REGLA: su valor lo escribe SIEMPRE el middleware, nunca el cliente. Todo
 * request que entra con este header puesto a mano lo pierde (ver
 * `aplicarHeaderDeTenant`). Aun así, el contexto tRPC **no lo usa como fuente
 * de verdad**: re-parsea el host con el mismo parser puro, para que la
 * resolución no dependa de que el `matcher` del middleware esté bien escrito
 * (defensa en profundidad — lección H1 de datawalt-app).
 *
 * Hoy nadie lo consume: existe para (a) matar desde el día 1 la clase de bug
 * "confiar en un header de tenant spoofeado" antes de que alguien la introduzca,
 * y (b) darle al storefront de F06 un acceso barato al slug en el borde.
 */
export const HEADER_TENANT_SLUG = "x-tenant-slug";

/**
 * Devuelve una COPIA de los headers con `x-tenant-slug` normalizado a la verdad
 * del host: seteado si el host es de una Tienda, borrado en cualquier otro caso
 * (plataforma o host que no resuelve). Fail-closed: ante la duda, no hay tenant.
 */
export function aplicarHeaderDeTenant(
  entrantes: Headers,
  zona: ZonaHost | null,
): Headers {
  const headers = new Headers(entrantes);

  // Borrar SIEMPRE primero: si el request traía el header spoofeado y esta zona
  // no es de tenant, no debe sobrevivir.
  headers.delete(HEADER_TENANT_SLUG);

  if (zona?.zona === "tenant") {
    headers.set(HEADER_TENANT_SLUG, zona.slug);
  }

  return headers;
}
