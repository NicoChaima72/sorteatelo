import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests de `resolverTemaPagina` (storefront-tema-paginas-plataforma F01, D2/D3/D6/D7): el resolver SSR
 * que deja que las páginas de PLATAFORMA del storefront (`/checkout`, `/producto/[id]`,
 * `/checkout/retorno`, `/bases`, `/entrega/[token]`) hereden el tema MÍNIMO de la Tienda en vez de salir
 * con el "body blanco de plataforma".
 *
 * Lo que se vigila acá:
 *  - **D2/I7**: la fuente es el `publishedJson` de la página `home` — NUNCA el borrador (jamás servir un
 *    draft en una página pública), leído tolerante (`leerDocumentoParaRender`, I9).
 *  - **D6/I8**: la HERENCIA MÍNIMA es estructural en el resolver, no disciplina de cada página: el tema
 *    que sale trae solo `fondoPagina`/`tipografia`/`radio`/`modo` de la Tienda y TODO lo demás en su
 *    default. Importa de verdad porque `_app.tsx` inyecta una regla CSS global si `escalaTitulos:"poster"`
 *    viaja en `temaPagina`: un checkout no debe heredar los títulos-poster de la home.
 *  - **D7/I6**: tema default ⇒ `null`, para que la tienda sin tematizar quede byte-idéntica a hoy (ni
 *    `mergeThemeOverrides`, ni `<style>` extra, ni `style=` inline en el shell).
 *  - **I2**: el storefront JAMÁS 500ea por el tema — sin fila, sin published, JSON podrido o query que
 *    lanza degradan a `null`.
 *
 * La `db` se mockea (mismo patrón que `getEditorProps.test.ts`) porque lo que se prueba es el CONTRATO
 * del resolver ante cada estado de la fila, no el motor de Prisma.
 */

vi.mock("~/server/db", () => ({
  db: { storefrontPage: { findFirst: vi.fn() } },
}));

import { SCHEMA_VERSION, TemaSchema, type Tema } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";
import { resolverTemaPagina } from "~/server/storefront/temaPagina";

// eslint-disable-next-line @typescript-eslint/unbound-method -- es un vi.fn() del mock, no un método real
const mockFindFirst = vi.mocked(db.storefrontPage.findFirst);

/** El tema default del schema (la referencia de D7: "exactamente el default" ⇒ `null`). */
const DEFAULT: Tema = TemaSchema.parse({});

/** Documento publicado mínimo con el tema `props` dado (sin secciones: acá solo importa `root.props`). */
function docPublicado(props: Partial<Tema>) {
  return {
    schemaVersion: SCHEMA_VERSION,
    root: { props },
    secciones: [],
    overlays: [],
  };
}

/** La fila que devuelve la query (solo `publishedJson`, I7). */
function fila(publishedJson: unknown) {
  return { publishedJson } as never;
}

beforeEach(() => {
  mockFindFirst.mockReset();
});

describe("storefront/resolverTemaPagina — herencia mínima del tema de la Tienda (F01)", () => {
  // storefront.tema.resolver.001 — el caso de iselk: fondo lila + Poppins + radio l llegan al checkout
  it("devuelve los 4 campos heredados del tema publicado de la home", async () => {
    mockFindFirst.mockResolvedValue(
      fila(
        docPublicado({
          fondoPagina: "marca_suave",
          tipografia: "dulce",
          radio: "l",
          modo: "claro",
        }),
      ),
    );

    const tema = await resolverTemaPagina({ tenantSlug: "iselk" });

    expect(tema).not.toBeNull();
    expect(tema).toMatchObject({
      fondoPagina: "marca_suave",
      tipografia: "dulce",
      radio: "l",
      modo: "claro",
    });
  });

  // storefront.tema.resolver.002 — D6/I8: la herencia mínima es ESTRUCTURAL, no disciplina de página
  it("normaliza a su default TODO lo que no se hereda, aunque el published traiga otros valores", async () => {
    mockFindFirst.mockResolvedValue(
      fila(
        docPublicado({
          // Los 4 que SÍ se heredan.
          fondoPagina: "tinta_profunda",
          tipografia: "cartel",
          radio: "completo",
          modo: "oscuro",
          // Los que NO: ambiente (los glows de stage-lights no aplican a un form de pago),
          // anchoContenido (la columna estrecha editorial no aplica a un checkout), escalaTitulos
          // (`_app` inyecta una regla CSS GLOBAL de títulos-poster si esto viaja) y `vibe`.
          ambiente: "neon",
          anchoContenido: "estrecho",
          escalaTitulos: "poster",
          vibe: "editorial",
        }),
      ),
    );

    const tema = await resolverTemaPagina({ tenantSlug: "demo-noche" });

    // Igualdad EXACTA contra el default + los 4 heredados: si mañana `TemaSchema` gana un campo, este
    // test exige que nazca NO heredado (fail-closed) en vez de colarse en las páginas de plataforma.
    expect(tema).toEqual({
      ...DEFAULT,
      fondoPagina: "tinta_profunda",
      tipografia: "cartel",
      radio: "completo",
      modo: "oscuro",
    });
  });

  // storefront.tema.resolver.003 — D7/I6: la tienda sin tematizar queda BYTE-idéntica a hoy
  it("tema exactamente default ⇒ null (y no un Tema de defaults)", async () => {
    mockFindFirst.mockResolvedValue(fila(docPublicado({})));

    // Un `Tema` de defaults sería *visualmente* no-op igual (`radio:"m"` ⇒ el `defaultRadius` que ya
    // tiene el theme base; `superficie` ⇒ `var(--mantine-color-body)` = el body actual). `null` lo hace
    // BYTE-idéntico: sin `mergeThemeOverrides`, sin `<style>` extra en el `<head>` y sin `style=` inline
    // en el shell. Es la convención de los precedentes del builder (defaults no-op sin v-bump).
    expect(await resolverTemaPagina({ tenantSlug: "autora" })).toBeNull();
  });

  // storefront.tema.resolver.004 — "tras normalizar": custom SOLO en lo no-heredado ⇒ nada que heredar
  it("tema con custom SOLO en campos no heredados ⇒ null (no un shell pintado de gratis)", async () => {
    mockFindFirst.mockResolvedValue(
      fila(docPublicado({ ambiente: "aurora", escalaTitulos: "poster" })),
    );

    // La tienda tematizó su home con stage-lights y títulos-poster, pero dejó fondo/tipografía/radio/modo
    // en default: para las páginas de plataforma NO hay nada que heredar. Sin esta composición
    // (normalizar ANTES de comparar) el resolver devolvería un Tema de defaults y les metería un
    // `style=` inline y un `mergeThemeOverrides` que no cambian ni un píxel.
    expect(await resolverTemaPagina({ tenantSlug: "demo-dreamy" })).toBeNull();
  });

  // storefront.tema.resolver.004b — el campo nuevo `ambienteAnimado` (focos-animados F01/D2) cae del
  // lado NO heredado, como el `ambiente` que anima: una tienda que prende sus luces en la home no le
  // mete un shell pintado ni un `style=` inline al checkout. Con SOLO ese campo custom ⇒ sigue `null`.
  it("prender las luces del shell no se hereda a las páginas de plataforma (sigue null)", async () => {
    mockFindFirst.mockResolvedValue(
      fila(docPublicado({ ambiente: "neon", ambienteAnimado: true })),
    );

    expect(await resolverTemaPagina({ tenantSlug: "demo-noche" })).toBeNull();
  });

  // storefront.tema.resolver.005 — sin fila `StorefrontPage` para `home` ⇒ null (I2)
  it("sin fila de la home ⇒ null", async () => {
    mockFindFirst.mockResolvedValue(null as never);
    expect(await resolverTemaPagina({ tenantSlug: "sin-pagina" })).toBeNull();
  });

  // storefront.tema.resolver.006 — fila con `publishedJson` null (tienda que nunca publicó) ⇒ null
  it("fila sin publishedJson ⇒ null (nunca publicó)", async () => {
    mockFindFirst.mockResolvedValue(fila(null));
    expect(await resolverTemaPagina({ tenantSlug: "solo-borrador" })).toBeNull();
  });

  // storefront.tema.resolver.007 — I9/I2: JSON podrido degrada, NO tumba la página
  it("publishedJson podrido/incompleto ⇒ no lanza y degrada a null", async () => {
    for (const basura of [
      "no soy un documento",
      42,
      {},
      { root: "roto" },
      { root: { props: { fondoPagina: "no-existe-este-esquema" } } },
      { schemaVersion: 99, root: null, secciones: "no-es-array" },
    ]) {
      mockFindFirst.mockResolvedValue(fila(basura));
      // `/checkout` con un documento corrupto tiene que seguir cobrando: quedarse sin el fondo lila es
      // cosmético, caerse acá es una venta perdida.
      await expect(
        resolverTemaPagina({ tenantSlug: "podrida" }),
      ).resolves.toBeNull();
    }
  });

  // storefront.tema.resolver.008 — I2/D3: defensiva como `resolverChrome` (query que lanza ⇒ null)
  it("si la query lanza (cliente Prisma stale, fallo transitorio) ⇒ null", async () => {
    mockFindFirst.mockRejectedValue(new Error("column StorefrontPage.publishedJson does not exist"));

    // Es el escenario real de un deploy sin restart del dev server: el cliente Prisma queda stale y la
    // query tira. El storefront JAMÁS 500ea por el tema (I2).
    expect(await resolverTemaPagina({ tenantSlug: "iselk" })).toBeNull();
  });

  // storefront.tema.resolver.009 — I7/I1: SOLO published, SOLO la home, SOLO ese tenant
  it("lee únicamente publishedJson de la home del tenant, jamás el borrador", async () => {
    mockFindFirst.mockResolvedValue(fila(docPublicado({ fondoPagina: "marfil" })));

    await resolverTemaPagina({ tenantSlug: "demo-editorial" });

    const args = mockFindFirst.mock.calls[0]?.[0] as {
      where: unknown;
      select: Record<string, boolean>;
    };
    // Tenant scopeado server-side por slug (I1) — jamás por input del cliente.
    expect(args.where).toEqual({ slug: "home", tenant: { slug: "demo-editorial" } });
    // Un borrador NO se sirve en una página pública (I7). Ni seleccionarlo: no queremos el dato a mano
    // para equivocarnos más tarde.
    expect(args.select).toEqual({ publishedJson: true });
    expect(args.select.draftJson).toBeUndefined();
  });
});
