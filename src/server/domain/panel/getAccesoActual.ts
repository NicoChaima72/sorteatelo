import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel } from "~/server/authPolicy";

/**
 * Use case del panel (F05): resuelve el ACCESO del usuario logueado para que el layout
 * decida qué renderizar. Devuelve las Tiendas de las que es miembro (nombre + slug para
 * mostrar, `colorPrimario` para el swatch del chip de tienda del chrome — admin-marca D7),
 * la Tienda ACTIVA (la del subdominio) y si es Operador de plataforma.
 *
 * Aislamiento (I1/ADR-0005): las Tiendas salen de `acceso.tenantIds` (membresías
 * resueltas SERVER-SIDE en `panelProcedure`), nunca del input. Un usuario sin membresía
 * ⇒ `tenants: []` — el layout muestra el empty state "tu cuenta no tiene una tienda
 * asignada" (fail-closed, D2).
 *
 * ORDEN (admin-multi-tienda D5/I5, ADR-0022): se respeta el ORDEN CANÓNICO que ya trae
 * `acceso.tenantIds` (membresía `createdAt asc, id asc`), reordenando en memoria el
 * resultado del `findMany` — que vuelve en el orden que la DB quiera. Antes ordenaba por
 * `nombre asc`, un orden PARALELO al que usaba el server para elegir tienda: lo que se veía
 * en el chip podía no ser la tienda sobre la que se operaba. Prohibido reintroducirlo.
 *
 * TIENDA ACTIVA (ADR-0022): es la del HOST, no `tenants[0]` — y SIEMPRE una de `tenants`
 * (D11, 2026-07-25): el panel de Organizador es por membresía, sin excepción para el rol
 * Operador de plataforma, así que un host fuera de la membresía no enciende tienda activa
 * (ni filtra su nombre a quien no la administra). En el apex tampoco hay tienda activa.
 */
export async function getAccesoActual({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{
  tenants: TiendaDelAcceso[];
  tiendaActiva: TiendaDelAcceso | null;
  esOperador: boolean;
}> {
  // Solo las Tiendas de la membresía: son las únicas que este usuario puede administrar (D11) y,
  // por lo tanto, las únicas que el chrome puede mostrar.
  const filas =
    acceso.tenantIds.length === 0
      ? []
      : await db.tenant.findMany({
          where: { id: { in: acceso.tenantIds } },
          select: { id: true, nombre: true, slug: true, colorPrimario: true },
        });

  const porId = new Map(filas.map((t) => [t.id, t]));

  // Reordena al ORDEN CANÓNICO de las membresías. No se delega en un `orderBy` de Prisma
  // porque el criterio vive en `TenantMembership` (antigüedad de la membresía), no en el
  // Tenant: `acceso.tenantIds` YA viene ordenado desde `panelProcedure` y es la fuente única.
  const tenants = acceso.tenantIds
    .map((id) => porId.get(id))
    .filter((t): t is TiendaDelAcceso => t !== undefined);

  // La activa se busca DENTRO del listado ya filtrado por membresía: un host ajeno (o el apex)
  // deja `null` y el layout cae al empty state, igual que el guard de la página deja `redirect`.
  const tiendaActiva =
    tenants.find((t) => t.id === acceso.tenantIdDelHost) ?? null;

  return {
    tenants,
    tiendaActiva,
    // El rol de plataforma NO da acceso al panel de otras tiendas (D11); sigue expuesto porque el
    // chrome lo usa para ofrecer el panel propio del Operador (`/admin/operador`).
    esOperador: acceso.esOperador,
  };
}

/** Una Tienda tal como la muestra el chrome del panel (chip, switcher, "Ver mi tienda"). */
interface TiendaDelAcceso {
  id: string;
  nombre: string;
  slug: string;
  colorPrimario: string | null;
}
