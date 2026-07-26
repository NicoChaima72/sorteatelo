import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { hayProductoEntregable } from "~/server/productos/productoEntregable";

/**
 * Test DB-backed del gate de publicación (productos-tipos-digitales F03, ampliado en F06).
 *
 * Va contra la DB REAL a propósito: lo que se verifica es que la QUERY le entregue a la regla pura
 * los datos correctos — el `_count` FILTRADO de archivos confirmados y la opción de pack ACTIVA más
 * grande — y eso lo resuelve Postgres, no TypeScript. Los tests del gate
 * (`publicarDespublicar`/`getEstadoPublicacion`) usan un `db` fake que responde por un flag:
 * perfectos para la POLÍTICA del gate, ciegos para esta parte. Sin este archivo, un `where` mal
 * puesto en el `_count` (o una `fuente` que no se trae) dejaría toda la suite verde y la Tienda
 * impublicable —o publicable de más— en producción.
 *
 * La regla en sí (qué combinación cuenta) se testea pura y sin DB en `productoEntregable.test.ts`.
 *
 * Contrato, actualizado por la **ENMIENDA v2** (E15/E17): la Tienda tiene ≥1 producto entregable si
 * tiene ≥1 producto `activo` **que se pueda comprar** y con qué cumplir. Las dos mitades importan:
 * una COLECCIÓN (`modalidad SOBRE`) no se vende directo, así que por llena que esté NO habilita la
 * publicación — quien habilita es el PACK que la usa, y ese es entregable si su fuente le alcanza.
 */

const PREFIJO = "test-hpe-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
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
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "CONFIGURACION" },
    select: { id: true },
  });
}

async function crearProducto({
  tenantId,
  titulo,
  activo,
  pdfPath = null,
  modalidad = "ESTANDAR",
  archivo,
  pool = 0,
  fuente,
}: {
  tenantId: string;
  titulo: string;
  activo: boolean;
  pdfPath?: string | null;
  modalidad?: "ESTANDAR" | "SOBRE";
  /** Para un ESTANDAR: qué archivo darle — ninguno, uno CONFIRMADO, o uno pendiente de confirmar. */
  archivo?: "confirmado" | "pendiente";
  /** Para una COLECCIÓN: cuántos archivos CONFIRMADOS sembrar en el pool. */
  pool?: number;
  /** Si es un PACK: de qué producto salen sus archivos y cuántos entrega (E15). */
  fuente?: { id: string; unidadesPorPack: number };
}) {
  const p = await db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "d",
      precio: "1000",
      activo,
      pdfPath,
      modalidad,
      ...(fuente
        ? { fuenteId: fuente.id, unidadesPorPack: fuente.unidadesPorPack }
        : {}),
    },
    select: { id: true },
  });
  if (archivo) {
    await db.productFile.create({
      data: {
        tenantId,
        productId: p.id,
        key: `${tenantId}/${p.id}/${archivo}.pdf`,
        contentType: "application/pdf",
        tipo: "PDF",
        nombreArchivo: `${titulo}.pdf`,
        confirmadoAt: archivo === "confirmado" ? new Date() : null,
      },
    });
  }
  // `createMany` en vez de N `create` secuenciales: la DB es Supabase REMOTA (~1-2s por roundtrip) y
  // sembrar el pool de a uno acercaba estos tests al `testTimeout` de 30s del repo.
  if (pool > 0) {
    await db.productFile.createMany({
      data: Array.from({ length: pool }, (_u, i) => ({
        tenantId,
        productId: p.id,
        key: `${tenantId}/${p.id}/pool-${i}.png`,
        contentType: "image/png",
        tipo: "IMAGEN" as const,
        nombreArchivo: `pool-${i}.png`,
        confirmadoAt: new Date(),
      })),
    });
  }
  return p;
}

describe("productos/hayProductoEntregable (DB real)", () => {
  // productos.gate.001 — la matriz de ESTANDAR: qué cuenta como entregable y qué no
  it("cuenta solo los activos con archivo confirmado o con el pdfPath legacy", async () => {
    const tenant = await crearTenant("uno");

    // Ninguno de estos habilita la publicación.
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Solo subida a medias",
      activo: true,
      archivo: "pendiente", // sin confirmar NO es entregable
    });
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Sin archivo",
      activo: true,
    });
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Inactivo pero con archivo",
      activo: false, // el gate exige ACTIVO
      archivo: "confirmado",
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(false);

    // Un confirmado alcanza.
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Con archivo confirmado",
      activo: true,
      archivo: "confirmado",
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(true);
  });

  // productos.gate.002 — I1: el gate de una Tienda no ve los productos entregables de otra
  it("no cuenta los productos entregables de OTRA Tienda", async () => {
    const [a, b] = await Promise.all([crearTenant("a"), crearTenant("b")]);

    // Solo B tiene un producto entregable.
    await crearProducto({
      tenantId: b.id,
      titulo: "De B",
      activo: true,
      archivo: "confirmado",
    });

    expect(await hayProductoEntregable({ db, tenantId: a.id })).toBe(false);
    expect(await hayProductoEntregable({ db, tenantId: b.id })).toBe(true);
  });

  // productos.gate.003 — la mitad EXPANDIR (F01): prod-viejo escribió la columna sin crear la fila
  it("cuenta un producto que solo tiene el pdfPath legacy", async () => {
    const tenant = await crearTenant("legacy");
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Solo pdfPath legacy",
      activo: true,
      pdfPath: `${tenant.id}/legacy.pdf`,
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(true);
  });

  // productos.gate.004 — el caso stickers bajo v2: quien habilita la publicación es el PACK, y solo
  // cuando el pool de su FUENTE le alcanza. Verifica que el select traiga la fuente ANIDADA: sin
  // ella, `fuente: null` se lee como "entrega lo suyo" y un pack (que no tiene archivos propios)
  // quedaría inentregable SIEMPRE — toda Tienda que venda por packs, impublicable.
  it("un pack publica solo cuando el pool de su colección cubre sus unidades", async () => {
    const tenant = await crearTenant("pack");
    const coleccion = await crearProducto({
      tenantId: tenant.id,
      titulo: "Colección de stickers",
      activo: true,
      modalidad: "SOBRE",
      pool: 3,
    });
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Pack 4 stickers",
      activo: true,
      fuente: { id: coleccion.id, unidadesPorPack: 4 }, // 4 no entra en un pool de 3
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(false);

    // Un archivo más al pool de la COLECCIÓN y el pack ya se puede armar (límite inclusivo).
    await db.productFile.create({
      data: {
        tenantId: tenant.id,
        productId: coleccion.id,
        key: `${tenant.id}/${coleccion.id}/pool-3.png`,
        contentType: "image/png",
        tipo: "IMAGEN",
        nombreArchivo: "pool-3.png",
        confirmadoAt: new Date(),
      },
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(true);
  });

  // productos.gate.005 — E17: «no quiero vender la unidad suelta» se resuelve DESPUBLICANDO la
  // fuente, sin flag nuevo. Su pack sigue a la venta y tiene que seguir habilitando la publicación.
  // Si el select filtrara la fuente por `activo`, este caso —el caso libro completo— se rompería.
  it("un pack cuya FUENTE está despublicada igual habilita la publicación", async () => {
    const tenant = await crearTenant("fuenteoff");
    const libro = await crearProducto({
      tenantId: tenant.id,
      titulo: "El libro",
      activo: false, // la unidad suelta NO se vende
      archivo: "confirmado",
    });
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Pack 4 libros",
      activo: true,
      fuente: { id: libro.id, unidadesPorPack: 4 },
    });
    // Fuente ESTANDAR ⇒ con UN archivo alcanza por grande que sea el pack (las copias se derivan).
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(true);
  });

  // productos.gate.006 — una COLECCIÓN no se vende directo, así que por llena que esté NO habilita
  // la publicación por sí sola. Sin esta mitad, una Tienda cuyo único producto activo fuera la
  // colección quedaría PUBLICADA con la vitrina vacía: el catálogo excluye `modalidad = SOBRE`.
  it("una colección con el pool lleno pero sin ningún pack no publica", async () => {
    const tenant = await crearTenant("solocoleccion");
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Colección sin packs",
      activo: true,
      modalidad: "SOBRE",
      pool: 12,
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(false);
  });

  // productos.gate.007 — los archivos PENDIENTES no cuentan como pool: el `_count` filtrado por
  // `confirmadoAt != null` —y en la FUENTE anidada, no solo en el producto— es lo que impide que
  // subidas a medio camino habiliten un pack que después no podría entregar.
  it("no cuenta los archivos sin confirmar del pool de la colección", async () => {
    const tenant = await crearTenant("pendientes");
    const coleccion = await crearProducto({
      tenantId: tenant.id,
      titulo: "Colección con subidas a medias",
      activo: true,
      modalidad: "SOBRE",
      pool: 1, // 1 confirmado
    });
    await crearProducto({
      tenantId: tenant.id,
      titulo: "Pack 2",
      activo: true,
      fuente: { id: coleccion.id, unidadesPorPack: 2 },
    });
    // Dos filas SIN confirmar: existen, pero no son pool.
    await db.productFile.createMany({
      data: [0, 1].map((i) => ({
        tenantId: tenant.id,
        productId: coleccion.id,
        key: `${tenant.id}/${coleccion.id}/pendiente-${i}.png`,
        contentType: "image/png",
        tipo: "IMAGEN" as const,
        nombreArchivo: `pendiente-${i}.png`,
        confirmadoAt: null,
      })),
    });
    expect(await hayProductoEntregable({ db, tenantId: tenant.id })).toBe(false);
  });
});
