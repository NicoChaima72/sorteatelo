import { esSlugValido } from "~/server/tenancy/parsearHost";

/**
 * Disponibilidad de un slug para el alta self-service de Tiendas (F08/D7).
 *
 * El slug ES el subdominio de la Tienda (ADR-0007). Su forma válida la define
 * `esSlugValido` (label DNS, en `parsearHost.ts`): se REUSA acá, no se
 * reimplementa, para que la validación del alta y la resolución del host nunca
 * se desincronicen (drift que advirtió F01-B). Este módulo solo agrega la capa de
 * **reservados**: labels que son DNS-válidos pero que la plataforma se reserva
 * (apex/www, endpoints, rutas históricas de la plataforma). La **unicidad** NO vive
 * acá: la garantiza el `@unique` de `Tenant.slug` en la DB (colisión ⇒ CONFLICT).
 */

/**
 * Slugs que la plataforma se reserva y que NINGUNA Tienda puede tomar, aunque sean
 * labels DNS válidos: el apex/www (ADR-0007), los prefijos de endpoints/infra, y las
 * superficies de administración de la plataforma. Vive JUNTO a `esSlugValido` (misma
 * carpeta `tenancy/`) a propósito: la definición de "qué es un subdominio de Tienda" y
 * "qué subdominios NO puede tomar una Tienda" no deben poder divergir.
 */
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  "www",
  "api",
  "admin",
  "app",
  "panel",
  // Se conserva aunque el rol Operador de plataforma ya no exista: sacarlo LIBERARÍA un
  // subdominio que hasta hoy estaba bloqueado, y eso es un cambio de comportamiento, no una limpieza.
  "operador",
  "mail",
  "email",
  "smtp",
  "static",
  "assets",
  "cdn",
  "dev",
  "staging",
  "test",
  "status",
  "docs",
  "blog",
  "help",
  "soporte",
  "support",
  "billing",
  "pagos",
  "checkout",
  "webhooks",
  "webhook",
  "auth",
  "login",
  "cuenta",
  "account",
]);

/**
 * `true` sii `slug` (normalizado `trim` + `toLowerCase`) está reservado por la plataforma.
 * Normaliza antes de comparar para que `ADMIN`/`  www ` no burlen la lista.
 */
export function esSlugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.has(slug.trim().toLowerCase());
}

/**
 * `true` sii `slug` puede TOMARSE como subdominio de una Tienda nueva: es un label DNS
 * válido (`esSlugValido`, reusado) Y no está reservado. NO consulta la DB: la unicidad
 * la resuelve el `@unique` de la DB en el momento del create (colisión ⇒ CONFLICT).
 */
export function esSlugDisponible(slug: string): boolean {
  return esSlugValido(slug) && !esSlugReservado(slug);
}

/**
 * Slugs de PÁGINA reservados (Tanda 3 F04/D7): a diferencia de `SLUGS_RESERVADOS` (subdominios de
 * tenant), estos son las RUTAS ESTÁTICAS de `src/pages/` que en el pages router ganan precedencia sobre
 * `[slug].tsx` — una página con estos slugs nunca se serviría (la ruta estática la tapa) ⇒ se rechazan al
 * CREAR (F04) y el SSR de `[slug]` da 404 si alguna existiera. `home` es la raíz (`index.tsx`), no una
 * página `[slug]`. Vive JUNTO a los reservados de subdominio a propósito (misma fuente de "qué no se puede
 * tomar"). Ampliar acá si se agrega una ruta estática nueva en `src/pages/`.
 */
export const SLUGS_PAGINA_RESERVADOS: ReadonlySet<string> = new Set([
  "home",
  "api",
  "admin",
  "editor",
  "login",
  "checkout",
  "producto",
  // `/bases` = la página de PLATAFORMA con el PDF de bases del sorteo ACTIVO (admin-bases-pdf F04/D6,
  // ADR-0008). Además de ser una ruta estática que taparía a la página del Organizador, es el destino
  // del enlace LEGAL del footer y de la vitrina: no puede quedar bajo contenido que el tenant edita.
  "bases",
  // `/en-pausa` = la página neutral de PLATAFORMA que se sirve cuando la Tienda dejó de vender por
  // facturación (facturación F05/D4). Ruta estática que taparía a una página del Organizador, y
  // además el destino del gate: no puede quedar bajo contenido que el tenant edita.
  "en-pausa",
  "dev",
  "dev-ref",
  "prototipo",
  "www",
  "favicon.ico",
  "_next",
  "_app",
  "_document",
]);

/** `true` sii `slug` (normalizado) es una ruta de página reservada por la plataforma. */
export function esSlugPaginaReservado(slug: string): boolean {
  return SLUGS_PAGINA_RESERVADOS.has(slug.trim().toLowerCase());
}
