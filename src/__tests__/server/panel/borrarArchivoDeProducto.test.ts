import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { borrarArchivoDeProducto } from "~/server/domain/panel/borrarArchivoDeProducto";

/**
 * Tests del use case `borrarArchivoDeProducto` (productos-tipos-digitales F06, D4/I7) con `db` FAKE.
 *
 * El comportamiento que el plan declara para F06: **un archivo del pool con asignaciones existentes
 * no se puede borrar** — la descarga del Comprador que pagó ya es una promesa. La DB lo sostiene con
 * `onDelete: Restrict` (testeado contra Postgres en `schema/sobreSorpresa.test.ts::sobre.schema.005`);
 * acá se testea que el use case lo detecte ANTES y responda con un mensaje humano en vez de dejar
 * estallar un P2003 como 500.
 *
 * Segundo guard (fail-closed, I7): borrar no puede dejar A LA VENTA algo sin nada que entregar. Con
 * la **ENMIENDA v2** (E17) eso son DOS preguntas, y la segunda es la que importa en el caso stickers:
 *
 *  (a) el producto MISMO, si se vende directo y está activo;
 *  (b) los **PACKS ACTIVOS** que entregan el contenido de este producto. Acá está el cambio de
 *      semántica que trajo la enmienda: el `activo` de una COLECCIÓN ya no dice nada (una colección
 *      no se vende), así que lo que decide si un archivo se puede sacar es si algún pack a la venta
 *      dejaría de poder armarse. Antes de v2 el guard miraba el `activo` del sobre y sus opciones de
 *      pack; ahora mira los packs, que son productos aparte.
 */

interface ArchivoFake {
  id: string;
  tenantId: string;
  productId: string;
  key: string;
  confirmadoAt: Date | null;
  asignaciones: number;
}

interface ProductoFake {
  id: string;
  tenantId: string;
  activo: boolean;
  modalidad: "ESTANDAR" | "SOBRE";
  pdfPath: string | null;
  /** Cuántos `ProductFile` CONFIRMADOS tiene HOY (incluye el que se intenta borrar). */
  archivosConfirmados: number;
  /**
   * Los PACKS **A LA VENTA** que entregan el contenido de este producto (E17). El fake los recibe ya
   * filtrados a los activos porque eso es lo que hace el `where` del select real.
   */
  packs: Array<{ titulo: string; unidadesPorPack: number }>;
}

function fakeDb(archivos: ArchivoFake[], productos: ProductoFake[]) {
  const borradas: string[] = [];
  const db = {
    productFile: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const a = archivos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return a
          ? {
              id: a.id,
              key: a.key,
              productId: a.productId,
              confirmadoAt: a.confirmadoAt,
              _count: { assignments: a.asignaciones },
            }
          : null;
      },
      deleteMany: async (args: {
        where: { id: string; tenantId: string };
      }) => {
        const n = archivos.filter(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        ).length;
        if (n > 0) borradas.push(args.where.id);
        return { count: n };
      },
    },
    product: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const p = productos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p
          ? {
              activo: p.activo,
              modalidad: p.modalidad,
              pdfPath: p.pdfPath,
              // El dueño de un archivo nunca es un pack (un pack no tiene archivos propios, V-I1d).
              unidadesPorPack: 1,
              fuente: null,
              _count: { files: p.archivosConfirmados },
              // El select real los pide `orderBy: { unidadesPorPack: "desc" }` — el más exigente
              // primero, así el mensaje nombra el pack que de verdad se rompe.
              packs: [...p.packs].sort(
                (a, b) => b.unidadesPorPack - a.unidadesPorPack,
              ),
            }
          : null;
      },
    },
  } as unknown as PrismaClient;
  return { db, getBorradas: () => borradas };
}

function fakeStorage() {
  const borrados: string[] = [];
  return {
    storage: {
      deleteObject: async (key: string) => {
        borrados.push(key);
      },
    },
    getBorrados: () => borrados,
  };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

/**
 * Una COLECCIÓN sin ningún pack a la venta: el escenario donde el borrado sí debería proceder.
 *
 * Bajo v2 lo que habilita el borrado NO es que la colección esté inactiva —una colección no se vende,
 * así que su `activo` no protege a nadie— sino que no haya packs vivos que dependan de ella.
 */
const coleccionSinPacksActivos: ProductoFake = {
  id: "prod-sobre",
  tenantId: "A",
  activo: true,
  modalidad: "SOBRE",
  pdfPath: null,
  archivosConfirmados: 6,
  packs: [],
};

const archivoDelPool = (over: Partial<ArchivoFake> = {}): ArchivoFake => ({
  id: "f1",
  tenantId: "A",
  productId: "prod-sobre",
  key: "A/prod-sobre/abc.png",
  confirmadoAt: new Date("2026-07-20"),
  asignaciones: 0,
  ...over,
});

describe("domain/panel/borrarArchivoDeProducto (fake db, tenant-scoped)", () => {
  // panel.productos.borrarArchivo.001 — LA validación declarada de F06 (D4/I7)
  it("un archivo con asignaciones NO se borra: rechaza con mensaje y la fila queda intacta", async () => {
    const { db, getBorradas } = fakeDb(
      [archivoDelPool({ asignaciones: 2 })],
      [coleccionSinPacksActivos],
    );
    const { storage, getBorrados } = fakeStorage();

    await expect(
      borrarArchivoDeProducto({
        db,
        acceso: acceso(["A"]),
        input: { fileId: "f1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // La fila sigue ahí ⇒ el Comprador al que le tocó lo sigue pudiendo descargar.
    expect(getBorradas()).toEqual([]);
    // Y el objeto del bucket NI SE TOCA: borrarlo dejaría la fila apuntando a la nada.
    expect(getBorrados()).toEqual([]);
  });

  // panel.productos.borrarArchivo.002 — el camino feliz: sin asignaciones y sobre INACTIVO
  it("un archivo sin asignaciones se borra y también se saca el objeto del bucket", async () => {
    const { db, getBorradas } = fakeDb([archivoDelPool()], [coleccionSinPacksActivos]);
    const { storage, getBorrados } = fakeStorage();

    const res = await borrarArchivoDeProducto({
      db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage,
    });

    expect(res).toEqual({ borrado: true });
    expect(getBorradas()).toEqual(["f1"]);
    expect(getBorrados()).toEqual(["A/prod-sobre/abc.png"]);
  });

  // panel.productos.borrarArchivo.003 — I1: un archivo de OTRA Tienda es indistinguible de
  // inexistente, y el storage no se toca ni una vez (no se filtra ni la existencia de la key ajena)
  it("un archivo de OTRA Tienda ⇒ NOT_FOUND, sin tocar el bucket", async () => {
    const { db, getBorradas } = fakeDb(
      [archivoDelPool({ tenantId: "B" })],
      [{ ...coleccionSinPacksActivos, tenantId: "B" }],
    );
    const { storage, getBorrados } = fakeStorage();

    await expect(
      borrarArchivoDeProducto({
        db,
        acceso: acceso(["A"]), // organizador de A intentando borrar un archivo de B
        input: { fileId: "f1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getBorradas()).toEqual([]);
    expect(getBorrados()).toEqual([]);
  });

  // panel.productos.borrarArchivo.004 — fail-closed (I7): borrar no puede dejar A LA VENTA un
  // producto sin nada que entregar. Sin este guard el producto seguiría listado en el storefront y la
  // compra fallaría DESPUÉS del pago.
  it("no borra el único archivo de un producto ESTANDAR que está a la venta", async () => {
    const { db, getBorradas } = fakeDb(
      [archivoDelPool({ productId: "prod-pdf" })],
      [
        {
          id: "prod-pdf",
          tenantId: "A",
          activo: true, // a la venta
          modalidad: "ESTANDAR",
          pdfPath: null,
          archivosConfirmados: 1, // el que se intenta borrar es el único
          packs: [],
        },
      ],
    );
    const { storage } = fakeStorage();

    await expect(
      borrarArchivoDeProducto({
        db,
        acceso: acceso(["A"]),
        input: { fileId: "f1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getBorradas()).toEqual([]);
  });

  // panel.productos.borrarArchivo.005 — el guard NUEVO de la enmienda (E17): lo que protege el
  // archivo ya no es el `activo` de la colección sino los PACKS a la venta que la usan. Sacar un
  // archivo que dejaría el pool por debajo de un pack activo se rechaza.
  it("no borra un archivo del pool si un pack a la venta dejaría de poder armarse", async () => {
    const coleccionAlLimite: ProductoFake = {
      ...coleccionSinPacksActivos,
      archivosConfirmados: 4, // exactamente lo que pide el pack más grande
      packs: [
        { titulo: "Pack 4 stickers", unidadesPorPack: 4 },
        { titulo: "1 sticker", unidadesPorPack: 1 },
      ],
    };
    const { db, getBorradas } = fakeDb([archivoDelPool()], [coleccionAlLimite]);
    const { storage } = fakeStorage();

    const error = await borrarArchivoDeProducto({
      db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage,
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "CONFLICT" });
    // El mensaje NOMBRA el pack que se rompe: una colección puede tener varios, y "un pack tuyo se
    // rompe" obligaría al Organizador a adivinar cuál. Y lleva los números concretos.
    expect((error as Error).message).toContain("Pack 4 stickers");
    expect((error as Error).message).toContain("3"); // el pool que quedaría
    expect(getBorradas()).toEqual([]);

    // Con un archivo de más en el pool (5 ⇒ quedan 4 ≥ 4), el mismo borrado SÍ procede.
    const conHolgura = fakeDb(
      [archivoDelPool()],
      [{ ...coleccionAlLimite, archivosConfirmados: 5 }],
    );
    await borrarArchivoDeProducto({
      db: conHolgura.db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage: fakeStorage().storage,
    });
    expect(conHolgura.getBorradas()).toEqual(["f1"]);
  });

  // panel.productos.borrarArchivo.008 — la otra mitad de E17, y el caso LIBRO: la fuente puede estar
  // DESPUBLICADA (el Organizador no vende la unidad suelta) y aun así su archivo es indeleble,
  // porque el pack sí está a la venta. Antes de v2 este borrado habría procedido —el producto estaba
  // inactivo— dejando el pack vendiéndose sin nada que entregar.
  it("no borra el único archivo de una fuente DESPUBLICADA si un pack la está vendiendo", async () => {
    const { db, getBorradas } = fakeDb(
      [archivoDelPool({ productId: "prod-libro" })],
      [
        {
          id: "prod-libro",
          tenantId: "A",
          activo: false, // la unidad suelta NO se vende
          modalidad: "ESTANDAR",
          pdfPath: null,
          archivosConfirmados: 1,
          packs: [{ titulo: "Pack 4 libros", unidadesPorPack: 4 }],
        },
      ],
    );
    const { storage, getBorrados } = fakeStorage();

    const error = await borrarArchivoDeProducto({
      db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage,
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "CONFLICT" });
    expect((error as Error).message).toContain("Pack 4 libros");
    expect(getBorradas()).toEqual([]);
    expect(getBorrados()).toEqual([]);
  });

  // panel.productos.borrarArchivo.006 — un archivo PENDIENTE (subida a medio camino) no cuenta para
  // el gate, así que sacarlo nunca puede romperlo: se borra aunque el producto esté a la venta con un
  // solo confirmado. Sin esta distinción, una subida abandonada quedaría imborrable.
  it("borra un archivo sin confirmar aunque el producto esté a la venta", async () => {
    const { db, getBorradas } = fakeDb(
      [archivoDelPool({ confirmadoAt: null, productId: "prod-pdf" })],
      [
        {
          id: "prod-pdf",
          tenantId: "A",
          activo: true,
          modalidad: "ESTANDAR",
          pdfPath: null,
          archivosConfirmados: 1, // el confirmado es OTRO archivo, no el que se borra
          packs: [],
        },
      ],
    );
    const { storage } = fakeStorage();

    await borrarArchivoDeProducto({
      db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage,
    });
    expect(getBorradas()).toEqual(["f1"]);
  });

  // panel.productos.borrarArchivo.007 — sin membresía ⇒ FORBIDDEN (fail-closed; nunca borra "el
  // archivo de alguien")
  it("sin membresía ⇒ FORBIDDEN", async () => {
    const { db, getBorradas } = fakeDb([archivoDelPool()], [coleccionSinPacksActivos]);
    const { storage } = fakeStorage();

    await expect(
      borrarArchivoDeProducto({
        db,
        acceso: acceso([]),
        input: { fileId: "f1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getBorradas()).toEqual([]);
  });
});
