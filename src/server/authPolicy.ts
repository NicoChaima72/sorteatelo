import { type Session } from "next-auth";

import { DomainError } from "~/server/domain/errors";

/**
 * Política pura de autorización del panel de Organizadores (Fase F05, ADR-0005).
 *
 * Sin dependencias de `env`, `db` ni NextAuth en runtime (solo tipos y `DomainError`,
 * que es puro), para ser testeable en Vitest sin `SKIP_ENV_VALIDATION` ni las tablas
 * aplicadas. Los callers (`auth.ts`, el `panelProcedure` de `trpc.ts`, los use cases
 * del panel) inyectan la env / la sesión / las membresías.
 *
 * Tras el pivote SaaS muere la allowlist mono-usuario como GATE del panel; la
 * autorización real es la **membresía User↔Tenant** (fail-closed en la capa de datos)
 * + el rol **Operador** por env var. Las funciones de lista puras (`parsearAllowlist`/
 * `emailEnLista`) sobreviven porque el Operador se sigue designando por CSV de emails.
 */

/**
 * Parsea una env var de emails separados por coma (hoy `PLATFORM_OPERATOR_EMAILS`) a
 * una lista normalizada: cada entrada `trim` + `toLowerCase`, descartando las vacías.
 * `undefined`/`null`/`""` ⇒ lista vacía (fail-closed: lista vacía ⇒ nadie califica).
 */
export function parsearAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entrada) => entrada.trim().toLowerCase())
    .filter((entrada) => entrada.length > 0);
}

/**
 * `true` sii `email` (normalizado `trim` + `toLowerCase`) está en `lista`.
 * Fail-closed: email `undefined`/`null`/vacío ⇒ `false`; lista vacía ⇒ `false`
 * para cualquier email. Nunca autoriza sin un email presente.
 */
export function emailEnLista(
  email: string | undefined | null,
  lista: string[],
): boolean {
  if (!email) return false;
  const normalizado = email.trim().toLowerCase();
  if (normalizado.length === 0) return false;
  return lista.includes(normalizado);
}

/**
 * `true` sii `email` está en la lista de operadores de plataforma (D4). El Operador
 * es un rol de PLATAFORMA (ve/opera todas las Tiendas); se designa por env var
 * `PLATFORM_OPERATOR_EMAILS` (CSV), evaluada server-side. Reutiliza `emailEnLista`,
 * así que hereda el fail-closed: sin la var (lista vacía) ⇒ nadie es Operador.
 */
export function esOperador(
  email: string | undefined | null,
  emailsOperadores: string[],
): boolean {
  return emailEnLista(email, emailsOperadores);
}

/**
 * Acceso del panel resuelto SERVER-SIDE por `panelProcedure`: quién es (`userId`), si
 * es Operador de plataforma, y las Tiendas de las que es miembro. Es el equivalente
 * del panel a `session` — los use cases lo reciben en lugar de leer membresías sueltas.
 */
export interface AccesoPanel {
  userId: string;
  /** Email del usuario logueado (para snapshots de auditoría, ADR-0004). */
  email?: string | null;
  esOperador: boolean;
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
 * del panel. La autorización sale SIEMPRE de la membresía o del flag Operador (ambos
 * server-side); un `tenantIdSolicitado` del input JAMÁS autoriza — solo SELECCIONA, y
 * solo para el Operador (I1; lección del bug H1 de datawalt-app).
 *
 * - **Organizador** (no Operador): siempre una Tienda de su membresía. Sin selección ⇒
 *   la primera (MVP: 1 membresía, S8). Selección ajena a su membresía ⇒ `FORBIDDEN`.
 *   Sin membresía ⇒ `FORBIDDEN` (fail-closed).
 * - **Operador**: puede indicar `tenantIdSolicitado` explícito (así "ve todas"). Sin
 *   indicarlo, cae a su propia membresía si la tiene; si no, error claro (`INVALID`) —
 *   nunca un tenant "por defecto".
 *
 * Lanza `DomainError` (que `runDomain` mapea a `TRPCError`). Devuelve el `tenantId`
 * autorizado con el que el use case scopea TODA query.
 */
export function resolverTenantAutorizado({
  esOperador,
  tenantIdsDeMembresia,
  tenantIdSolicitado,
}: {
  esOperador: boolean;
  tenantIdsDeMembresia: string[];
  tenantIdSolicitado?: string | null;
}): string {
  if (tenantIdSolicitado) {
    // El input SELECCIONA, no autoriza.
    if (esOperador) return tenantIdSolicitado; // el Operador puede operar cualquier Tienda (S7)
    if (tenantIdsDeMembresia.includes(tenantIdSolicitado)) {
      return tenantIdSolicitado;
    }
    throw new DomainError("FORBIDDEN", "No tienes acceso a esa Tienda.");
  }
  // Sin selección explícita: la Tienda de la membresía (MVP: la primera, S8).
  const primera = tenantIdsDeMembresia[0];
  if (primera) return primera;
  if (esOperador) {
    throw new DomainError(
      "INVALID",
      "Como Operador, indica sobre qué Tienda operar: no hay una por defecto.",
    );
  }
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
 * **El rol Operador de plataforma NO abre esta puerta** (D11, 2026-07-25): el panel de Organizador
 * es *por empresa* y se resuelve SIEMPRE contra la membresía. Por eso acá se declara
 * `esOperador: false` — no es una mentira sobre quién es el usuario, es la afirmación de que en ESTA
 * superficie el rol no autoriza nada. El acceso cross-tienda del Operador sigue vivo en su propio
 * panel (`/admin/operador` + `operadorProcedure`, que sí lee `acceso.esOperador`), y la política
 * pura `resolverTenantAutorizado` conserva intacta su rama de Operador para esos otros bordes (I2).
 */
export function resolverTenantDelPanel(acceso: AccesoPanel): string {
  if (!acceso.tenantIdDelHost) {
    throw new DomainError(
      "FORBIDDEN",
      "Abre el panel desde la dirección de tu tienda.",
    );
  }
  return resolverTenantAutorizado({
    esOperador: false, // D11 — ver el bloque de arriba
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
