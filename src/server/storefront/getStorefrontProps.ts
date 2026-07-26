import { type GetServerSidePropsContext } from "next";

import { leerChromeParaRender, type Chrome } from "~/lib/pagebuilder/chrome";
import { leerDocumentoParaRender } from "~/lib/pagebuilder/migrate";
import { humanizarSlug, type NavItem } from "~/lib/pagebuilder/nav";
import { type PageDocument, type Tema } from "~/lib/pagebuilder/schema";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  type CampoDelCheckout,
  listarCamposActivosDelStorefront,
} from "~/server/domain/camposCheckout/camposActivos";
import { cargarGateVenta } from "~/server/domain/facturacion/cargarGateVenta";
import { crearRepoBranding } from "~/server/storefront/repoBranding";
import {
  type ResolucionBranding,
  resolverBrandingDesdeHost,
} from "~/server/storefront/resolverBranding";
import { resolverModoPreview } from "~/server/storefront/previewToken";
import { resolverTemaPagina } from "~/server/storefront/temaPagina";
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
  /**
   * Tema MÍNIMO heredado de la Tienda (tema-paginas F02, D1): fondo de página + par tipográfico + radio
   * + modo, ya recortado por `resolverTemaPagina`. Lo consume `_app` (radio/tipografía/modo) y la página
   * lo deriva a `estiloShell`/`colorPagina` con `estiloHeredadoDeTema`.
   *
   * `null` ⇒ la Tienda tiene el tema default y la página queda BYTE-idéntica a como salía antes de esta
   * feature (D7/I6) — por eso es `null` y no un `Tema` de defaults.
   */
  temaPagina: Tema | null;
}

/** Ruta de la página neutral que se sirve cuando la Tienda está en pausa por facturación (F05/D4). */
export const RUTA_EN_PAUSA = "/en-pausa";

/** Redirect a la página neutral, en la forma que espera `getServerSideProps`. */
type RedirectSSR = { redirect: { destination: string; permanent: false } };

/**
 * GATE DE VENTA del storefront (F05, D4/D5, ADR-0026). Devuelve el redirect a la página neutral si
 * esta Tienda no puede vender AHORA, o `null` si sí.
 *
 * Esto es el AVISO al visitante, no la autoridad: el gate que de verdad impide la venta es el que
 * `iniciarCheckout` recomputa server-side dentro de su `$transaction`. Acá se decide qué HTML se
 * sirve; allá, si se cobra.
 *
 * Se sirve una página aparte en vez de un 404 a propósito: la Tienda existe y sigue `PUBLICADA` (I6),
 * y a un visitante que llegó por un link compartido le corresponde una respuesta honesta, no la
 * neutralidad de ADR-0007 (que está pensada para no delatar tiendas que no existen o están
 * suspendidas). La página tampoco nombra el motivo: la mora es asunto entre la Plataforma y el
 * Organizador.
 */
async function gateDeVentaSSR(tenantSlug: string): Promise<RedirectSSR | null> {
  const gate = await cargarGateVenta({ db, where: { slug: tenantSlug } });
  if (gate.puedeVender) return null;
  return { redirect: { destination: RUTA_EN_PAUSA, permanent: false } };
}

/**
 * Zona del comprador, SIN gate de venta: solo resuelve que el host sea el subdominio de una Tienda
 * publicada. Privado a propósito — quien quiera props del comprador tiene que elegir explícitamente
 * entre la variante de VENTA y la de ENTREGA, que es la distinción que sostiene I5.
 */
async function zonaComprador(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsStorefront } | { notFound: true }> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona !== "storefront") return { notFound: true };
  // El tema se resuelve ACÁ, en el único lugar por donde pasan las tres páginas del Comprador, y no en
  // cada helper público: era justamente la deriva entre páginas lo que produjo el defecto que esta
  // feature arregla (la home tematizada y el checkout con el body blanco). El `tenantSlug` sale del
  // branding ya resuelto server-side por subdominio (I1), nunca de `ctx.query` ni de otro input.
  // Cuesta una query en el camino del redirect por pausa (que no la necesita); es el precio de tener un
  // solo call site, y es una fila chica por request.
  const temaPagina = await resolverTemaPagina({ tenantSlug: res.branding.slug });
  return { props: { tenantBranding: res.branding, temaPagina } };
}

/**
 * Helper para las páginas de VENTA del comprador (`/producto/[id]`, `/checkout`): solo existen dentro
 * de un storefront. Zona storefront ⇒ props con branding; apex o host sin Tienda publicada ⇒
 * `notFound` neutral (I2/ADR-0007) — el apex es zona plataforma, no del comprador. Tienda en pausa por
 * facturación ⇒ página neutral (F05/D4).
 */
export async function getPropsPaginaComprador(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsStorefront } | { notFound: true } | RedirectSSR> {
  const base = await zonaComprador(ctx);
  if (!("props" in base)) return base;
  return (await gateDeVentaSSR(base.props.tenantBranding.slug)) ?? base;
}

/**
 * Helper para las páginas de ENTREGA post-compra (`/checkout/retorno`) — la MISMA zona del comprador
 * pero **sin gate de facturación** (I5).
 *
 * Existe como export aparte, y no como un flag de `getPropsPaginaComprador`, para que la excepción sea
 * legible desde el call site y auditable desde fuera: hay un test estático que enumera quién lo usa
 * (`gateVentaEnElBorde.test.ts`). El motivo es la regla que protege al Comprador: acá ve su compra y
 * su enlace de descarga, y alguien que acaba de pagar no puede quedarse sin comprobante porque el
 * Organizador esté moroso. Si mañana otra página quiere entrar por acá, tiene que justificarse en ese
 * test — no colarse.
 */
export async function getPropsPaginaEntrega(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsStorefront } | { notFound: true }> {
  return zonaComprador(ctx);
}

/** Props del CHECKOUT: las del comprador + los Campos de checkout activos de la Tienda (F04). */
export interface PropsCheckout extends PropsStorefront {
  /**
   * Los datos ADICIONALES que esta Tienda pide, en orden. `[]` ⇒ el checkout pide solo el correo,
   * exactamente como antes de la feature (I9). El correo NO está acá: es fijo (I2/ADR-0004).
   */
  campos: CampoDelCheckout[];
}

/**
 * Helper del SSR del checkout (F04). Se apoya en `getPropsPaginaComprador` en vez de repetir el
 * gate de zona: así el checkout no puede divergir del resto de las páginas del Comprador en QUÉ
 * hosts atiende (I2), y lo único que suma es la lectura de los campos.
 *
 * El tenant sale del subdominio ya resuelto server-side (I1) — el cliente no elige de qué Tienda
 * son los campos que ve, que es lo que impide que los de una Tienda aparezcan en otra.
 */
export async function getPropsCheckout(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsCheckout } | { notFound: true } | RedirectSSR> {
  // Se apoya en el helper de VENTA ⇒ hereda el gate de facturación (F05) sin repetirlo.
  const base = await getPropsPaginaComprador(ctx);
  if (!("props" in base)) return base;

  const campos = await listarCamposActivosDelStorefront({
    db,
    tenantSlug: base.props.tenantBranding.slug,
  });
  return { props: { ...base.props, campos } };
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
  // El FALLBACK on-the-fly desde las columnas de branding MURIÓ con ellas (admin-bases-pdf F07/D9):
  // tras el backfill ningún tenant lo recorría, y las columnas que lo alimentaban ya no existen. Toda
  // Tienda nace con su `StorefrontPage` en la MISMA $tx que el Tenant (`crearTienda`), así que "sin
  // documento" dejó de ser un estado alcanzable; si igual pasara, 404 neutral es la respuesta honesta.
  if (raw == null) return null;
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
): Promise<{ props: PropsHome } | { notFound: true } | RedirectSSR> {
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

  // Gate de venta por facturación (F05/D4): la tienda en pausa sirve la página neutral, no su catálogo.
  // EXCEPTO en preview: ese render es el canvas del editor del Organizador (ya `noindex`, nunca
  // público), y devolverle la página de pausa dentro del iframe le rompería la herramienta con la que
  // tiene que dejar la tienda lista para volver a vender.
  if (modo !== "borrador") {
    const pausa = await gateDeVentaSSR(res.branding.slug);
    if (pausa) return pausa;
  }

  const pagina = await cargarDocumentoParaRender({
    branding: res.branding,
    cual: modo === "borrador" ? "borrador" : "publicado",
  });
  // Desde F07/D9 ya NO hay fallback on-the-fly: una tienda sin `publishedJson` en su `home` da 404
  // neutral. No es dead code — es el fail-closed honesto (toda Tienda nace con su página en la misma
  // $tx que el Tenant, así que llegar acá significa que algo borró la fila).
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
): Promise<{ props: PropsPagina } | { notFound: true } | RedirectSSR> {
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

  // Mismo gate y misma excepción de preview que la home (F05/D4).
  if (modo !== "borrador") {
    const pausa = await gateDeVentaSSR(res.branding.slug);
    if (pausa) return pausa;
  }

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

/**
 * Borde SSR de la página neutral `/en-pausa` (F05/D4) — el destino al que el gate manda a los
 * visitantes de una Tienda que dejó de vender.
 *
 * Reconsulta el gate en vez de confiar en que se llegó por un redirect: así la página **no puede
 * quedar servida a una tienda que ya regularizó**. Si vuelve a vender, redirige a la home — un
 * "estamos en pausa" cacheado en el historial de alguien no debe sobrevivir al pago.
 */
export async function getPropsEnPausa(
  ctx: GetServerSidePropsContext,
): Promise<{ props: PropsStorefront } | { notFound: true } | RedirectSSR> {
  const res = await resolverBrandingSSR(ctx);
  if (res.zona !== "storefront") return { notFound: true }; // apex/host ajeno ⇒ 404 neutral

  const gate = await cargarGateVenta({ db, where: { slug: res.branding.slug } });
  if (gate.puedeVender) {
    return { redirect: { destination: "/", permanent: false } };
  }

  // `temaPagina: null` DELIBERADO (tema-paginas I4): esta página queda NEUTRAL, sin heredar el tema de
  // la Tienda. No es un olvido — es la única página del storefront que se sirve *en nombre de la
  // Plataforma* y no de la Tienda, y vestirla con la marca de la Tienda sugeriría que la pausa es una
  // decisión de ella. Tampoco usa `StorefrontLayout`.
  return { props: { tenantBranding: res.branding, temaPagina: null } };
}
