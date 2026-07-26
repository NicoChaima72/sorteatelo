import { type Session } from "next-auth";

import { DomainError } from "~/server/domain/errors";

/**
 * Política pura de autorización del panel de Organizadores (Fase F05, ADR-0005).
 *
 * Sin dependencias de `env`, `db` ni NextAuth en runtime (solo tipos y `DomainError`,
 * que es puro), para ser testeable en Vitest sin `SKIP_ENV_VALIDATION` ni las tablas
 * aplicadas. Los callers (`auth.ts`, el `panelProcedure` de `trpc.ts`, los use cases
 * del panel) inyectan la sesión / las membresías.
 *
 * Tras el pivote SaaS murió la allowlist mono-usuario como GATE del panel, y con el
 * retiro del rol Operador de plataforma
 * (`tasks/26-07-25-plataforma-retiro-operador.md` F04/D5) murieron también sus
 * helpers de lista (`parsearAllowlist`/`emailEnLista`/`esOperador`): ya no queda
 * ningún rol designado por env var. La autorización es UNA sola: la **membresía
 * User↔Tenant**, fail-closed en la capa de datos.
 */

/**
 * Acceso del panel resuelto SERVER-SIDE por `panelProcedure`: quién es (`userId`) y las
 * Tiendas de las que es miembro. Es el equivalente del panel a `session` — los use cases
 * lo reciben en lugar de leer membresías sueltas.
 */
export interface AccesoPanel {
  userId: string;
  /** Email del usuario logueado (para snapshots de auditoría, ADR-0004). */
  email?: string | null;
  /**
   * tenantIds de las membresías del usuario (server-side, jamás del input), en el ORDEN CANÓNICO
   * (`TenantMembership.createdAt asc, id asc` — D5/ADR-0022).
   */
  tenantIds: string[];
  /**
   * Tienda que administra el HOST del request (`<slug>.<apex>/admin`), resuelta SERVER-SIDE del
   * subdominio en el contexto tRPC (ADR-0007/0022). `null` en el apex o en un host que no resuelve.
   *
   * Es la ÚNICA selección de tenant del panel: server-authored, así que no viola I1 (el input del
   * cliente sigue sin poder elegir tenant). Los use cases lo consumen vía `resolverTenantDelPanel`.
   */
  tenantIdDelHost: string | null;
}

/**
 * Decisión pura del guard por tenant (D5): resuelve SOBRE QUÉ Tienda opera un request
 * del panel. La autorización sale SIEMPRE de la membresía (server-side); un
 * `tenantIdSolicitado` del input JAMÁS autoriza — solo SELECCIONA entre lo ya
 * autorizado (I1; lección del bug H1 de datawalt-app).
 *
 * - Con selección: tiene que estar en la membresía. Ajena ⇒ `FORBIDDEN`.
 * - Sin selección: la primera Tienda de la membresía en el ORDEN CANÓNICO (S8).
 * - Sin membresía ⇒ `FORBIDDEN` (fail-closed).
 *
 * **No hay rol que abra un atajo.** Hasta el retiro del rol Operador de plataforma
 * (F04/D5) esta función recibía un `esOperador` con dos ramas: devolver cualquier
 * `tenantIdSolicitado` sin mirar la membresía, y un `INVALID` ("indica sobre qué
 * Tienda operar") cuando no había ninguna. Ambas murieron: sin membresía se NIEGA.
 *
 * Lanza `DomainError` (que `runDomain` mapea a `TRPCError`). Devuelve el `tenantId`
 * autorizado con el que el use case scopea TODA query.
 */
export function resolverTenantAutorizado({
  tenantIdsDeMembresia,
  tenantIdSolicitado,
}: {
  tenantIdsDeMembresia: string[];
  tenantIdSolicitado?: string | null;
}): string {
  if (tenantIdSolicitado) {
    // El input SELECCIONA, no autoriza.
    if (tenantIdsDeMembresia.includes(tenantIdSolicitado)) {
      return tenantIdSolicitado;
    }
    throw new DomainError("FORBIDDEN", "No tienes acceso a esa Tienda.");
  }
  // Sin selección explícita: la Tienda de la membresía (MVP: la primera, S8).
  const primera = tenantIdsDeMembresia[0];
  if (primera) return primera;
  throw new DomainError(
    "FORBIDDEN",
    "Tu cuenta no tiene una Tienda asignada.",
  );
}

/**
 * Tenant sobre el que opera un use case del PANEL (admin-multi-tienda F03/D3, ADR-0022).
 *
 * Es el único llamador de `resolverTenantAutorizado` en el panel: le pasa como `tenantIdSolicitado`
 * la Tienda del HOST — que es server-authored (subdominio + middleware), no input del cliente, así
 * que la política sigue "seleccionando entre lo autorizado, jamás autorizando" (I1/I2). La política
 * pura no cambió ni de firma ni de semántica: esta función la ALIMENTA.
 *
 * **Sin Tienda en el host ⇒ `FORBIDDEN`, no fallback.** Antes, cada use case llamaba a la política
 * sin selección y caía a `tenantIdsDeMembresia[0]`: con más de una membresía se podía VER una tienda
 * en el chip y OPERAR otra. El panel de contenido ahora vive SOLO dentro del subdominio de una
 * Tienda; en el apex solo quedan el redirect y el alta (D1), que no pasan por acá.
 *
 * **El panel de Organizador es *por empresa*** y se resuelve SIEMPRE contra la membresía (D11,
 * 2026-07-25). Antes esta función tenía que DECLARARLE `esOperador: false` a la política para negar
 * el atajo del rol; desde el retiro del rol (F04/D5) ese atajo no existe en ninguna parte, así que
 * ya no hay nada que declarar: la política tiene una sola puerta y es la membresía.
 */
export function resolverTenantDelPanel(acceso: AccesoPanel): string {
  if (!acceso.tenantIdDelHost) {
    throw new DomainError(
      "FORBIDDEN",
      "Abre el panel desde la dirección de tu tienda.",
    );
  }
  return resolverTenantAutorizado({
    tenantIdsDeMembresia: acceso.tenantIds,
    tenantIdSolicitado: acceso.tenantIdDelHost,
  });
}

/**
 * Resultado discriminado del guard de páginas admin: o un `redirect` (para el
 * `getServerSideProps`) o la `session` ya estrechada a no-null.
 */
export type ResultadoGuard =
  | { redirect: { destination: string; permanent: false } }
  | { session: Session };

/**
 * Decisión pura del guard de páginas admin. Sin sesión ⇒ redirect a `/login`;
 * con sesión ⇒ expone la sesión (rama de props). Extraída de `requireSession`
 * (en `auth.ts`) para testear la decisión sin NextAuth ni la request real.
 */
export function resolverGuard(session: Session | null): ResultadoGuard {
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  return { session };
}
