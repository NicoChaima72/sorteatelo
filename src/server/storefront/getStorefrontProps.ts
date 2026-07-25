import { type GetServerSidePropsContext } from "next";

import { leerChromeParaRender, type Chrome } from "~/lib/pagebuilder/chrome";
import { documentoInicial } from "~/lib/pagebuilder/factory";
import { leerDocumentoParaRender } from "~/lib/pagebuilder/migrate";
import { humanizarSlug, type NavItem } from "~/lib/pagebuilder/nav";
import { type PageDocument, type Tema } from "~/lib/pagebuilder/schema";
import { env } from "~/env";
import { db } from "~/server/db";
import { crearRepoBranding } from "~/server/storefront/repoBranding";
import {
  type ResolucionBranding,
  resolverBrandingDesdeHost,
} from "~/server/storefront/resolverBranding";
import { resolverModoPreview } from "~/server/storefront/previewToken";
import { configPlataformaDesdeEnv } from "~/server/tenancy/configPlataforma";
import { esSlugPaginaReservado } from "~/server/tenancy/slugTienda";
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

/** Props de la home (`/`): tematizada + Documento de Página si es storefront; sin nada si es apex. */
export interface PropsHome {
  tenantBranding: TenantBranding | null;
  /** El Documento de Página a renderizar (publicado, o borrador en preview). `null` solo en apex. */
  pagina: PageDocument | null;
  /**
   * TemaPagina resuelto (`pagina.root.props`, catálogo-v2 F02/D3) — lo consume `_app` para el
   * theme (radio/tipografía/modo) y la home para el fondo de página. `null` en apex.
   */
  temaPagina: Tema | null;
  /** `true` si se está sirviendo el Borrador (preview con token) ⇒ el render marca `robots noindex`. */
  esPreview: boolean;
  /** Items de nav de las páginas `enNav` del tenant (Tanda 3 F04/D9); se mergean con el nav derivado. */
  navPaginas: NavItem[];
  /** Chrome global del tenant (Tanda 3 F06/D10); `null` ⇒ header/footer actual (byte-idéntico). */
  chrome: Chrome | null;
}

/** Props de una página secundaria (`/[slug]`): tematizada + su Documento publicado. */
export interface PropsPagina {
  tenantBranding: TenantBranding;
  pagina: PageDocument;
  temaPagina: Tema;
  esPreview: boolean;
  navPaginas: NavItem[];
  /** Chrome global del tenant (Tanda 3 F06/D10). */
  chrome: Chrome | null;
  /** El slug de esta página (para excluirla del nav de páginas y marcar el ítem activo). */
  slug: string;
}

/**
 * Carga el Documento de Página a renderizar (F05, ADR-0016; multi-página Tanda 3 F04). `publicado`
 * (público) o `borrador` (preview), de la página `slug` (default `home`). Lectura TOLERANTE
 * (`leerDocumentoParaRender`, I9): un tipo desconocido no crashea. Para `home` sin fila/published,
 * FALLBACK ON-THE-FLY desde las columnas de branding del Tenant (R5). Para OTRAS páginas sin published,
 * devuelve `null` (⇒ 404 neutral, I-U3): una página secundaria no publicada no se sirve.
 */
async function cargarDocumentoParaRender({
  branding,
  cual,
  slug = "home",
}: {
  branding: TenantBranding;
  cual: "publicado" | "borrador";
  slug?: string;
}): Promise<PageDocument | null> {
  const page = await db.storefrontPage.findFirst({
    where: { slug, tenant: { slug: branding.slug } }, // tenant resuelto server-side (I1)
    select: { draftJson: true, publishedJson: true },
  });
  const raw = cual === "borrador" ? page?.draftJson : page?.publishedJson;
  if (raw == null) {
    // Solo `home` cae al fallback on-the-fly (siempre debe renderizar algo). Otras páginas ⇒ null (404).
    if (slug !== "home") return null;
    return documentoInicial({
      heroTitulo: branding.heroTitulo,
      heroSubtitulo: branding.heroSubtitulo,
      heroImageUrl: branding.heroImageUrl,
      avisoTexto: branding.avisoTexto, // F10: overlay aviso_barra en el fallback on-the-fly
    });
  }
  return leerDocumentoParaRender(raw);
}

/**
 * Items de nav de las PÁGINAS del tenant marcadas `enNav` (Tanda 3 F04/D9). Href = `/slug`, label =
 * `humanizarSlug`. Excluye `home` y la página actual. DEFENSIVO (I-G): cualquier error de la query (p.ej.
 * un cliente Prisma stale durante un deploy sin restart, o un fallo transitorio) degrada a `[]` ⇒ el nav
 * cae al derivado, el storefront NUNCA 500ea por el nav. Público (sin sesión) ⇒ CDN-cacheable.
 */
export async function resolverNavPaginas({
  tenantSlug,
  paginaActual = "home",
}: {
  tenantSlug: string;
  paginaActual?: string;
}): Promise<NavItem[]> {
  try {
    const pages = await db.storefrontPage.findMany({
      where: { tenant: { slug: tenantSlug }, enNav: true, publishedAt: { not: null } },
      select: { slug: true },
      orderBy: { createdAt: "asc" },
    });
    return pages
      .filter((p) => p.slug !== "home" && p.slug !== paginaActual)
      .map((p) => ({ label: humanizarSlug(p.slug), href: `/${p.slug}` }));
  } catch {
    return []; // degradación elegante: el nav de páginas es un extra, nunca tumba el render
  }
}

/**
 * Chrome GLOBAL del tenant para el render (Tanda 3 F06/D10). `Tenant.chromeJson` null ⇒ `null` (el layout
 * usa el header/footer actual, byte-idéntico I-U8). Chrome podrido ⇒ chrome default tolerante
 * (`leerChromeParaRender`, I9). DEFENSIVO (I-G): cualquier error de la query (cliente Prisma stale durante
 * un deploy sin restart, fallo transitorio) degrada a `null` ⇒ el storefront NUNCA 500ea por el chrome.
 */
export async function resolverChrome({ tenantSlug }: { tenantSlug: string }): Promise<Chrome | null> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { chromeJson: true },
    });
    return leerChromeParaRender(tenant?.chromeJson ?? null);
  } catch {
    return null;
  }
}

/**
 * Helper para la HOME (`/`), que despacha por zona (D1): storefront ⇒ props con branding + Documento
 * de Página (publicado, o borrador si `?preview=<token>` es válido); apex/www ⇒ props sin branding
 * (placeholder de plataforma neutral, D9); host sin Tienda publicada ⇒ `notFound` neutral. Un
 * `?preview` con token inválido/ausente ⇒ `notFound` neutral (I5): no delata que hay un borrador.
 */
export async function getPropsHome(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsHome } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona === "plataforma") {
    return {
      props: { tenantBranding: null, pagina: null, temaPagina: null, esPreview: false, navPaginas: [], chrome: null },
    };
  }
  if (res.zona !== "storefront") {
    return { notFound: true };
  }

  const modo = resolverModoPreview({
    preview: ctx.query.preview,
    token: env.STOREFRONT_PREVIEW_TOKEN,
  });
  if (modo === "no-encontrado") {
    return { notFound: true }; // preview con token inválido ⇒ 404 neutral
  }

  const pagina = await cargarDocumentoParaRender({
    branding: res.branding,
    cual: modo === "borrador" ? "borrador" : "publicado",
  });
  // `home` siempre resuelve (fallback on-the-fly) ⇒ pagina no-null; guardamos por tipos.
  if (!pagina) return { notFound: true };
  const navPaginas = await resolverNavPaginas({ tenantSlug: res.branding.slug, paginaActual: "home" });
  const chrome = await resolverChrome({ tenantSlug: res.branding.slug });
  return {
    props: {
      tenantBranding: res.branding,
      pagina,
      temaPagina: pagina.root.props, // TemaPagina resuelto (con defaults, catálogo-v2 F02)
      esPreview: modo === "borrador",
      navPaginas,
      chrome,
    },
  };
}

/**
 * Helper del SSR de una PÁGINA secundaria (`/[slug]`, Tanda 3 F04/D7). MISMO pipeline que `home`, pero:
 * el slug sale de `ctx.params` (validado + reservados rechazados ⇒ 404), y una página sin published
 * (o inexistente) da 404 NEUTRAL idéntico al de un producto inexistente (I-U3, fail-closed). Solo sirve
 * `home`+published de una tienda PUBLICADA (la zona storefront ya lo garantiza server-side, I1/ADR-0007).
 * Preview tokenizado funciona igual (`?preview=<token>` ⇒ sirve el borrador de esa página).
 */
export async function getPropsPaginaTienda(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsPagina } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona !== "storefront") return { notFound: true }; // apex/host ajeno ⇒ 404 neutral

  const slugParam = ctx.params?.slug;
  const slug = typeof slugParam === "string" ? slugParam.trim().toLowerCase() : "";
  // Slug vacío o reservado (una ruta estática que llegó acá) ⇒ 404 neutral. `home` vive en `/` (index).
  if (!slug || slug === "home" || esSlugPaginaReservado(slug)) return { notFound: true };

  const modo = resolverModoPreview({
    preview: ctx.query.preview,
    token: env.STOREFRONT_PREVIEW_TOKEN,
  });
  if (modo === "no-encontrado") return { notFound: true };

  const pagina = await cargarDocumentoParaRender({
    branding: res.branding,
    cual: modo === "borrador" ? "borrador" : "publicado",
    slug,
  });
  if (!pagina) return { notFound: true }; // página inexistente / sin publicar ⇒ 404 neutral (I-U3)

  const navPaginas = await resolverNavPaginas({ tenantSlug: res.branding.slug, paginaActual: slug });
  const chrome = await resolverChrome({ tenantSlug: res.branding.slug });
  return {
    props: {
      tenantBranding: res.branding,
      pagina,
      temaPagina: pagina.root.props,
      esPreview: modo === "borrador",
      navPaginas,
      chrome,
      slug,
    },
  };
}
