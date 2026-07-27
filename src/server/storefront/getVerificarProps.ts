import { type PrismaClient } from "@prisma/client";
import { type GetServerSidePropsContext } from "next";

import { componerNavDelHeader, type Chrome } from "~/lib/pagebuilder/chrome";
import { reanclarNavALaHome, type NavItem } from "~/lib/pagebuilder/nav";
import { type Tema } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";
import {
  resolverBrandingSSR,
  resolverChrome,
  resolverNavPaginas,
} from "~/server/storefront/getStorefrontProps";
import { resolverHerenciaDeLaHome } from "~/server/storefront/temaPagina";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Borde de `getServerSideProps` de la página `/verificar` (verificador-tickets F03, D3/D10): el
 * verificador público de tickets del storefront.
 *
 * Archivo propio y no una función más en `getStorefrontProps.ts`, por el mismo cordón que llevó a
 * `getBasesProps.ts` a vivir aparte (I8: ese archivo tiene carriles in-flight sin commitear). Reusa
 * sus helpers exportados —`resolverBrandingSSR`, `resolverNavPaginas`, `resolverChrome`— en vez de
 * duplicarlos: el chrome y el nav de `/verificar` son EXACTAMENTE los del resto de la tienda.
 *
 * Fail-closed en la ZONA: apex o host sin Tienda publicada ⇒ `notFound` neutral, sin consultar nada
 * más (ADR-0007). Fail-SOFT en el contenido (I5): sin sorteo ACTIVO la página igual renderiza, con
 * su estado vacío honesto y sin ofrecer búsqueda (D2) — este link va pinned en el header y el footer
 * de TODAS las tiendas (D8), así que un 500 acá sería un 500 a la vista en cada página.
 *
 * **Todo lo que sale de acá es JSON puro.** Next serializa las props y un `Date` crudo lo hace
 * lanzar en runtime. La `fechaFin` del sorteo cruza como `fechaFinIso` (nombre distinto a propósito:
 * deja el formato del cable a la vista y obliga a rehidratar con `new Date(...)` para formatear).
 * Es el mismo pie del que `/bases` ya se cayó una vez —encontrado en E2E, no en Vitest— y por eso
 * acá se serializa en el BORDE y hay un test de round-trip.
 */

/** El sorteo ACTIVO tal como lo necesita la página, ya serializable. */
export interface SorteoDelVerificador {
  nombre: string;
  premio: string;
  /** ISO string, no `Date`: ver el docstring del módulo. */
  fechaFinIso: string;
}

export interface PropsVerificar {
  tenantBranding: TenantBranding;
  /** Nav del header YA COMPUESTO con las mismas reglas que la home (D10, igual que `/bases`). */
  navItems: NavItem[];
  chrome: Chrome | null;
  /** Tema mínimo heredado de la Tienda. `null` ⇒ tienda sin tematizar (no-op byte-idéntico). */
  temaPagina: Tema | null;
  /**
   * El sorteo bajo el que corre la verificación, o `null` si la Tienda no tiene ninguno ACTIVO.
   * Es lo que decide si la página ofrece el formulario (D2): sin sorteo no hay nada que verificar,
   * y prometer una búsqueda que no puede encontrar nada sería peor que decirlo.
   */
  sorteo: SorteoDelVerificador | null;
}

/**
 * Data-loader del sorteo ACTIVO para el encabezado de la página. Scopeado por el `slug` del tenant
 * resuelto SERVER-SIDE (I1), jamás por algo del cliente. Devuelve el tipo HONESTO (`Date`); la
 * conversión al cable la hace el borde de abajo.
 *
 * Mismo criterio que `resolverBasesDelSorteo`: SIEMPRE el ACTIVO. Un sorteo cerrado no se verifica
 * acá aunque exista (D11) — ni sus tickets ni su ganador salen por esta superficie.
 *
 * El `orderBy` NO es decorativo y es la única desviación deliberada del precedente (que no lo
 * tiene): «1 Raffle ACTIVO por tenant» es invariante de USE CASE, no constraint de DB, así que dos
 * activos son posibles en teoría. Sin el mismo desempate que usa `verificarTickets`, el encabezado
 * podría NOMBRAR un sorteo y la búsqueda responder con los tickets de otro — el peor defecto posible
 * en una página cuyo trabajo entero es decirte bajo qué sorteo estás verificando.
 */
async function resolverSorteoDelVerificador({
  db: prisma,
  tenantSlug,
}: {
  db: Pick<PrismaClient, "raffle">;
  tenantSlug: string;
}): Promise<{ nombre: string; premio: string; fechaFin: Date } | null> {
  const raffle = await prisma.raffle.findFirst({
    where: { estado: "ACTIVO", tenant: { slug: tenantSlug } },
    orderBy: { createdAt: "desc" },
    select: { nombre: true, premio: true, fechaFin: true },
  });
  return raffle ?? null;
}

export async function getPropsVerificar(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsVerificar } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona !== "storefront") return { notFound: true }; // apex/host ajeno ⇒ 404 neutral

  const tenantSlug = res.branding.slug;
  // Las cuatro lecturas en paralelo (mismo `Promise.all` que `/bases`): el costo en latencia es ≈ 0
  // y ninguna depende de la otra.
  const [sorteo, navPaginas, chrome, herencia] = await Promise.all([
    resolverSorteoDelVerificador({ db, tenantSlug }),
    resolverNavPaginas({ tenantSlug, paginaActual: "verificar" }),
    resolverChrome({ tenantSlug }),
    resolverHerenciaDeLaHome({ tenantSlug }),
  ]);
  const navItems = reanclarNavALaHome(
    componerNavDelHeader({ chrome, navDerivado: herencia.navDeLaHome, navPaginas }),
  );

  return {
    props: {
      tenantBranding: res.branding,
      navItems,
      chrome,
      temaPagina: herencia.temaPagina,
      // Serialización explícita, NUNCA un spread del loader: el spread es justo por donde se cuela
      // un `Date` (backend-conventions § Props del SSR).
      sorteo: sorteo
        ? {
            nombre: sorteo.nombre,
            premio: sorteo.premio,
            fechaFinIso: sorteo.fechaFin.toISOString(),
          }
        : null,
    },
  };
}
