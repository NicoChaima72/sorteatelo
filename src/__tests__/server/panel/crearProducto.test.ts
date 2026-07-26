import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearProducto } from "~/server/domain/panel/crearProducto";

/**
 * Tests del use case `crearProducto` con `db` FAKE. Clave: el `tenantId` sale del `acceso`
 * resuelto server-side, NUNCA del input; el precio se persiste como `Decimal`. Actualizado
 * por F03/D4: el producto nace SIN PDF (`pdfPath: null`) y como BORRADOR (`activo: false`) —
 * fail-closed, sin PDF no hay venta (I7); el cliente ya no manda `pdfPath` (murió el seam).
 * Sin membresía ⇒ FORBIDDEN.
 *
 * Actualizado por la **ENMIENDA v2** (E13/E15): si el input trae `fuenteId`, lo que nace es un
 * PACK — un producto que entrega `unidadesPorPack` del contenido de OTRO. La fuente se valida antes
 * de crear nada con `resolverFuenteDePack`.
 */

/** Un producto que ya existe en la DB y podría ser elegido como fuente. */
interface ProductoExistente {
  id: string;
  tenantId: string;
  modalidad?: "ESTANDAR" | "SOBRE";
  /** No-null ⇒ es a su vez un pack ⇒ NO puede ser fuente (sin cadenas, V-I1b). */
  fuenteId?: string | null;
}

function fakeDb(existentes: ProductoExistente[] = []) {
  let creado: Record<string, unknown> | null = null;
  const db = {
    product: {
      // HONRA el `where` completo (tenantId + fuenteId: null) en vez de filtrar por su cuenta: un
      // fake que ignore esas condiciones volvería VERDE el olvido del filtro de tenant o del "sin
      // cadenas", que son justo los dos invariantes que este use case tiene que hacer cumplir.
      findFirst: async (args: {
        where: { id: string; tenantId: string; fuenteId: null };
      }) => {
        const p = existentes.find(
          (x) =>
            x.id === args.where.id &&
            x.tenantId === args.where.tenantId &&
            (x.fuenteId ?? null) === args.where.fuenteId,
        );
        return p
          ? { id: p.id, modalidad: p.modalidad ?? ("ESTANDAR" as const) }
          : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creado = data;
        return { id: "prod-nuevo", ...data };
      },
    },
  } as unknown as PrismaClient;
  return { db, getCreado: () => creado };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

describe("domain/panel/crearProducto (fake db, tenant-scoped)", () => {
  // panel.productos.crear.001 — persiste con el tenantId resuelto, precio Decimal, PDF pendiente, flag sorteo
  it("crea el producto con el tenantId resuelto server-side, precio Decimal, pdfPath null, activo false y participaEnSorteo del input", async () => {
    const { db, getCreado } = fakeDb();
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Nuevo libro",
        descripcion: "una descripción",
        precio: "3000",
        participaEnSorteo: true,
        modalidad: "ESTANDAR",
        fuenteId: null,
        unidadesPorPack: 1,
      },
    });
    const data = getCreado()!;
    expect(data.tenantId).toBe("A"); // del acceso, NO del input
    expect(data.titulo).toBe("Nuevo libro");
    expect(Prisma.Decimal.isDecimal(data.precio)).toBe(true);
    expect((data.precio as Prisma.Decimal).toFixed(2)).toBe("3000.00");
    // F03/D4: nace SIN PDF y como borrador (fail-closed, I7).
    expect(data.pdfPath).toBeNull();
    expect(data.activo).toBe(false);
    // plantilla-rica D4/I6: la portada NO se setea en el create (la escribe confirmarImagenSubida).
    expect("portadaUrl" in data).toBe(false);
    // ADR-0012/D1: el flag del sorteo se persiste tal cual del input.
    expect(data.participaEnSorteo).toBe(true);
    // F06/D2: la modalidad se persiste del input — es lo único que el Organizador declara sobre la
    // forma del producto (el TIPO de archivo lo deriva el server del MIME, D9).
    expect(data.modalidad).toBe("ESTANDAR");
  });

  // panel.productos.crear.003 — un SOBRE nace con su modalidad, vacío: sin pool, sin opciones de pack
  // y como borrador. Llenarlo son acciones aparte (subir archivos + definir packs), y hasta que el
  // pool cubra el pack más grande no se puede activar (F06/D4/I7).
  it("crea un producto SOBRE con la modalidad del input, vacío y como borrador", async () => {
    const { db, getCreado } = fakeDb();
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Sobre de stickers",
        descripcion: "4 al azar de la colección",
        precio: "3000", // precio de referencia; lo que cobra sale de la opción de pack (F07)
        participaEnSorteo: true,
        modalidad: "SOBRE",
        fuenteId: null,
        unidadesPorPack: 1,
      },
    });
    const data = getCreado()!;
    expect(data.modalidad).toBe("SOBRE");
    expect(data.activo).toBe(false); // fail-closed: sin pool no hay venta
    expect(data.pdfPath).toBeNull();
  });

  // panel.productos.crear.002 — sin membresía ⇒ FORBIDDEN (no crea nada)
  it("sin membresía ⇒ FORBIDDEN y no crea nada", async () => {
    const { db, getCreado } = fakeDb();
    await expect(
      crearProducto({
        db,
        acceso: acceso([]),
        input: {
          titulo: "x",
          descripcion: "y",
          precio: "1000",
          participaEnSorteo: false,
          modalidad: "ESTANDAR",
          fuenteId: null,
          unidadesPorPack: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCreado()).toBeNull();
  });

  // panel.productos.crear.003 — el alta de un PACK (E13/E15): mismo form de siempre, dos campos más.
  it("crear con fuenteId persiste un pack con su fuente y sus unidades", async () => {
    const { db, getCreado } = fakeDb([{ id: "coleccion-1", tenantId: "A", modalidad: "SOBRE" }]);
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Pack 4 stickers",
        descripcion: "cuatro al azar",
        precio: "10000",
        participaEnSorteo: true,
        modalidad: "ESTANDAR",
        fuenteId: "coleccion-1",
        unidadesPorPack: 4,
      },
    });
    const data = getCreado()!;
    expect(data.fuenteId).toBe("coleccion-1");
    expect(data.unidadesPorPack).toBe(4);
    // El precio del pack es su propio `Product.precio`, tipeado por el Organizador: nada se deriva
    // del precio de la unidad (V-I5), y sigue siendo Decimal (I4).
    expect(Prisma.Decimal.isDecimal(data.precio)).toBe(true);
    expect((data.precio as Prisma.Decimal).toFixed(2)).toBe("10000.00");
    expect(data.activo).toBe(false); // fail-closed igual que cualquier producto
  });

  // panel.productos.crear.004 — V-I7: un pack se persiste SIEMPRE con `modalidad: ESTANDAR`, aunque
  // el cliente mande SOBRE. En un pack la modalidad no significa nada (la entrega la decide la de su
  // fuente) y guardarlo como SOBRE lo auto-escondería: el catálogo excluye `modalidad = SOBRE`, así
  // que quedaría un producto invisible e invendible sin ningún error a la vista.
  it("un pack se persiste con modalidad ESTANDAR aunque el input diga SOBRE", async () => {
    const { db, getCreado } = fakeDb([{ id: "coleccion-1", tenantId: "A", modalidad: "SOBRE" }]);
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Pack 4 stickers",
        descripcion: "cuatro al azar",
        precio: "10000",
        participaEnSorteo: false,
        modalidad: "SOBRE",
        fuenteId: "coleccion-1",
        unidadesPorPack: 4,
      },
    });
    expect(getCreado()!.modalidad).toBe("ESTANDAR");
  });

  // panel.productos.crear.005 — la fuente se valida ANTES de crear nada (V-I1): ajena y encadenada
  // se rechazan sin dejar rastro. El `tenantId` sale del acceso, así que un id de otra Tienda es
  // inalcanzable por construcción.
  it("una fuente de OTRA Tienda o que ya es un pack ⇒ INVALID y no crea nada", async () => {
    const ajena = fakeDb([{ id: "p-ajeno", tenantId: "B" }]);
    await expect(
      crearProducto({
        db: ajena.db,
        acceso: acceso(["A"]),
        input: {
          titulo: "Pack",
          descripcion: "d",
          precio: "1000",
          participaEnSorteo: false,
          modalidad: "ESTANDAR",
          fuenteId: "p-ajeno",
          unidadesPorPack: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(ajena.getCreado()).toBeNull();

    // Sin cadenas: un producto que YA es pack no puede ser fuente de otro.
    const cadena = fakeDb([
      { id: "pack-1", tenantId: "A", fuenteId: "coleccion-1" },
    ]);
    await expect(
      crearProducto({
        db: cadena.db,
        acceso: acceso(["A"]),
        input: {
          titulo: "Pack de packs",
          descripcion: "d",
          precio: "1000",
          participaEnSorteo: false,
          modalidad: "ESTANDAR",
          fuenteId: "pack-1",
          unidadesPorPack: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(cadena.getCreado()).toBeNull();
  });

  // panel.productos.crear.006 — el agujero que marcó el `backend-reviewer` al cerrar F10: un
  // producto SIN fuente entrega 1 unidad de sí mismo. Si `unidadesPorPack` se copiara del input, un
  // cliente a mano crearía un producto normal que otorga 5 tickets × cantidad por UN archivo.
  it("un producto SIN fuente nace con unidadesPorPack: 1 aunque el input pida 5", async () => {
    const { db, getCreado } = fakeDb();
    await crearProducto({
      db,
      acceso: acceso(["A"]),
      input: {
        titulo: "Un libro",
        descripcion: "d",
        precio: "3000",
        participaEnSorteo: false,
        modalidad: "ESTANDAR",
        fuenteId: null,
        unidadesPorPack: 5,
      },
    });
    expect(getCreado()!.unidadesPorPack).toBe(1);
  });
});
