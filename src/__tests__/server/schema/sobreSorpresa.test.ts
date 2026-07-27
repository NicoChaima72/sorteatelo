import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";

/**
 * Tests DB-backed del SCHEMA del **sobre sorpresa** (productos-tipos-digitales F05, D3/D4/D6/D12).
 *
 * Van contra la DB REAL porque lo que se verifica vive en Postgres, no en TypeScript: la precisión
 * de `Decimal(15,2)` del precio del pack, el `@default(1)` de `OrderItem.unidadesPorPack`, y —lo
 * importante— los CUATRO constraints que F07/F08 van a dar por sentados al escribir la asignación
 * aleatoria dentro de la `$transaction` post-pago:
 *
 *  1. `@@unique([productId, unidades])` — un tamaño de pack, un precio.
 *  2. `@@unique([orderItemId, packOrdinal, unidadOrdinal])` — idempotencia exactly-once ante replay
 *     del webhook de Flow (el conjunto de COORDENADAS es determinístico aunque la muestra no lo sea).
 *  3. `@@unique([orderItemId, packOrdinal, productFileId])` — **sin duplicados DENTRO de un pack**
 *     (D4/I7), permitiendo a propósito el duplicado ENTRE packs.
 *  4. `onDelete: Restrict` hacia `ProductFile` — un archivo asignado es INDELEBLE, porque la
 *     descarga del Comprador ya es una promesa (D4/I7).
 *
 * Por qué merecen test propio y no alcanza con testear el use case de F08: el sampling es
 * ALEATORIO. Un test de F08 que verifique "no hay repetidos en el pack" puede pasar por suerte con
 * un pool grande y un RNG buggeado. Estos tests atacan el constraint DIRECTAMENTE, así que la
 * garantía queda pinneada donde de verdad vive — y si alguien la borra del schema, fallan acá en vez
 * de aparecer como un bug intermitente en producción ("me tocaron 4 stickers y dos son iguales").
 *
 * Slugs `test-schema-sobre-*` scopeados y limpiados antes/después (FK-safe: hijos antes que padres).
 */

const PREFIJO = "test-schema-sobre-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  await db.packAssignment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.productFile.deleteMany({ where: { tenantId: { in: ids } } });
  // Los PACKS antes que sus fuentes: el `onDelete: Restrict` de la self-relation aborta el borrado
  // de una fuente que todavía tenga packs colgando.
  await db.product.deleteMany({
    where: { tenantId: { in: ids }, fuenteId: { not: null } },
  });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

async function crearTenant(nombre: string) {
  return db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA" },
    select: { id: true },
  });
}

/** Un producto SOBRE con su pool de `M` archivos CONFIRMADOS. Devuelve el producto y las keys. */
async function crearSobre({
  tenantId,
  titulo,
  pool,
}: {
  tenantId: string;
  titulo: string;
  /** Cuántos archivos confirmados sembrar en el pool. */
  pool: number;
}) {
  const producto = await db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "sobre de prueba",
      precio: "3000", // precio de referencia; el que cobra sale de la opción de pack
      modalidad: "SOBRE",
    },
    select: { id: true },
  });
  // `createMany` + un `findMany` en vez de N `create` secuenciales: la DB es Supabase REMOTA
  // (~1-2s por roundtrip), así que sembrar un pool de 8 de a uno se comía el `testTimeout` de 30s
  // del repo. Dos roundtrips en vez de N.
  await db.productFile.createMany({
    data: Array.from({ length: pool }, (_u, i) => ({
      tenantId,
      productId: producto.id,
      key: `${tenantId}/${producto.id}/sticker-${i}.png`,
      contentType: "image/png",
      tipo: "IMAGEN" as const,
      nombreArchivo: `sticker-${i}.png`,
      bytes: 1024,
      confirmadoAt: new Date(),
    })),
  });
  const archivos = await db.productFile.findMany({
    where: { tenantId, productId: producto.id },
    select: { id: true },
    // Orden estable = el de las keys sembradas, para que `archivos[0]` sea siempre `sticker-0`.
    orderBy: { key: "asc" },
  });
  return { producto, archivos };
}

/** Una orden PAGADA con UNA línea que compró `cantidad` packs de `unidadesPorPack` unidades. */
async function crearLineaDeSobre({
  tenantId,
  productId,
  precioPack,
  cantidad,
  unidadesPorPack,
}: {
  tenantId: string;
  productId: string;
  precioPack: string;
  cantidad: number;
  unidadesPorPack: number;
}) {
  const order = await db.order.create({
    data: {
      tenantId,
      email: "compradora@example.com",
      estado: "PAGADO",
      total: precioPack,
      items: {
        create: [
          {
            tenantId,
            productId,
            precio: precioPack,
            cantidad,
            unidadesPorPack,
          },
        ],
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });
  return { orderId: order.id, orderItemId: order.items[0]!.id };
}

describe("schema/sobre-sorpresa (DB-backed)", () => {
  // sobre.schema.003 — @@unique([orderItemId, packOrdinal, unidadOrdinal]): las COORDENADAS de la
  // entrega son la llave de idempotencia exactly-once ante replay del webhook de Flow (D12/I3). Es la
  // garantía que hace que un replay no pueda agregar ni una fila AUNQUE el RNG sortee otra muestra:
  // el conjunto de coordenadas (0..cantidad-1 × 0..unidadesPorPack-1) es determinístico.
  it("rechaza dos asignaciones en la misma coordenada aunque el archivo sorteado sea otro (idempotencia ante replay)", async () => {
    const tenant = await crearTenant("tres");
    const { producto, archivos } = await crearSobre({
      tenantId: tenant.id,
      titulo: "Sobre replay",
      pool: 4,
    });
    const { orderItemId } = await crearLineaDeSobre({
      tenantId: tenant.id,
      productId: producto.id,
      precioPack: "10000",
      cantidad: 1,
      unidadesPorPack: 2,
    });

    // Primera corrida del efecto post-pago: pack 0, unidades 0 y 1.
    await db.packAssignment.createMany({
      data: [
        {
          tenantId: tenant.id,
          orderItemId,
          productFileId: archivos[0]!.id,
          packOrdinal: 0,
          unidadOrdinal: 0,
        },
        {
          tenantId: tenant.id,
          orderItemId,
          productFileId: archivos[1]!.id,
          packOrdinal: 0,
          unidadOrdinal: 1,
        },
      ],
    });
    expect(await db.packAssignment.count({ where: { orderItemId } })).toBe(2);

    // REPLAY: Flow reintenta y el RNG sortea OTROS archivos del pool. La coordenada (0,0) ya está
    // tomada ⇒ rechazo. Lo que vale es la muestra ORIGINAL, no la del reintento.
    await expect(
      db.packAssignment.create({
        data: {
          tenantId: tenant.id,
          orderItemId,
          productFileId: archivos[2]!.id, // archivo DISTINTO al de la primera corrida
          packOrdinal: 0,
          unidadOrdinal: 0,
        },
      }),
    ).rejects.toThrow();
    expect(await db.packAssignment.count({ where: { orderItemId } })).toBe(2);
  });

  // sobre.schema.004 — @@unique([orderItemId, packOrdinal, productFileId]): el corazón de D4/I7.
  // "Sin duplicados DENTRO de un pack" está garantizado por POSTGRES, no por el RNG — es el bug de
  // sampling más fácil de escribir y el único que el Comprador NOTA ("me tocaron 4 y dos son
  // iguales"). Y el duplicado ENTRE packs está PERMITIDO a propósito: cada pack samplea independiente
  // el pool completo (digital, sin stock).
  it("rechaza el mismo archivo dos veces DENTRO de un pack, pero lo permite entre packs distintos", async () => {
    const tenant = await crearTenant("cuatro");
    const { producto, archivos } = await crearSobre({
      tenantId: tenant.id,
      titulo: "Sobre duplicados",
      pool: 3,
    });
    // 2 packs de 2 unidades cada uno (cantidad 2 × unidadesPorPack 2 = 4 archivos a asignar).
    const { orderItemId } = await crearLineaDeSobre({
      tenantId: tenant.id,
      productId: producto.id,
      precioPack: "6000",
      cantidad: 2,
      unidadesPorPack: 2,
    });

    await db.packAssignment.create({
      data: {
        tenantId: tenant.id,
        orderItemId,
        productFileId: archivos[0]!.id,
        packOrdinal: 0,
        unidadOrdinal: 0,
      },
    });

    // MISMO archivo, MISMO pack, otra unidad ⇒ repetido dentro del pack ⇒ RECHAZO (D4).
    await expect(
      db.packAssignment.create({
        data: {
          tenantId: tenant.id,
          orderItemId,
          productFileId: archivos[0]!.id,
          packOrdinal: 0,
          unidadOrdinal: 1,
        },
      }),
    ).rejects.toThrow();

    // MISMO archivo, OTRO pack ⇒ PERMITIDO: al fan le puede tocar el mismo sticker en los dos sobres.
    const enOtroPack = await db.packAssignment.create({
      data: {
        tenantId: tenant.id,
        orderItemId,
        productFileId: archivos[0]!.id,
        packOrdinal: 1,
        unidadOrdinal: 0,
      },
      select: { id: true },
    });
    expect(enOtroPack.id).toBeTruthy();

    const asignaciones = await db.packAssignment.findMany({
      where: { orderItemId },
      select: { productFileId: true, packOrdinal: true, unidadOrdinal: true },
      orderBy: [{ packOrdinal: "asc" }, { unidadOrdinal: "asc" }],
    });
    expect(asignaciones).toEqual([
      { productFileId: archivos[0]!.id, packOrdinal: 0, unidadOrdinal: 0 },
      { productFileId: archivos[0]!.id, packOrdinal: 1, unidadOrdinal: 0 },
    ]);
  });

  // sobre.schema.005 — onDelete: Restrict hacia ProductFile (D4/I7): un archivo del pool que ya le
  // TOCÓ a alguien es INDELEBLE, porque su descarga ya es una promesa hecha a un Comprador que pagó.
  // Es la garantía de DB detrás del bloqueo de borrado del panel (F06), que además necesita poder
  // PREGUNTAR "¿este archivo tiene asignaciones?" para dar un mensaje claro en vez de un 500.
  it("no permite borrar un archivo del pool con asignaciones, y sí uno sin asignaciones", async () => {
    const tenant = await crearTenant("cinco");
    const { producto, archivos } = await crearSobre({
      tenantId: tenant.id,
      titulo: "Sobre indeleble",
      pool: 2,
    });
    const { orderItemId } = await crearLineaDeSobre({
      tenantId: tenant.id,
      productId: producto.id,
      precioPack: "3000",
      cantidad: 1,
      unidadesPorPack: 1,
    });

    const asignado = archivos[0]!;
    const nuncaAsignado = archivos[1]!;
    await db.packAssignment.create({
      data: {
        tenantId: tenant.id,
        orderItemId,
        productFileId: asignado.id,
        packOrdinal: 0,
        unidadOrdinal: 0,
      },
    });

    // La query que el panel usa para decidir si ofrece el botón de borrar (F06).
    expect(
      await db.packAssignment.count({ where: { productFileId: asignado.id } }),
    ).toBe(1);
    expect(
      await db.packAssignment.count({ where: { productFileId: nuncaAsignado.id } }),
    ).toBe(0);

    // Borrar el asignado ⇒ lo aborta Postgres, no la buena voluntad del use case.
    await expect(
      db.productFile.delete({ where: { id: asignado.id } }),
    ).rejects.toThrow();
    expect(
      await db.productFile.count({ where: { id: asignado.id } }),
    ).toBe(1); // sigue ahí ⇒ sigue descargable para quien lo compró

    // El que nunca le tocó a nadie sí se puede sacar del pool.
    await db.productFile.delete({ where: { id: nuncaAsignado.id } });
    expect(
      await db.productFile.count({ where: { id: nuncaAsignado.id } }),
    ).toBe(0);
  });

  // sobre.schema.006 — el snapshot `OrderItem.unidadesPorPack`: `@default(1)` es un hecho VERDADERO
  // para un producto ESTANDAR (3 unidades = 3 tickets = 1×3), así que la fórmula
  // `unidadesPorPack × cantidad` de F08 vale uniforme sin `?? 1` en cada caller — y las líneas que
  // escriba el código VIEJO deployado contra esta misma DB (ADR-0015) nacen verdaderas.
  it("OrderItem.unidadesPorPack nace en 1 (verdadero para ESTANDAR) y congela el pack comprado", async () => {
    const tenant = await crearTenant("seis");
    const estandar = await db.product.create({
      data: {
        tenantId: tenant.id,
        titulo: "PDF normal",
        descripcion: "d",
        precio: "5000",
      },
      select: { id: true, modalidad: true },
    });
    expect(estandar.modalidad).toBe("ESTANDAR"); // el default de F01 sigue puesto

    // Línea creada SIN mencionar `unidadesPorPack` (lo que hace el código viejo deployado).
    const orden = await db.order.create({
      data: {
        tenantId: tenant.id,
        email: "compradora@example.com",
        estado: "PAGADO",
        total: "15000",
        items: {
          create: [
            { tenantId: tenant.id, productId: estandar.id, precio: "5000", cantidad: 3 },
          ],
        },
      },
      select: { items: { select: { cantidad: true, unidadesPorPack: true } } },
    });
    const linea = orden.items[0]!;
    expect(linea.unidadesPorPack).toBe(1);
    // La fórmula de tickets de D6 sobre una línea estándar da exactamente lo de siempre (ADR-0012).
    expect(linea.unidadesPorPack * linea.cantidad).toBe(3);

    // Y en un PACK congela el tamaño comprado, sobreviviendo a que el PRODUCTO PACK cambie después.
    // (Bajo la ENMIENDA v2 la definición viva ya no es una `ProductPackOption` sino el propio
    // producto pack, con su `unidadesPorPack` y su `precio` — y `unidadesPorPack` es editable a
    // propósito: lo que protege la historia es justamente este snapshot.)
    const { producto: coleccion } = await crearSobre({
      tenantId: tenant.id,
      titulo: "Colección snapshot",
      pool: 8,
    });
    const pack = await db.product.create({
      data: {
        tenantId: tenant.id,
        titulo: "Pack 4",
        descripcion: "cuatro al azar",
        precio: "10000",
        fuenteId: coleccion.id,
        unidadesPorPack: 4,
      },
      select: { id: true },
    });
    const { orderItemId } = await crearLineaDeSobre({
      tenantId: tenant.id,
      productId: pack.id,
      precioPack: "10000",
      cantidad: 2,
      unidadesPorPack: 4,
    });

    // El Organizador sube el precio y agranda el pack DESPUÉS de la compra.
    await db.product.update({
      where: { id: pack.id },
      data: { unidadesPorPack: 6, precio: "18000" },
    });

    const congelada = await db.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      select: { precio: true, cantidad: true, unidadesPorPack: true },
    });
    expect(congelada.unidadesPorPack).toBe(4); // lo que compró, no lo que el pack dice HOY
    expect(congelada.precio.toFixed(2)).toBe("10000.00");
    // 2 packs × 4 unidades = 8 archivos a asignar (F08) y 8 tickets si participa en el sorteo (D6).
    expect(congelada.unidadesPorPack * congelada.cantidad).toBe(8);
  });
});
