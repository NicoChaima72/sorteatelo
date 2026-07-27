import { type GetServerSidePropsContext } from "next";
import { describe, expect, it } from "vitest";

import { getServerSideProps } from "~/pages/producto/[id]";

/**
 * `/producto/[id]` quedó RETIRADA con la ENMIENDA v2 (E2/F13): el detalle existía para alojar el
 * selector de packs, y bajo el modelo v2 un pack es un producto con su propia tarjeta ⇒ el detalle
 * era un click de más entre el Comprador y el carrito.
 *
 * Se testea porque el redirect es una PROMESA hacia afuera: la ruta estuvo publicada, así que hay
 * enlaces vivos (compartidos, indexados, en el historial de alguien). Lo que se puede romper sin
 * que nada más lo note es que alguien "reviva" la página con un `getServerSideProps` que intente
 * resolver el producto — y entonces los ids que ya no existen empezarían a dar 500 o 404 en vez de
 * llevar al catálogo.
 */
const ctx = (id: string) =>
  ({
    params: { id },
    query: { id },
    req: { headers: { host: "prueba.localhost:3001" } },
    res: {},
    resolvedUrl: `/producto/${id}`,
  }) as unknown as GetServerSidePropsContext;

describe("pages/producto/[id] — retirada (ENMIENDA v2, E2/F13)", () => {
  /*
    storefront.producto.retirado.001 — CUALQUIER id redirige al home, sin distinguir entre uno que
    existe, uno inexistente y uno de otra Tienda.

    Esa indistinción es la propiedad, no un detalle: la página no lee la DB, así que no hay dato
    que filtrar ni tenant que resolver, y por eso tampoco necesita el gate de venta del borde
    (`facturacion.gate.borde.003` la sacó de su lista). Si algún día vuelve a consultar algo, este
    test se pone rojo antes de que nadie note el cambio de comportamiento.
  */
  it("redirige al home de la misma Tienda para cualquier id, sin leer nada", async () => {
    for (const id of ["cms2apsqx000cnik84txlnr0y", "no-existe", ""]) {
      const res = await getServerSideProps(ctx(id));
      expect(res).toEqual({
        // Relativo: resuelve al host que lo pidió, así que un enlace del subdominio de una Tienda
        // aterriza en el catálogo de ESA Tienda y no en el apex de la plataforma.
        redirect: { destination: "/", permanent: false },
      });
    }
  });

  /*
    storefront.producto.retirado.002 — el redirect es TEMPORAL (307), no permanente (308).

    Parece un nit y no lo es: un 308 se cachea en el navegador de forma prácticamente irreversible,
    y esta decisión tiene días. Si el retiro se confirma, subirlo a permanente es cambiar una
    palabra — pero hacerlo por accidente es irreparable en el equipo de cada visitante.
  */
  it("usa un redirect temporal, no uno permanente cacheable para siempre", async () => {
    const res = await getServerSideProps(ctx("x"));
    // `Redirect` de Next es una union (`permanent` | `statusCode`); se asserta sobre el objeto
    // entero para no tener que elegir rama y para que cambiar de forma también rompa el test.
    expect("redirect" in res ? res.redirect : null).toEqual({
      destination: "/",
      permanent: false,
    });
  });
});
