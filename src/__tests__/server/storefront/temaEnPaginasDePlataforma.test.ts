import { type GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del CABLEADO del tema en los bordes SSR de las páginas de plataforma del storefront
 * (storefront-tema-paginas-plataforma F02/F03). El resolver ya tiene sus propios tests
 * (`temaPagina.test.ts`); acá se prueba la COMPOSICIÓN, que es donde estaba el defecto original: la home
 * salía tematizada y `/checkout` con el body blanco de plataforma.
 *
 * `resolverTemaPagina` corre DE VERDAD contra una `db` mockeada (no se stubea el seam) a propósito: lo
 * que hay que demostrar es que el `tenantSlug` con el que se consulta el tema sale del branding resuelto
 * SERVER-SIDE (I1) y no de un input, y eso solo se ve si la query real llega al mock.
 *
 * Lo otro que se vigila es que el campo nuevo no haya movido la semántica de zona/gate (I3): tienda en
 * pausa sigue redirigiendo en las páginas de VENTA, `/checkout/retorno` sigue SIN gate, apex sigue dando
 * `notFound`.
 */

vi.mock("~/env", () => ({ env: { STOREFRONT_PREVIEW_TOKEN: "tok-preview" } }));
vi.mock("~/server/db", () => ({
  db: {
    storefrontPage: { findFirst: vi.fn(), findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));
// Solo el data-loader de las bases se stubea; `serializarBases` (puro, el borde JSON) queda REAL.
vi.mock("~/server/storefront/basesDelSorteo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolverBasesDelSorteo: vi.fn(),
}));
vi.mock("~/server/storefront/resolverBranding", () => ({
  resolverBrandingDesdeHost: vi.fn(),
}));
vi.mock("~/server/storefront/repoBranding", () => ({ crearRepoBranding: vi.fn() }));
vi.mock("~/server/tenancy/configPlataforma", () => ({
  configPlataformaDesdeEnv: vi.fn(() => ({})),
}));
vi.mock("~/server/domain/facturacion/cargarGateVenta", () => ({
  cargarGateVenta: vi.fn(),
}));
vi.mock("~/server/domain/camposCheckout/camposActivos", () => ({
  listarCamposActivosDelStorefront: vi.fn(),
}));

import { SCHEMA_VERSION, type Tema } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";
import { listarCamposActivosDelStorefront } from "~/server/domain/camposCheckout/camposActivos";
import { cargarGateVenta } from "~/server/domain/facturacion/cargarGateVenta";
import { resolverBasesDelSorteo } from "~/server/storefront/basesDelSorteo";
import { getPropsBases } from "~/server/storefront/getBasesProps";
import {
  getPropsCheckout,
  getPropsPaginaComprador,
  getPropsPaginaEntrega,
} from "~/server/storefront/getStorefrontProps";
import { resolverBrandingDesdeHost } from "~/server/storefront/resolverBranding";

const mockBranding = vi.mocked(resolverBrandingDesdeHost);
const mockGate = vi.mocked(cargarGateVenta);
const mockCampos = vi.mocked(listarCamposActivosDelStorefront);
const mockBases = vi.mocked(resolverBasesDelSorteo);
// eslint-disable-next-line @typescript-eslint/unbound-method -- es un vi.fn() del mock, no un método real
const mockFindFirst = vi.mocked(db.storefrontPage.findFirst);
// eslint-disable-next-line @typescript-eslint/unbound-method -- idem
const mockFindMany = vi.mocked(db.storefrontPage.findMany);
// eslint-disable-next-line @typescript-eslint/unbound-method -- idem
const mockTenant = vi.mocked(db.tenant.findUnique);

const ctx = { req: { headers: { host: "iselk.sorteatelo.cl" } }, query: {} } as GetServerSidePropsContext;

/** Branding de una tienda publicada (lo que devuelve el núcleo puro tras resolver el subdominio). */
const brandingStorefront = {
  zona: "storefront",
  branding: { slug: "iselk", nombre: "Iselk", colorPrimario: "#7239d5" },
} as never;
const brandingApex = { zona: "plataforma" } as never;

/** Documento publicado con el tema dado (solo `root.props` importa acá). */
function docPublicado(props: Partial<Tema>) {
  return {
    publishedJson: {
      schemaVersion: SCHEMA_VERSION,
      root: { props },
      secciones: [],
      overlays: [],
    },
  } as never;
}

/** El tema custom de iselk: fondo lila, par `dulce` (Poppins/Nunito), radio `l`. */
const TEMA_ISELK: Partial<Tema> = {
  fondoPagina: "marca_suave",
  tipografia: "dulce",
  radio: "l",
};

beforeEach(() => {
  mockBranding.mockReset();
  mockGate.mockReset();
  mockCampos.mockReset();
  mockFindFirst.mockReset();
  mockFindMany.mockReset();
  mockTenant.mockReset();
  mockBases.mockReset();
  // Defaults del camino feliz: tienda publicada, al día, sin campos extra de checkout.
  mockBranding.mockResolvedValue(brandingStorefront);
  mockGate.mockResolvedValue({ puedeVender: true } as never);
  mockCampos.mockResolvedValue([]);
  mockFindFirst.mockResolvedValue(docPublicado(TEMA_ISELK));
  mockFindMany.mockResolvedValue([] as never); // sin páginas `enNav`
  mockTenant.mockResolvedValue(null as never); // sin chrome ⇒ header/footer actuales
  mockBases.mockResolvedValue({ pdfUrl: null, sorteo: null } as never);
});

describe("storefront — las páginas del Comprador heredan el tema de la Tienda (F02)", () => {
  // storefront.tema.props.001 — el caso de iselk: el checkout deja de salir con el body blanco
  it("getPropsCheckout incluye el temaPagina de la Tienda (sin perder los campos de checkout)", async () => {
    const res = await getPropsCheckout(ctx);

    expect(res).toHaveProperty("props");
    const props = (res as { props: { temaPagina: Tema | null; campos: unknown[] } }).props;
    expect(props.temaPagina).toMatchObject({
      fondoPagina: "marca_suave",
      tipografia: "dulce",
      radio: "l",
    });
    // El campo nuevo no desplaza lo que la página ya recibía (I3).
    expect(props.campos).toEqual([]);
  });

  // storefront.tema.props.002 — las tres páginas del Comprador heredan igual (venta Y entrega)
  it("getPropsPaginaComprador y getPropsPaginaEntrega también incluyen el temaPagina", async () => {
    for (const helper of [getPropsPaginaComprador, getPropsPaginaEntrega]) {
      const res = await helper(ctx);
      const props = (res as { props: { temaPagina: Tema | null } }).props;
      expect(props.temaPagina).toMatchObject({ fondoPagina: "marca_suave", tipografia: "dulce" });
    }
  });

  // storefront.tema.props.003 — D7/I6: tienda con tema default ⇒ null en las tres (no-op byte-idéntico)
  it("tienda con tema default ⇒ temaPagina null en las tres páginas", async () => {
    mockFindFirst.mockResolvedValue(docPublicado({}));

    for (const helper of [getPropsCheckout, getPropsPaginaComprador, getPropsPaginaEntrega]) {
      const res = await helper(ctx);
      expect((res as { props: { temaPagina: Tema | null } }).props.temaPagina).toBeNull();
    }
  });

  // storefront.tema.props.004 — I1: el slug del tema sale del branding SERVER-SIDE, no de un input
  it("consulta el tema del tenant resuelto server-side, no de la query del cliente", async () => {
    // Un ctx hostil: el cliente intenta colar OTRA tienda por querystring. El branding server-side
    // (subdominio) dice `iselk` y es el único que debe pesar (I1; lección del bug H1 de datawalt-app).
    const ctxHostil = {
      req: { headers: { host: "iselk.sorteatelo.cl" } },
      query: { tenantSlug: "otra-tienda", slug: "otra-tienda" },
    } as unknown as GetServerSidePropsContext;

    await getPropsCheckout(ctxHostil);

    const where = (mockFindFirst.mock.calls[0]?.[0] as { where: unknown }).where;
    expect(where).toEqual({ slug: "home", tenant: { slug: "iselk" } });
  });

  // storefront.tema.props.005 — I3: el campo nuevo NO movió la semántica de zona ni de gate
  it("zona y gate intactos: pausa redirige en VENTA, retorno no gatea, apex da notFound", async () => {
    // (a) Tienda en pausa por facturación ⇒ las páginas de VENTA siguen mandando a `/en-pausa`.
    mockGate.mockResolvedValue({ puedeVender: false } as never);
    for (const helper of [getPropsCheckout, getPropsPaginaComprador]) {
      expect(await helper(ctx)).toEqual({
        redirect: { destination: "/en-pausa", permanent: false },
      });
    }

    // (b) `/checkout/retorno` sigue SIN gate: quien acaba de pagar no pierde su comprobante porque el
    // Organizador esté moroso (I3/I5). Y ahora además hereda el tema.
    const retorno = await getPropsPaginaEntrega(ctx);
    expect(retorno).toHaveProperty("props");
    expect((retorno as { props: { temaPagina: Tema | null } }).props.temaPagina).not.toBeNull();

    // (c) Apex/host sin Tienda publicada ⇒ `notFound` neutral, sin tocar el tema (ADR-0007).
    mockBranding.mockResolvedValue(brandingApex);
    mockFindFirst.mockClear();
    for (const helper of [getPropsCheckout, getPropsPaginaComprador, getPropsPaginaEntrega]) {
      expect(await helper(ctx)).toEqual({ notFound: true });
    }
    expect(mockFindFirst).not.toHaveBeenCalled(); // no se consulta el tema de una tienda que no hay
  });
});

describe("storefront — /bases hereda el tema de la Tienda (F03)", () => {
  // storefront.tema.props.006 — el tema entra al Promise.all sin alterar bases/nav/chrome
  it("getPropsBases incluye temaPagina y no altera bases, nav ni chrome", async () => {
    const res = await getPropsBases(ctx);

    expect(res).toHaveProperty("props");
    const props = (res as {
      props: { temaPagina: Tema | null; pdfUrl: string | null; sorteo: unknown; navItems: unknown[]; chrome: unknown };
    }).props;
    expect(props.temaPagina).toMatchObject({ fondoPagina: "marca_suave", tipografia: "dulce" });
    // El resto de la página sigue igual: es la URL legal que el footer publica en toda la tienda
    // (ADR-0008) y el estado vacío neutral (D5) no se puede haber movido. El nav llega COMPUESTO
    // (follow-up navbar): sin secciones `nav.incluir` en el doc del mock ni páginas `enNav` ⇒ `[]`.
    expect(props.pdfUrl).toBeNull();
    expect(props.sorteo).toBeNull();
    expect(props.navItems).toEqual([]);
    expect(props.chrome).toBeNull();
  });

  // storefront.tema.props.007 — apex/host ajeno ⇒ 404 neutral, sin consultar el tema
  it("fuera de un storefront sigue dando notFound sin tocar el tema", async () => {
    mockBranding.mockResolvedValue(brandingApex);

    expect(await getPropsBases(ctx)).toEqual({ notFound: true });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
