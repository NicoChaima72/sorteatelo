import { type GetServerSidePropsContext } from "next";

import { type Chrome } from "~/lib/pagebuilder/chrome";
import { type NavItem } from "~/lib/pagebuilder/nav";
import { db } from "~/server/db";
import {
  resolverBasesDelSorteo,
  serializarBases,
  type BasesDelSorteoSerializable,
} from "~/server/storefront/basesDelSorteo";
import {
  resolverBrandingSSR,
  resolverChrome,
  resolverNavPaginas,
} from "~/server/storefront/getStorefrontProps";
import { resolverTemaPagina } from "~/server/storefront/temaPagina";
import { type Tema } from "~/lib/pagebuilder/schema";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Borde de `getServerSideProps` de la página `/bases` (admin-bases-pdf F04, D4/D5, ADR-0008).
 *
 * Vive en su PROPIO archivo, no dentro de `getStorefrontProps.ts`, por el cordón con la tanda 3 del
 * builder (I6): ese archivo está in-flight sin commit y no le sumamos líneas. Reusa sus helpers
 * exportados (`resolverBrandingSSR`, `resolverNavPaginas`, `resolverChrome`) en vez de duplicarlos,
 * así el chrome/nav de `/bases` es el mismo que el del resto de la tienda.
 *
 * Fail-closed en la ZONA (como toda página del comprador): apex o host sin Tienda publicada ⇒
 * `notFound` neutral. Fail-SOFT en el contenido (D5): sin sorteo activo o sin PDF, la página igual
 * renderiza con un estado vacío neutral — un 500 en la URL legal que el footer publica en toda la
 * tienda sería peor que un mensaje honesto.
 *
 * **Todo lo que sale de acá es JSON puro** (`serializarBases`): Next serializa las props y un `Date`
 * crudo la hace lanzar en runtime. Esta página no tenía otro dato con fecha, y el `Date` del sorteo
 * cruzaba por el spread ⇒ 500 en los 6 tenants (encontrado por el E2E, no por Vitest: el núcleo puro
 * devuelve el `Date` legítimamente). La conversión es responsabilidad del BORDE, no del núcleo.
 */

export interface PropsBases extends BasesDelSorteoSerializable {
  tenantBranding: TenantBranding;
  navPaginas: NavItem[];
  chrome: Chrome | null;
  /** Tema mínimo heredado de la Tienda (tema-paginas F03). `null` ⇒ tienda sin tematizar (no-op, I6). */
  temaPagina: Tema | null;
}

export async function getPropsBases(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsBases } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona !== "storefront") return { notFound: true }; // apex/host ajeno ⇒ 404 neutral

  const tenantSlug = res.branding.slug;
  // El tema entra al `Promise.all` que ya existía (tema-paginas F03/D8): en paralelo con bases/nav/chrome,
  // el costo en latencia es ≈ 0. Igual que sus vecinos, es defensivo: si falla, `null` y la página sale
  // sin heredar en vez de romperse — esta URL se cita en documentos legales (ADR-0008).
  const [bases, navPaginas, chrome, temaPagina] = await Promise.all([
    resolverBasesDelSorteo({ db, tenantSlug }),
    resolverNavPaginas({ tenantSlug, paginaActual: "bases" }),
    resolverChrome({ tenantSlug }),
    resolverTemaPagina({ tenantSlug }),
  ]);

  return {
    props: {
      tenantBranding: res.branding,
      navPaginas,
      chrome,
      temaPagina,
      ...serializarBases(bases),
    },
  };
}
