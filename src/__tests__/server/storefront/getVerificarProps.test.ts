import { type GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del borde SSR de la página `/verificar` (verificador-tickets F03, D10). Espeja a
 * `getBasesProps`: fail-closed en la ZONA (apex u host sin Tienda publicada ⇒ 404 neutral) y
 * fail-soft en el CONTENIDO (sin sorteo activo la página igual renderiza, con su estado vacío).
 *
 * Lo que se vigila acá y no en el use case: que el `tenantSlug` con el que se consulta salga del
 * branding resuelto SERVER-SIDE (I1) y que las props sean **JSON puro** — un `Date` crudo en las
 * props hace lanzar a Next en runtime (500 en la tienda entera), y esta página lleva la `fechaFin`
 * del sorteo, que es exactamente el tipo de dato que se cuela por un spread.
 */

vi.mock("~/env", () => ({ env: { STOREFRONT_PREVIEW_TOKEN: "tok-preview" } }));
vi.mock("~/server/db", () => ({
  db: {
    storefrontPage: { findFirst: vi.fn(), findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    raffle: { findFirst: vi.fn() },
  },
}));
vi.mock("~/server/storefront/resolverBranding", () => ({
  resolverBrandingDesdeHost: vi.fn(),
}));
vi.mock("~/server/storefront/repoBranding", () => ({ crearRepoBranding: vi.fn() }));
vi.mock("~/server/tenancy/configPlataforma", () => ({
  configPlataformaDesdeEnv: vi.fn(() => ({})),
}));

import { SCHEMA_VERSION } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";
import { getPropsVerificar, type PropsVerificar } from "~/server/storefront/getVerificarProps";
import { resolverBrandingDesdeHost } from "~/server/storefront/resolverBranding";

const mockBranding = vi.mocked(resolverBrandingDesdeHost);
// eslint-disable-next-line @typescript-eslint/unbound-method -- es un vi.fn() del mock, no un método real
const mockPageFindFirst = vi.mocked(db.storefrontPage.findFirst);
// eslint-disable-next-line @typescript-eslint/unbound-method -- idem
const mockPageFindMany = vi.mocked(db.storefrontPage.findMany);
// eslint-disable-next-line @typescript-eslint/unbound-method -- idem
const mockTenant = vi.mocked(db.tenant.findUnique);
// eslint-disable-next-line @typescript-eslint/unbound-method -- idem
const mockRaffle = vi.mocked(db.raffle.findFirst);

const ctx = {
  req: { headers: { host: "iselk.sorteatelo.cl" } },
  query: {},
} as GetServerSidePropsContext;

const brandingStorefront = {
  zona: "storefront",
  branding: { slug: "iselk", nombre: "Iselk", colorPrimario: "#7239d5" },
} as never;
const brandingApex = { zona: "plataforma" } as never;

/** El sorteo ACTIVO tal como lo devuelve Prisma: con `fechaFin` como `Date` (el tipo honesto). */
const sorteoActivo = {
  nombre: "Sorteo de lanzamiento",
  premio: "Un viaje a Seúl",
  fechaFin: new Date("2026-08-31T03:00:00.000Z"),
} as never;

beforeEach(() => {
  mockBranding.mockReset();
  mockPageFindFirst.mockReset();
  mockPageFindMany.mockReset();
  mockTenant.mockReset();
  mockRaffle.mockReset();
  // Camino feliz: tienda publicada, sin tema custom, sin páginas en nav, sin chrome, con sorteo.
  mockBranding.mockResolvedValue(brandingStorefront);
  mockPageFindFirst.mockResolvedValue({
    publishedJson: {
      schemaVersion: SCHEMA_VERSION,
      root: { props: {} },
      secciones: [],
      overlays: [],
    },
  } as never);
  mockPageFindMany.mockResolvedValue([] as never);
  mockTenant.mockResolvedValue(null as never);
  mockRaffle.mockResolvedValue(sorteoActivo);
});

describe("server/storefront/getVerificarProps (borde SSR de /verificar, F03)", () => {
  // verificar.props.001 — fail-closed en la ZONA: el apex no tiene tienda que verificar
  it("apex u host sin Tienda publicada ⇒ notFound, sin consultar el sorteo", async () => {
    mockBranding.mockResolvedValue(brandingApex);

    expect(await getPropsVerificar(ctx)).toEqual({ notFound: true });
    expect(mockRaffle).not.toHaveBeenCalled();
  });

  // verificar.props.002 — fail-SOFT en el contenido: sin sorteo activo la página NO se cae, y el
  // resto de las props (branding/nav/chrome/tema) llegan completas. Es lo que sostiene que el link
  // pueda ir pinned en TODAS las tiendas (D8) sin preguntarle nada a la DB al pintar el header.
  it("tenant sin sorteo activo ⇒ sorteo null y el resto de las props completas", async () => {
    mockRaffle.mockResolvedValue(null as never);

    const res = await getPropsVerificar(ctx);

    expect(res).toHaveProperty("props");
    const props = (res as { props: PropsVerificar }).props;
    expect(props.sorteo).toBeNull();
    expect(props.tenantBranding).toMatchObject({ slug: "iselk", nombre: "Iselk" });
    expect(props.navItems).toEqual([]);
    expect(props.chrome).toBeNull();
    expect(props.temaPagina).toBeNull(); // tienda con tema default ⇒ no-op byte-idéntico
  });

  // verificar.props.003 — las props son JSON puro. El round-trip espeja EXACTAMENTE lo que hace
  // Next al serializar; `toStrictEqual` y no `toEqual` porque `toEqual` ignora las claves
  // `undefined`, que Next TAMBIÉN rechaza. Sin esto, la `fechaFin` del sorteo (un `Date`) sería un
  // 500 en la tienda entera — el pie del que `/bases` ya se cayó una vez.
  it("las props sobreviven el round-trip JSON (ninguna Date cruda)", async () => {
    const res = await getPropsVerificar(ctx);
    const props = (res as { props: PropsVerificar }).props;

    expect(JSON.parse(JSON.stringify(props))).toStrictEqual(props);
    expect(props.sorteo).toEqual({
      nombre: "Sorteo de lanzamiento",
      premio: "Un viaje a Seúl",
      fechaFinIso: "2026-08-31T03:00:00.000Z",
    });
  });

  // verificar.props.004 — I1: el sorteo se busca por el tenant resuelto SERVER-SIDE del host, no por
  // lo que venga en la query. Un ctx hostil que intenta colar otra tienda no mueve la consulta.
  it("consulta el sorteo del tenant resuelto server-side, no de la query del cliente", async () => {
    const ctxHostil = {
      req: { headers: { host: "iselk.sorteatelo.cl" } },
      query: { tenantSlug: "otra-tienda", slug: "otra-tienda" },
    } as unknown as GetServerSidePropsContext;

    await getPropsVerificar(ctxHostil);

    const args = mockRaffle.mock.calls[0]?.[0] as { where: unknown; orderBy: unknown };
    expect(args.where).toEqual({ estado: "ACTIVO", tenant: { slug: "iselk" } });
    // El MISMO desempate que usa `verificarTickets`: si hubiera dos sorteos ACTIVO (invariante de
    // use case, no constraint de DB), el encabezado y la búsqueda tienen que hablar del mismo.
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });
});
