import { type GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del tema en `/entrega/[token]` (storefront-tema-paginas-plataforma F03/D9).
 *
 * Esta página es **host-agnóstica a propósito** y eso es lo que la hace alcanzable: el enlace que el
 * Comprador recibe por correo apunta al APEX de la plataforma, porque el correo no conoce subdominios.
 * Por eso su marca no sale del host sino del **tenant del GRANT** (server-authored desde el token), y
 * por eso el tema tiene que salir de la misma fuente. Un tema resuelto por host acá daría el tema de
 * plataforma (o nada) en la única puerta que ese Comprador tiene para llegar a lo que compró.
 *
 * Se ejercita el `getServerSideProps` REAL de la página con `resolverTemaPagina` REAL contra una `db`
 * mockeada, que es la única forma de ver con qué slug se consultó el tema.
 */

vi.mock("~/env", () => ({
  // Sin R2 configurado ⇒ la página degrada a solo íconos (no presigna miniaturas). No es el objeto de
  // este test y mantiene el mock chico.
  env: { R2_ENDPOINT: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET: "" },
}));
vi.mock("~/server/db", () => ({ db: { storefrontPage: { findFirst: vi.fn() } } }));
vi.mock("~/server/entrega/getEntregaDeOrden", () => ({ getEntregaDeOrden: vi.fn() }));
vi.mock("~/server/storage/storageDeEnv", () => ({ crearStorageDeEnv: vi.fn() }));

import { SCHEMA_VERSION, type Tema } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";
import { getEntregaDeOrden } from "~/server/entrega/getEntregaDeOrden";
import { getServerSideProps } from "~/pages/entrega/[token]";

const mockEntrega = vi.mocked(getEntregaDeOrden);
// eslint-disable-next-line @typescript-eslint/unbound-method -- es un vi.fn() del mock, no un método real
const mockFindFirst = vi.mocked(db.storefrontPage.findFirst);

/** La request llega por el APEX: es la URL que viaja en el correo (no hay subdominio que resolver). */
function ctxApex(token: string) {
  return {
    params: { token },
    req: { headers: { host: "sorteatelo.cl" } },
    query: {},
  } as unknown as GetServerSidePropsContext;
}

/** Lo que devuelve el grant: la marca de la Tienda dueña de la orden, resuelta desde el token. */
const entregaDeIselk = {
  branding: { slug: "iselk", nombre: "Iselk", colorPrimario: "#7239d5" },
  lineas: [],
} as never;

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

beforeEach(() => {
  mockEntrega.mockReset();
  mockFindFirst.mockReset();
  mockFindFirst.mockResolvedValue(
    docPublicado({ fondoPagina: "marca_suave", tipografia: "dulce", radio: "l" }),
  );
});

describe("/entrega/[token] — el tema sale del tenant del GRANT, no del host (F03/D9)", () => {
  // storefront.tema.entrega.001 — la página host-agnóstica igual sale con la marca de SU tienda
  it("con un token válido servido por el apex, hereda el tema de la tienda del grant", async () => {
    mockEntrega.mockResolvedValue(entregaDeIselk);

    const res = await getServerSideProps(ctxApex("tok-valido"));

    expect(res).toHaveProperty("props");
    const props = (res as { props: { temaPagina: Tema | null } }).props;
    expect(props.temaPagina).toMatchObject({
      fondoPagina: "marca_suave",
      tipografia: "dulce",
      radio: "l",
    });
    // Y el slug consultado es el del GRANT (`iselk`), no el host del apex.
    expect((mockFindFirst.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({
      slug: "home",
      tenant: { slug: "iselk" },
    });
  });

  // storefront.tema.entrega.002 — tienda con tema default ⇒ null (no-op byte-idéntico, D7/I6)
  it("tienda del grant con tema default ⇒ temaPagina null", async () => {
    mockEntrega.mockResolvedValue(entregaDeIselk);
    mockFindFirst.mockResolvedValue(docPublicado({}));

    const res = await getServerSideProps(ctxApex("tok-valido"));
    expect((res as { props: { temaPagina: Tema | null } }).props.temaPagina).toBeNull();
  });

  // storefront.tema.entrega.003 — I3: el 404 neutral del token inválido NO se movió
  it("token inexistente/vencido/no pagado sigue dando 404 neutral, sin consultar tema", async () => {
    mockEntrega.mockResolvedValue(null as never);

    expect(await getServerSideProps(ctxApex("tok-basura"))).toEqual({ notFound: true });
    // Nada de consultar el tema de una tienda cuyo grant no autorizó nada (y nada que delate por
    // temporización si el token existía o no, I3).
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
