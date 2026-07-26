import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { manejarDescarga } from "~/server/descargas/manejarDescarga";
import {
  archivosEntregablesDeProducto,
  archivosParaEntrega,
} from "~/server/productos/archivosDeProducto";
import { backfillArchivosDeProducto } from "../../../scripts/backfill-product-files";

/**
 * Test DB-backed del núcleo del backfill `Product.pdfPath` → `ProductFile` (productos-tipos-digitales
 * F01, D2). Se ejerce contra la DB real porque lo que importa —el unique GLOBAL de `key` como llave
 * de idempotencia, y que la descarga del Comprador siga funcionando— vive en la semántica de
 * Postgres y del pipeline, no en la del script.
 *
 * Contrato del backfill (fase EXPANDIR, DB compartida dev=prod — ADR-0015): por cada producto con
 * `pdfPath` no-null crear UNA fila `ProductFile` CONFIRMADA equivalente (misma key VERBATIM, tipo
 * PDF), sin tocar `pdfPath` ni ninguna otra columna, y ser RE-CORRIBLE — prod corre código VIEJO
 * contra la misma DB y puede escribir `pdfPath` nuevos después de la primera corrida.
 *
 * ⚠ **El núcleo barre la DB ENTERA a propósito** (es lo que hace en producción), así que estos
 * tests también migran los productos reales que tengan `pdfPath`. Es seguro y deliberado: el
 * backfill es ADITIVO e IDEMPOTENTE, y esas filas son exactamente las que hay que crear igual. Por
 * eso las aserciones filtran por el tenant del caso (`r.tenantId === tenant.id`) en vez de asumir
 * que el resultado global es solo suyo, y `limpiar()` borra ÚNICAMENTE lo prefijado. Acotar el
 * barrido con un parámetro solo-para-tests debilitaría justo la propiedad que se quiere verificar.
 */

const PREFIJO = "test-bkfpf-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // Orden FK-safe: hijos (Restrict/Cascade) antes que sus padres.
  await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
  await db.productFile.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
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

/** Producto con su PDF ya subido, tal como lo dejó `confirmarPdfProducto` antes de esta feature. */
async function crearProductoConPdfLegacy(tenantId: string, titulo: string) {
  const producto = await db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "descripcion",
      precio: "5000",
      activo: true,
    },
    select: { id: true },
  });
  // La key LEGACY determinística de F03 de entrega-storage-r2: `<tenantId>/<productId>.pdf`.
  await db.product.update({
    where: { id: producto.id },
    data: { pdfPath: `${tenantId}/${producto.id}.pdf` },
  });
  return producto;
}

async function crearGrantVigente(tenantId: string, productId: string, token: string) {
  const orden = await db.order.create({
    data: { tenantId, email: "compradora@example.com", estado: "PAGADO", total: "5000" },
    select: { id: true },
  });
  await db.downloadGrant.create({
    data: {
      tenantId,
      orderId: orden.id,
      productId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

describe("scripts/backfill-product-files (DB real)", () => {
  // productos.backfill.001 — migración 1:1 + la descarga del Comprador NO se rompe
  it("un producto con pdfPath queda con exactamente un ProductFile confirmado equivalente y su grant sigue resolviendo 302", async () => {
    const tenant = await crearTenant("uno");
    const producto = await crearProductoConPdfLegacy(tenant.id, "Guía del Idol");
    const token = `${PREFIJO}token-001`;
    await crearGrantVigente(tenant.id, producto.id, token);

    const resultado = await backfillArchivosDeProducto({ db });

    // El backfill reporta este producto como creado en ESTA corrida.
    const mio = resultado.filter((r) => r.tenantId === tenant.id);
    expect(mio).toHaveLength(1);
    expect(mio[0]).toMatchObject({ productId: producto.id, estado: "creado" });

    // Exactamente UN ProductFile, confirmado, con la key VERBATIM del pdfPath legacy.
    const archivos = await db.productFile.findMany({
      where: { productId: producto.id },
    });
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatchObject({
      tenantId: tenant.id,
      productId: producto.id,
      key: `${tenant.id}/${producto.id}.pdf`,
      contentType: "application/pdf",
      tipo: "PDF",
      // El backfill NO le pega a R2 ⇒ el tamaño real es DESCONOCIDO, no cero (D8).
      bytes: null,
    });
    expect(archivos[0]?.confirmadoAt).not.toBeNull();

    // `pdfPath` intacto: la fase EXPANDIR no toca la columna que lee el código viejo en prod.
    const despues = await db.product.findUniqueOrThrow({
      where: { id: producto.id },
      select: { pdfPath: true },
    });
    expect(despues.pdfPath).toBe(`${tenant.id}/${producto.id}.pdf`);

    // El Entitlement del Comprador sigue resolviendo 302 a una URL prefirmada de ESA key.
    const respuesta = await manejarDescarga({
      req: { method: "GET", query: { token } },
      // Mismo repo que el wrapper de producción (`pages/api/descargas/[token].ts`): resuelve el
      // archivo con `archivosParaEntrega`, que es el camino REAL desde F03.
      buscarGrant: async (t) => {
        const g = await db.downloadGrant.findUnique({
          where: { token: t },
          select: { tenantId: true, expiresAt: true, productId: true },
        });
        if (!g) return null;
        const [archivo] = await archivosParaEntrega({
          db,
          tenantId: g.tenantId,
          productId: g.productId,
        });
        return {
          tenantId: g.tenantId,
          expiresAt: g.expiresAt,
          archivo: archivo
            ? {
                key: archivo.key,
                contentType: archivo.contentType,
                nombreArchivo: archivo.nombreArchivo,
              }
            : null,
        };
      },
      presignarDescarga: async ({ key }) => `https://r2.example/${key}?firma`,
    });
    expect(respuesta.status).toBe(302);
    expect(respuesta.headers?.Location).toContain(`${tenant.id}/${producto.id}.pdf`);
  });

  // productos.backfill.002 — re-corrible: no duplica lo migrado y SÍ recoge lo que prod-viejo
  // escribió después de la primera corrida (la ventana real de la fase EXPANDIR).
  it("re-correrlo no duplica y recoge los pdfPath que aparecieron después de la primera corrida", async () => {
    const tenant = await crearTenant("dos");
    const viejo = await crearProductoConPdfLegacy(tenant.id, "Ya migrado");

    await backfillArchivosDeProducto({ db });
    const primeraCorrida = await db.productFile.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    expect(primeraCorrida).toHaveLength(1);
    const idOriginal = primeraCorrida[0]?.id;

    // Simula al código VIEJO deployado en prod: escribe un `pdfPath` nuevo sin saber que
    // `ProductFile` existe. Es exactamente lo que puede pasar entre el backfill y el deploy.
    const rezagado = await crearProductoConPdfLegacy(tenant.id, "Subido por prod viejo");

    const segunda = await backfillArchivosDeProducto({ db });
    const mios = segunda.filter((r) => r.tenantId === tenant.id);

    // El ya migrado se reporta como no-op; el rezagado, como creado.
    expect(mios.find((r) => r.productId === viejo.id)?.estado).toBe("ya-migrado");
    expect(mios.find((r) => r.productId === rezagado.id)?.estado).toBe("creado");

    // Una fila por producto: la re-corrida no duplicó ni recreó la original.
    const archivos = await db.productFile.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, productId: true },
    });
    expect(archivos).toHaveLength(2);
    expect(archivos.map((a) => a.id)).toContain(idOriginal);
  });

  // productos.archivos.001 — I1: el archivo de un tenant NO es visible desde otro, y los archivos
  // sin confirmar quedan fuera de lo entregable.
  it("los archivos entregables se leen tenant-scoped: los de otra Tienda no son visibles y los sin confirmar quedan fuera", async () => {
    const tenantA = await crearTenant("iso-a");
    const tenantB = await crearTenant("iso-b");
    const productoA = await crearProductoConPdfLegacy(tenantA.id, "De la Tienda A");
    const productoB = await crearProductoConPdfLegacy(tenantB.id, "De la Tienda B");
    await backfillArchivosDeProducto({ db });

    // Un archivo del producto A todavía SIN confirmar (subida a medio camino).
    await db.productFile.create({
      data: {
        tenantId: tenantA.id,
        productId: productoA.id,
        key: `${tenantA.id}/${productoA.id}/pendiente.pdf`,
        contentType: "application/pdf",
        tipo: "PDF",
        nombreArchivo: "pendiente.pdf",
        confirmadoAt: null,
      },
    });

    // Desde el tenant dueño: solo el confirmado.
    const deA = await archivosEntregablesDeProducto({
      db,
      tenantId: tenantA.id,
      productId: productoA.id,
    });
    expect(deA).toHaveLength(1);
    expect(deA[0]?.key).toBe(`${tenantA.id}/${productoA.id}.pdf`);

    // El producto de OTRA Tienda es invisible aunque se conozca su id (ADR-0005/I1): lista vacía,
    // indistinguible de "no tiene archivos" — sin fuga de existencia cross-tenant.
    const cruzado = await archivosEntregablesDeProducto({
      db,
      tenantId: tenantA.id,
      productId: productoB.id,
    });
    expect(cruzado).toEqual([]);
  });
});
