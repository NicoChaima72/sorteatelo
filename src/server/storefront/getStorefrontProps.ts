import { type GetServerSidePropsContext } from "next";

import { db } from "~/server/db";
import { crearRepoBranding } from "~/server/storefront/repoBranding";
import {
  type ResolucionBranding,
  resolverBrandingDesdeHost,
} from "~/server/storefront/resolverBranding";
import { configPlataformaDesdeEnv } from "~/server/tenancy/configPlataforma";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Borde de `getServerSideProps` del storefront (F01/D1/D3). Resuelve el branding del host
 * ANTES de renderizar (para tematizar en `_app`, ADR-0011) cableando el núcleo puro
 * (`resolverBrandingDesdeHost`) contra la config de plataforma y el repo Prisma. Cada página
 * del storefront exporta un `getServerSideProps` de una línea que delega acá.
 *
 * El `tenantBranding` que devuelve se serializa en `pageProps`: `_app` lo lee para el theme
 * override y las páginas para el chrome. No prefetchea datos (catálogo/producto/sorteo) — esos
 * van por tRPC con el contexto ya scopeado server-side (S6), sin acoplar el render a un pipeline
 * de SSG/prefetch.
 */
export async function resolverBrandingSSR(
  ctx: GetServerSidePropsContext,
): Promise<ResolucionBranding> {
  return resolverBrandingDesdeHost({
    host: ctx.req.headers.host,
    config: configPlataformaDesdeEnv(),
    repo: crearRepoBranding(db),
  });
}

/** Props que reciben las páginas del storefront tematizadas (`tenantBranding` no-null). */
export interface PropsStorefront {
  tenantBranding: TenantBranding;
}

/**
 * Helper para las páginas EXCLUSIVAS del comprador (`/producto/[id]`, `/checkout`,
 * `/checkout/retorno`): solo existen dentro de un storefront. Zona storefront ⇒ props con
 * branding; apex o host sin Tienda publicada ⇒ `notFound` neutral (I2/ADR-0007) — el apex es
 * zona plataforma, no del comprador.
 */
export async function getPropsPaginaComprador(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsStorefront } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona !== "storefront") return { notFound: true };
  return { props: { tenantBranding: res.branding } };
}

/** Props de la home (`/`): tematizada si es storefront; sin branding si es apex. */
export interface PropsHome {
  tenantBranding: TenantBranding | null;
}

/**
 * Helper para la HOME (`/`), que despacha por zona (D1): storefront ⇒ props con branding (home
 * del storefront); apex/www ⇒ props sin branding (placeholder de plataforma neutral, D9); host
 * sin Tienda publicada ⇒ `notFound` neutral. La página decide qué renderizar según `tenantBranding`.
 */
export async function getPropsHome(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsHome } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona === "storefront") {
    return { props: { tenantBranding: res.branding } };
  }
  if (res.zona === "plataforma") {
    return { props: { tenantBranding: null } };
  }
  return { notFound: true };
}
