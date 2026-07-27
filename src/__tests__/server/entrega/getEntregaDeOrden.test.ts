import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { archivosDelGrant } from "~/server/entrega/archivosDelGrant";
import { getEntregaDeOrden } from "~/server/entrega/getEntregaDeOrden";

/**
 * Tests DB-backed de la **página de entrega** (productos-tipos-digitales F09, D5/I8).
 *
 * DB real porque lo que se verifica es de dónde salen los archivos: el corte "solo lo ASIGNADO a
 * ESTA orden" es una query con joins entre `PackAssignment`, `OrderItem` y `ProductFile`, y esa es
 * exactamente la parte que, si se escribe mal, deja a un comprador de UN sticker bajándose la
 * colección completa. Un `db` fake no puede probar eso.
 */

const PREFIJO = "test-entrega-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
  await db.packAssignment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.productFile.deleteMany({ where: { tenantId: { in: ids } } });
  // Los PACKS antes que sus fuentes: el `onDelete: Restrict` de la self-relation aborta el borrado
  // de una fuente con packs colgando, y un `deleteMany` único borra en orden arbitrario.
  await db.product.deleteMany({
    where: { tenantId: { in: ids }, fuenteId: { not: null } },
  });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

const EN_30_DIAS = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

/**
 * Siembra una Tienda con UN sobre (pool de `pool` archivos) y una orden PAGADA que compró un pack
 * de `unidades`, con su grant. Devuelve lo necesario para las aserciones.
 *
 * Todos los `ProductFile` en UN `createMany`: contra la DB remota cada roundtrip cuesta ~1s y de a
 * uno el fixture solo se comería el `testTimeout`.
 */
async function sembrarCompraDeSobre({
  nombre,
  pool,
  unidades,
  cantidad = 1,
}: {
  nombre: string;
  pool: number;
  unidades: number;
  cantidad?: number;
}) {
  const tenant = await db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA" },
    select: { id: true, nombre: true },
  });

  const producto = await db.product.create({
    data: {
      tenantId: tenant.id,
      titulo: "Sobre de stickers",
      descripcion: "d",
      precio: "999",
      modalidad: "SOBRE",
      activo: true,
    },
    select: { id: true },
  });

  await db.productFile.createMany({
    data: Array.from({ length: pool }, (_u, i) => ({
      tenantId: tenant.id,
      productId: producto.id,
      key: `${tenant.id}/${producto.id}/f${i}.png`,
      contentType: "image/png",
      tipo: "IMAGEN" as const,
      nombreArchivo: `sticker-${i}.png`,
      bytes: 2048,
      confirmadoAt: new Date(),
    })),
  });

  const token = randomUUID();
  const order = await db.order.create({
    data: {
      tenantId: tenant.id,
      email: "fan@example.cl",
      estado: "PAGADO",
      total: "10000",
      items: {
        create: {
          tenantId: tenant.id,
          productId: producto.id,
          precio: "10000",
          cantidad,
          unidadesPorPack: unidades,
        },
      },
      downloadGrants: {
        create: {
          tenantId: tenant.id,
          productId: producto.id,
          token,
          expiresAt: EN_30_DIAS(),
        },
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });

  const archivos = await db.productFile.findMany({
    where: { productId: producto.id },
    select: { id: true },
    orderBy: { key: "asc" },
  });

  return {
    tenant,
    producto,
    orderId: order.id,
    orderItemId: order.items[0]!.id,
    token,
    archivos: archivos.map((a) => a.id),
  };
}

describe("entrega/getEntregaDeOrden (DB real)", () => {
  // entrega.pagina.001 — solo los archivos ASIGNADOS a ESTA orden, nunca el pool completo
  it("expone solo los archivos que le tocaron a esta orden, no el pool del sobre", async () => {
    const s = await sembrarCompraDeSobre({ nombre: "a", pool: 6, unidades: 2 });

    // Le tocaron 2 de los 6 (lo que haría F08 al confirmarse el pago).
    const tocaron = [s.archivos[0]!, s.archivos[3]!];
    await db.packAssignment.createMany({
      data: tocaron.map((productFileId, unidadOrdinal) => ({
        tenantId: s.tenant.id,
        orderItemId: s.orderItemId,
        productFileId,
        packOrdinal: 0,
        unidadOrdinal,
      })),
    });

    const entrega = await getEntregaDeOrden({ db, token: s.token });

    expect(entrega).not.toBeNull();
    expect(entrega!.branding.nombre).toBe("a");
    expect(entrega!.lineas).toHaveLength(1);

    const linea = entrega!.lineas[0]!;
    expect(linea.esSobre).toBe(true);
    expect(linea.unidadesPorPack).toBe(2);
    // F05: un producto SIN portada la reporta como `null` (la página degrada al gradiente de marca,
    // §5.2) — nunca `undefined`, que Next rechazaría al serializar las props del SSR.
    expect(linea.portadaUrl).toBeNull();
    // 2 archivos, EXACTAMENTE los asignados — y no los 6 del pool.
    expect(linea.archivos).toHaveLength(2);
    expect(linea.archivos.map((a) => a.id).sort()).toEqual([...tocaron].sort());
    // Cada uno con su enlace de descarga apuntando al token del grant + su fileId.
    for (const a of linea.archivos) {
      expect(a.urlDescarga).toBe(`/api/descargas/${s.token}?archivo=${a.id}`);
    }
  });

  // entrega.pagina.002 — token de otra orden ⇒ ve LA SUYA, y token inválido/vencido ⇒ null neutral
  it("un token de otra orden no muestra esta orden; uno inexistente o vencido devuelve null", async () => {
    const a = await sembrarCompraDeSobre({ nombre: "b", pool: 2, unidades: 1 });
    const b = await sembrarCompraDeSobre({ nombre: "c", pool: 2, unidades: 1 });

    await db.packAssignment.create({
      data: {
        tenantId: a.tenant.id,
        orderItemId: a.orderItemId,
        productFileId: a.archivos[0]!,
        packOrdinal: 0,
        unidadOrdinal: 0,
      },
    });

    // El token de la Tienda `c` (otra orden, otro tenant) resuelve SU propia entrega, jamás la de `b`.
    const conTokenAjeno = await getEntregaDeOrden({ db, token: b.token });
    expect(conTokenAjeno!.branding.nombre).toBe("c");
    expect(conTokenAjeno!.lineas[0]!.archivos).toHaveLength(0); // a `c` no le asignaron nada

    // Token inexistente ⇒ null.
    expect(await getEntregaDeOrden({ db, token: "no-existe" })).toBeNull();

    // Token vencido ⇒ el MISMO null (indistinguible de inexistente, I3).
    await db.downloadGrant.updateMany({
      where: { token: a.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getEntregaDeOrden({ db, token: a.token })).toBeNull();
  });

  // entrega.pagina.003 — el conjunto AUTORIZADO por el grant es el mismo que muestra la página: un
  // archivo del pool que NO le tocó no es descargable ni aunque se adivine su id (I2/D4)
  it("archivosDelGrant autoriza solo lo asignado: un archivo del pool que no tocó queda fuera", async () => {
    const s = await sembrarCompraDeSobre({ nombre: "d", pool: 5, unidades: 2 });
    const tocaron = [s.archivos[1]!, s.archivos[2]!];
    await db.packAssignment.createMany({
      data: tocaron.map((productFileId, unidadOrdinal) => ({
        tenantId: s.tenant.id,
        orderItemId: s.orderItemId,
        productFileId,
        packOrdinal: 0,
        unidadOrdinal,
      })),
    });

    const autorizados = await archivosDelGrant({
      db,
      grant: {
        tenantId: s.tenant.id,
        orderId: s.orderId,
        productId: s.producto.id,
      },
    });

    expect(autorizados.map((a) => a.id).sort()).toEqual([...tocaron].sort());
    // Los otros 3 del pool NO están en el conjunto autorizado ⇒ el endpoint los rechaza con 404
    // neutral aunque alguien ponga su id en `?archivo=`.
    const noTocaron = s.archivos.filter((id) => !tocaron.includes(id));
    expect(noTocaron).toHaveLength(3);
    for (const id of noTocaron) {
      expect(autorizados.some((a) => a.id === id)).toBe(false);
    }
  });
  /*
    entrega.pagina.004 — el CASO LIBRO de la ENMIENDA v2 (E15/V-I2): un pack cuya fuente es un
    producto ESTANDAR entrega N unidades del MISMO archivo. Esas copias NO existen en la DB —el
    `@@unique([orderItemId, packOrdinal, productFileId])` prohíbe la fila repetida y está bien que
    la prohíba—, así que se derivan acá, en el borde de presentación.

    Lo que este test fija, y que es lo que se puede romper sin que nada más lo note: que las copias
    aparezcan (si no, el Comprador de un «Pack 4 libros» ve UN archivo y cree que le entregaron de
    menos) y que NO se cuelen en el conjunto AUTORIZADO (si se colaran, el corte de seguridad
    `?archivo=` estaría razonando sobre una lista inflada).
  */
  it("un pack de fuente ESTANDAR lista las N copias del archivo, todas descargables", async () => {
    const tenant = await db.tenant.create({
      data: { slug: `${PREFIJO}libro`, nombre: "Editorial", estado: "PUBLICADA" },
      select: { id: true },
    });

    // La FUENTE va despublicada: el caso «vendo solo el pack» de E17.
    const libro = await db.product.create({
      data: {
        tenantId: tenant.id,
        titulo: "El libro",
        descripcion: "d",
        precio: "3000",
        activo: false,
      },
      select: { id: true },
    });
    const archivo = await db.productFile.create({
      data: {
        tenantId: tenant.id,
        productId: libro.id,
        key: `${tenant.id}/${libro.id}/libro.pdf`,
        contentType: "application/pdf",
        tipo: "PDF",
        nombreArchivo: "el-libro.pdf",
        bytes: 4096,
        confirmadoAt: new Date(),
      },
      select: { id: true },
    });

    const pack = await db.product.create({
      data: {
        tenantId: tenant.id,
        titulo: "Pack 4 libros",
        descripcion: "d",
        precio: "10000",
        activo: true,
        fuenteId: libro.id,
        unidadesPorPack: 4,
        // F05: la portada del PRODUCTO, que es lo que la página de entrega va a usar como visual de
        // cada copia (un PDF no tiene miniatura presignada, así que sin esto se ve un ícono pelado).
        portadaUrl: "https://cdn.example/tapa-libro.png",
      },
      select: { id: true },
    });

    const token = randomUUID();
    await db.order.create({
      data: {
        tenantId: tenant.id,
        email: "fan@example.cl",
        estado: "PAGADO",
        total: "10000",
        items: {
          create: {
            tenantId: tenant.id,
            productId: pack.id,
            precio: "10000",
            cantidad: 1,
            unidadesPorPack: 4,
          },
        },
        downloadGrants: {
          create: {
            tenantId: tenant.id,
            productId: pack.id,
            token,
            expiresAt: EN_30_DIAS(),
          },
        },
      },
      select: { id: true },
    });

    const entrega = await getEntregaDeOrden({ db, token });
    const linea = entrega!.lineas[0]!;

    // 4 copias del mismo archivo (unidadesPorPack 4 × cantidad 1), todas con su botón.
    expect(linea.archivos).toHaveLength(4);
    expect(linea.archivos.every((a) => a.id === archivo.id)).toBe(true);
    expect(linea.archivos.every((a) => a.nombreArchivo === "el-libro.pdf")).toBe(true);
    // NO es una entrega al azar: la fuente es ESTANDAR, no una colección. El copy de la página
    // cuelga de acá, y decir «al azar» de un libro sería mentir.
    expect(linea.esSobre).toBe(false);

    /*
      F05 — la PORTADA del producto viaja con la línea, y es la del producto COMPRADO (el pack), no
      la de su fuente. Es exactamente este caso el que motivó la feature: 4 copias de un PDF, que no
      tienen miniatura presignada (de un PDF no se deriva un preview — sería derivar contenido del
      archivo vendible, D10) y hasta ahora se veían como 4 íconos genéricos indistinguibles.
    */
    expect(linea.portadaUrl).toBe("https://cdn.example/tapa-libro.png");
    // Y sigue sin filtrarse una sola key del bucket en lo que devuelve el use case (I2/ADR-0002):
    // las `keyServerOnly` existen para que el BORDE presigne y ahí mueren.
    expect(JSON.stringify({ ...linea, archivos: [] })).not.toContain("libro.pdf");

    // El enlace es el del correo de SIEMPRE, sin `?archivo=`: 4 copias del mismo archivo no son
    // algo entre lo que elegir, y ensuciar la URL de una compra normal sería una regresión.
    expect(linea.archivos.every((a) => a.urlDescarga === `/api/descargas/${token}`)).toBe(true);

    // Y CERO `PackAssignment`: las copias son presentación, no filas (V-I2).
    expect(
      await db.packAssignment.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);

    // El conjunto AUTORIZADO sigue siendo UN archivo: las copias no inflan lo que el endpoint
    // acepta en `?archivo=`.
    const autorizados = await archivosDelGrant({
      db,
      grant: { tenantId: tenant.id, orderId: (await db.order.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } })).id, productId: pack.id },
    });
    expect(autorizados).toHaveLength(1);
    expect(autorizados[0]!.id).toBe(archivo.id);
  });
});
