import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { resolverCatalogo } from "~/server/domain/checkout/resolverCatalogo";

/**
 * Tests del resolver de RENDER del catálogo (F05, ADR-0016/0017). Verifica que descarta lo
 * inactivo/ajeno, respeta el orden del documento en `modo:'seleccion'`, y computa el precio como
 * número (dato derivado server-side). Fake db que emula el filtrado de Prisma.
 *
 * **ENMIENDA v2 (E13/E15/E18)**: el fake también emula el `modalidad: { not: "SOBRE" }` del
 * resolver, porque de ese `where` depende que una COLECCIÓN nunca llegue a la vitrina. Un fake que
 * ignorara la condición dejaría pasar los tests con el resolver roto — que es exactamente la forma
 * en que un fake miente.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  portadaUrl: string | null;
  participaEnSorteo: boolean;
  activo: boolean;
  createdAt: Date;
  /**
   * `SOBRE` = COLECCIÓN (dueña de un pool, no se vende directo y no se muestra). Bajo V-I7 un PACK
   * se persiste SIEMPRE `ESTANDAR`, así que esta columna alcanza como discriminante.
   */
  modalidad: "ESTANDAR" | "SOBRE";
  /** Cuántas unidades entrega una unidad de este producto (1 = producto normal). */
  unidadesPorPack: number;
  /** De dónde salen sus archivos: `null` = propios; si no, la fuente y SU modalidad. */
  fuente: { modalidad: "ESTANDAR" | "SOBRE" } | null;
  /** Dato server-only que jamás debe aparecer en la proyección (D10/I2/V-I6). */
  pdfPath: string | null;
}

const dec = (v: string) => new Prisma.Decimal(v);

const prod = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p",
  tenantId: "A",
  titulo: "Producto",
  descripcion: "d",
  precio: dec("3000"),
  portadaUrl: null,
  participaEnSorteo: false,
  activo: true,
  createdAt: new Date(),
  modalidad: "ESTANDAR",
  unidadesPorPack: 1,
  fuente: null,
  pdfPath: "A/secreto.pdf",
  ...over,
});

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: {
          tenantId: string;
          activo?: boolean;
          modalidad?: { not: "SOBRE" };
          id?: { in: string[] };
        };
        orderBy?: { createdAt: "desc" };
      }) => {
        let res = productos.filter(
          (p) =>
            p.tenantId === where.tenantId &&
            (where.activo === undefined || p.activo === where.activo) &&
            // El corte que esconde las colecciones (E15). Se emula honrando el `not` en vez de
            // asumirlo: si el resolver dejara de mandarlo, estos tests tienen que ponerse rojos.
            (where.modalidad === undefined || p.modalidad !== where.modalidad.not) &&
            (where.id === undefined || where.id.in.includes(p.id)),
        );
        if (orderBy?.createdAt === "desc") {
          res = [...res].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return res;
      },
    },
  } as unknown as PrismaClient;
}

describe("domain/checkout/resolverCatalogo (render del page builder)", () => {
  // page.render.resolver.001 — modo 'todos' devuelve solo activos del tenant, precio como número
  it("modo 'todos' devuelve los activos del tenant con precio numérico", async () => {
    const db = fakeDb([
      prod({ id: "act", activo: true, precio: dec("3000") }),
      prod({ id: "inact", activo: false }),
      prod({ id: "ajeno", tenantId: "B" }),
    ]);
    const res = await resolverCatalogo({ db, tenantId: "A", modo: "todos" });
    expect(res.map((p) => p.id)).toEqual(["act"]);
    expect(res[0]!.precio).toBe(3000); // dato derivado server-side (Decimal ⇒ number)
    expect(typeof res[0]!.precio).toBe("number");
  });

  // page.render.resolver.002 — modo 'seleccion' respeta el orden del documento y descarta ajeno/inactivo
  it("modo 'seleccion' respeta el orden del documento y descarta ajeno/inactivo", async () => {
    const db = fakeDb([
      prod({ id: "p1", tenantId: "A", activo: true }),
      prod({ id: "p2", tenantId: "A", activo: true }),
      prod({ id: "p3inact", tenantId: "A", activo: false }),
      prod({ id: "pajeno", tenantId: "B", activo: true }),
    ]);
    // El documento pide [p2, p1, p3inact, pajeno]; el resolver devuelve [p2, p1] en ESE orden.
    const res = await resolverCatalogo({
      db,
      tenantId: "A",
      modo: "seleccion",
      productoIds: ["p2", "p1", "p3inact", "pajeno"],
    });
    expect(res.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  // page.render.resolver.003 — seleccion sin ids ⇒ vacío
  it("modo 'seleccion' sin productoIds ⇒ catálogo vacío", async () => {
    const db = fakeDb([prod({ id: "p1", tenantId: "A" })]);
    expect(await resolverCatalogo({ db, tenantId: "A", modo: "seleccion", productoIds: [] })).toEqual([]);
    expect(await resolverCatalogo({ db, tenantId: "A", modo: "seleccion" })).toEqual([]);
  });

  // page.render.resolver.004 (Tanda 2 F13) — esNuevo derivado de createdAt (<30d ⇒ true), read-only
  it("marca esNuevo cuando el producto fue creado hace menos de 30 días (badge 'Nuevo')", async () => {
    const ahora = Date.now();
    const diasAtras = (n: number) => new Date(ahora - n * 24 * 60 * 60 * 1000);
    const db = fakeDb([
      prod({ id: "recien", createdAt: diasAtras(3) }),
      prod({ id: "antiguo", createdAt: diasAtras(45) }),
    ]);
    const res = await resolverCatalogo({ db, tenantId: "A", modo: "todos" });
    const porId = new Map(res.map((p) => [p.id, p]));
    expect(porId.get("recien")!.esNuevo).toBe(true);
    expect(porId.get("antiguo")!.esNuevo).toBe(false);
  });

  /*
    page.render.resolver.005 (ENMIENDA v2, E15/E18) — una COLECCIÓN nunca aparece en el catálogo, ni
    en `modo:'todos'` ni cuando el Organizador la eligió A MANO en el editor.

    Los dos modos van en el MISMO test porque son dos `findMany` distintos en el resolver: la
    condición está escrita dos veces y olvidarla en una de las dos es el error natural. El modo
    selección es además el más peligroso — ahí el id lo puso una persona, así que "no la elijas" no
    es defensa: la colección se descarta en silencio, igual que lo inactivo.

    Que la colección se cuele no es cosmético: su `Product.precio` es un valor de REFERENCIA que no
    se cobra en ninguna parte, y el checkout la rechaza (`checkout.pack.003`). Sería una tarjeta con
    un precio mentiroso y un botón que revienta.
  */
  it("una colección (modalidad SOBRE) nunca entra al catálogo, ni siquiera elegida a mano", async () => {
    const db = fakeDb([
      prod({ id: "coleccion", modalidad: "SOBRE", precio: dec("999") }),
      prod({ id: "pack", unidadesPorPack: 4, fuente: { modalidad: "SOBRE" } }),
      prod({ id: "normal" }),
    ]);

    const todos = await resolverCatalogo({ db, tenantId: "A", modo: "todos" });
    expect(todos.map((p) => p.id).sort()).toEqual(["normal", "pack"]);

    const elegidos = await resolverCatalogo({
      db,
      tenantId: "A",
      modo: "seleccion",
      productoIds: ["coleccion", "pack", "normal"],
    });
    expect(elegidos.map((p) => p.id)).toEqual(["pack", "normal"]);
  });

  /*
    page.render.resolver.006 (ENMIENDA v2, E13/E18/V-I6) — un PACK es una tarjeta normal del
    catálogo, con dos detalles derivados server-side y NADA más.

    `unidadesPorPack` y `entregaAlAzar` son lo único que la tarjeta necesita saber del origen. Se
    asserta la proyección con `toEqual` sobre las CLAVES y no con `toMatchObject` a propósito: lo
    que este test protege es tanto lo que está como lo que NO —ni `pdfPath`, ni `fuenteId`, ni un
    conteo del pool—. Cuántos archivos tiene la colección es inventario de la Tienda, y filtrarlo
    por una tarjeta pública sería la fuga más tonta posible (D10/V-I6).
  */
  it("un pack sale como tarjeta normal con sus detalles derivados y sin filtrar nada del pool", async () => {
    const db = fakeDb([
      prod({ id: "packAzar", titulo: "4 stickers", precio: dec("10000"), unidadesPorPack: 4, fuente: { modalidad: "SOBRE" } }),
      prod({ id: "packLibro", titulo: "Pack 4 libros", unidadesPorPack: 4, fuente: { modalidad: "ESTANDAR" } }),
      prod({ id: "normal" }),
    ]);
    const res = await resolverCatalogo({ db, tenantId: "A", modo: "todos" });
    const porId = new Map(res.map((p) => [p.id, p]));

    // Fuente SOBRE ⇒ lo que entrega sale al azar del pool.
    expect(porId.get("packAzar")).toMatchObject({
      titulo: "4 stickers",
      precio: 10000,
      unidadesPorPack: 4,
      entregaAlAzar: true,
    });
    // Fuente ESTANDAR (el caso libro): entrega 4, pero de azar nada — son 4 copias del mismo libro.
    expect(porId.get("packLibro")).toMatchObject({ unidadesPorPack: 4, entregaAlAzar: false });
    // Producto normal: el default honesto, no un relleno (entrega 1 unidad de lo suyo).
    expect(porId.get("normal")).toMatchObject({ unidadesPorPack: 1, entregaAlAzar: false });

    // La FORMA de la proyección, entera: nada de keys ni de tamaño del pool.
    expect(Object.keys(porId.get("packAzar")!).sort()).toEqual(
      [
        "descripcion",
        "entregaAlAzar",
        "esNuevo",
        "id",
        "participaEnSorteo",
        "portadaUrl",
        "precio",
        "titulo",
        "unidadesPorPack",
      ].sort(),
    );
  });
});
