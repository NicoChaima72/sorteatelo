import { parsearHost, type ConfigPlataforma } from "~/server/tenancy/parsearHost";

/**
 * Resolución completa host → Tienda PUBLICADA (ADR-0005 / ADR-0007, F01 paso 3).
 *
 * Núcleo con la dependencia de datos INYECTADA (`RepoTenants`): no importa
 * Prisma ni `~/server/db`, así que se testea entero con un repo fake y no espera
 * al schema del carril A. El cableado contra el Prisma Client real lo hace el
 * borde (contexto tRPC / `getServerSideProps`) — ver `repoTenants.ts`.
 *
 * Lo consumen el contexto tRPC y cualquier `getServerSideProps` del storefront:
 * una sola función, un solo criterio, sin un wrapper por transporte.
 */

/**
 * Estados del ciclo de vida de la Tienda (CONTEXT.md § Ciclo de vida).
 *
 * CONTRATO CROSS-CARRIL: espeja el enum que el carril A pone en `schema.prisma`.
 * SCREAMING_CASE por `docs/agents/prisma-conventions.md` § Convenciones ("valores
 * en SCREAMING_CASE"). Está declarado acá — y NO importado del Prisma Client —
 * para no acoplar este núcleo a los tipos generados; si el carril A nombra un
 * valor distinto, el integrador ve un **error de tipos** al cablear (falla
 * ruidosa y temprana, que es lo que queremos) en vez de un `estado` que no matchea
 * nunca y deja todas las tiendas mudas en runtime.
 */
export type EstadoTienda = "ALTA" | "CONFIGURACION" | "PUBLICADA" | "SUSPENDIDA";

/** Único estado que sirve storefront (CONTEXT.md: "Solo una Tienda publicada vende"). */
export const ESTADO_PUBLICADA = "PUBLICADA" satisfies EstadoTienda;

/** La Tienda tal como vive en la DB, en lo mínimo que esta resolución necesita. */
export interface TenantPersistido {
  id: string;
  slug: string;
  estado: EstadoTienda;
}

/**
 * Puerto de datos. El borde lo implementa contra Prisma en 5 líneas; los tests
 * lo implementan en memoria. Devuelve la Tienda **cualquiera sea su estado**: la
 * política de "solo publicada sirve" es de esta capa, no del repo (un repo que
 * filtrara por estado haría intesteable la diferencia entre suspendida e inexistente).
 */
export interface RepoTenants {
  findTenantBySlug(slug: string): Promise<TenantPersistido | null>;
}

/** El tenant tal como viaja en el contexto: lo mínimo para scopear queries (I1). */
export interface TenantDeContexto {
  id: string;
  slug: string;
}

/**
 * Resultado de resolver un host.
 *
 * `sin-storefront` es **una sola variante sin campo de motivo**, a propósito: la
 * respuesta neutral de ADR-0007 exige que "slug inexistente", "en configuración"
 * y "suspendida" sean **indistinguibles** para quien mira desde afuera. Al no
 * existir el motivo en el tipo, ningún caller puede filtrarlo aunque quiera —
 * la no-fuga es estructural, no una disciplina que alguien deba recordar.
 */
export type ResolucionTenant =
  | { zona: "plataforma" }
  | { zona: "storefront"; tenant: TenantDeContexto }
  | { zona: "sin-storefront" };

export async function resolverTenantDesdeHost({
  host,
  config,
  repo,
}: {
  host: string | undefined | null;
  config: ConfigPlataforma;
  repo: RepoTenants;
}): Promise<ResolucionTenant> {
  const zonaHost = parsearHost(host, config);

  // Host no interpretable ⇒ fail-closed. No es la plataforma (no le servimos el
  // apex a un host ajeno) y no toca la DB: sin slug no hay nada que consultar.
  if (zonaHost === null) return { zona: "sin-storefront" };

  if (zonaHost.zona === "plataforma") return { zona: "plataforma" };

  const tenant = await repo.findTenantBySlug(zonaHost.slug);

  // Fail-closed: inexistente, en alta, en configuración o suspendida ⇒ la MISMA
  // respuesta neutral. Cualquier estado que no sea exactamente PUBLICADA cae acá,
  // incluido un estado nuevo que el carril A agregue después.
  if (!tenant || tenant.estado !== ESTADO_PUBLICADA) {
    return { zona: "sin-storefront" };
  }

  return { zona: "storefront", tenant: { id: tenant.id, slug: tenant.slug } };
}
