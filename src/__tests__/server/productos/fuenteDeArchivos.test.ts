import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { DomainError } from "~/server/domain/errors";
import { resolverFuenteDePack } from "~/server/productos/fuenteDeArchivos";

/**
 * **La FUENTE de un pack** (productos-tipos-digitales ENMIENDA v2, F10 — E14/E15/V-I1).
 *
 * Bajo el modelo v2 un pack ES un producto más: una fila de `Product` con `fuenteId` +
 * `unidadesPorPack`. Este archivo cubre las DOS mitades de esa relación:
 *
 *  1. Lo que garantiza **Postgres** — el `@default(1)` de `unidadesPorPack`, el `fuenteId` nullable
 *     que deja a toda fila histórica como producto normal, y el `onDelete: Restrict` de la
 *     self-relation. Ese Restrict merece test propio porque para una fuente vendida SOLO vía packs
 *     es el ÚNICO guard que existe: no hay `OrderItem` ni `DownloadGrant` apuntándole (apuntan al
 *     PACK) y tampoco `PackAssignment` (V-I2). Sin él, borrar la fuente cascadearía sus
 *     `ProductFile` y dejaría 404 a todo el que ya compró el pack.
 *  2. Lo que garantiza el **use case** — las tres reglas de V-I1 que Prisma no expresa (fuente del
 *     mismo tenant, sin cadenas, sin auto-referencia). Van contra la DB real y no contra un `db`
 *     fake a propósito: lo que se está probando es justamente que el `where` lleve el `tenantId`, y
 *     un fake que ignore el `where` volvería VERDE el olvido de ese filtro (misma trampa que
 *     documentó F03 con el gate de publicación).
 *
 * Slugs `test-fuente-*` scopeados y limpiados antes/después (FK-safe: hijos antes que padres, y los
 * PACKS antes que sus fuentes — el `Restrict` de la self-relation aborta el borrado si no).
 */

const PREFIJO = "test-fuente-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  await db.productFile.deleteMany({ where: { tenantId: { in: ids } } });
  // Los packs PRIMERO: el `onDelete: Restrict` de la self-relation aborta el borrado de una fuente
  // que todavía tenga packs colgando (que es justo lo que este archivo testea).
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

/** Un producto cualquiera de la Tienda. Sin `fuenteId` ⇒ producto normal (candidato a fuente). */
async function crearProducto({
  tenantId,
  titulo,
  modalidad = "ESTANDAR",
  fuenteId,
  unidadesPorPack,
}: {
  tenantId: string;
  titulo: string;
  modalidad?: "ESTANDAR" | "SOBRE";
  fuenteId?: string;
  unidadesPorPack?: number;
}) {
  return db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "producto de prueba",
      precio: "3000",
      modalidad,
      ...(fuenteId !== undefined ? { fuenteId } : {}),
      ...(unidadesPorPack !== undefined ? { unidadesPorPack } : {}),
    },
    select: { id: true, fuenteId: true, unidadesPorPack: true },
  });
}

describe("resolverFuenteDePack", () => {
  it("productos.fuente.001 — resuelve la fuente del MISMO tenant y devuelve su modalidad", async () => {
    const tenant = await crearTenant("uno");
    const fuente = await crearProducto({
      tenantId: tenant.id,
      titulo: "El libro",
    });

    const resuelta = await resolverFuenteDePack({
      db,
      tenantId: tenant.id,
      fuenteId: fuente.id,
    });

    expect(resuelta).toEqual({ id: fuente.id, modalidad: "ESTANDAR" });
  });

  it("productos.fuente.002 — una fuente de OTRA Tienda se rechaza, con el mismo mensaje que una inexistente", async () => {
    const mia = await crearTenant("mia");
    const ajena = await crearTenant("ajena");
    const productoAjeno = await crearProducto({
      tenantId: ajena.id,
      titulo: "El libro de la otra tienda",
    });

    const rechazo = await resolverFuenteDePack({
      db,
      tenantId: mia.id,
      fuenteId: productoAjeno.id,
    }).catch((e: unknown) => e);

    expect(rechazo).toBeInstanceOf(DomainError);
    expect((rechazo as DomainError).code).toBe("INVALID");

    // Neutralidad: el rechazo de lo AJENO es indistinguible del de lo INEXISTENTE. Si difirieran,
    // el mensaje sería un oráculo para enumerar productos de otras Tiendas (I1).
    const inexistente = await resolverFuenteDePack({
      db,
      tenantId: mia.id,
      fuenteId: "clzzzzzzzzzzzzzzzzzzzzzzz",
    }).catch((e: unknown) => e);

    expect((inexistente as DomainError).message).toBe(
      (rechazo as DomainError).message,
    );

    // Y el producto ajeno sigue intacto: un rechazo no toca nada de la otra Tienda.
    await expect(
      db.product.count({ where: { tenantId: ajena.id } }),
    ).resolves.toBe(1);
  });

  it("productos.fuente.003 — SIN CADENAS: un pack no puede ser fuente de otro pack", async () => {
    const tenant = await crearTenant("cadena");
    const fuente = await crearProducto({
      tenantId: tenant.id,
      titulo: "La colección",
      modalidad: "SOBRE",
    });
    // Un pack legítimo de primer nivel…
    const pack = await crearProducto({
      tenantId: tenant.id,
      titulo: "Pack de 4",
      fuenteId: fuente.id,
      unidadesPorPack: 4,
    });

    // …no puede ser la fuente de un segundo. La cadena obligaría a resolver un grafo para saber qué
    // archivo entregar y a multiplicar unidades entre niveles: un nivel es todo lo que el dominio
    // necesita (E15).
    const rechazo = await resolverFuenteDePack({
      db,
      tenantId: tenant.id,
      fuenteId: pack.id,
    }).catch((e: unknown) => e);

    expect(rechazo).toBeInstanceOf(DomainError);
    expect((rechazo as DomainError).code).toBe("INVALID");

    // Neutralidad de 3 vías: la cadena da el MISMO mensaje que lo ajeno/inexistente. Está aseverado
    // y no solo declarado en el docblock, para que nadie lo diferencie mañana dejando los tests verdes.
    const ajeno = await resolverFuenteDePack({
      db,
      tenantId: tenant.id,
      fuenteId: "clzzzzzzzzzzzzzzzzzzzzzzz",
    }).catch((e: unknown) => e);
    expect((rechazo as DomainError).message).toBe(
      (ajeno as DomainError).message,
    );

    // La fuente de primer nivel SÍ sigue siendo elegible: lo que se rechaza es el eslabón, no la idea.
    await expect(
      resolverFuenteDePack({ db, tenantId: tenant.id, fuenteId: fuente.id }),
    ).resolves.toEqual({ id: fuente.id, modalidad: "SOBRE" });
  });

  it("productos.fuente.004 — una fuente DESPUBLICADA sigue siendo elegible: así se vende «solo el pack» (E17)", async () => {
    const tenant = await crearTenant("inactiva");
    const fuente = await crearProducto({
      tenantId: tenant.id,
      titulo: "El libro",
    });
    // "No quiero vender la unidad suelta" se resuelve DESPUBLICANDO ese producto — sin flag nuevo
    // (E17). El pack de 4 sigue a la venta y tiene que poder entregar.
    await db.product.update({
      where: { id: fuente.id },
      data: { activo: false },
    });

    await expect(
      resolverFuenteDePack({ db, tenantId: tenant.id, fuenteId: fuente.id }),
    ).resolves.toEqual({ id: fuente.id, modalidad: "ESTANDAR" });
  });
});

describe("schema de la self-relation (lo que garantiza Postgres)", () => {
  it("productos.fuente.005 — un producto nace `fuenteId: null` y `unidadesPorPack: 1`: cero cambio para lo ya vendido", async () => {
    const tenant = await crearTenant("defaults");

    // Se crea SIN mencionar ninguna de las dos columnas nuevas, que es exactamente lo que hace el
    // código VIEJO deployado contra esta misma DB (ADR-0015) y lo que ocurrió con toda fila histórica.
    const producto = await crearProducto({
      tenantId: tenant.id,
      titulo: "Un producto de siempre",
    });

    // `null` = entrega lo suyo (producto normal), y `1` es un hecho VERDADERO —vende 1 unidad de sí
    // mismo—, no un relleno: por eso la columna es NOT NULL con default y no nullable. La
    // consecuencia buscada es que `unidadesPorPack × cantidad` valga uniforme sin un `?? 1` en cada
    // caller, y un `??` olvidado son 0 tickets para alguien que YA PAGÓ.
    expect(producto.fuenteId).toBeNull();
    expect(producto.unidadesPorPack).toBe(1);
  });

  it("productos.fuente.006 — un pack persiste su fuente y sus unidades, y la fuente lo ve por la back-relation", async () => {
    const tenant = await crearTenant("persiste");
    const fuente = await crearProducto({
      tenantId: tenant.id,
      titulo: "El libro",
    });
    const pack = await crearProducto({
      tenantId: tenant.id,
      titulo: "Pack 4 libros",
      fuenteId: fuente.id,
      unidadesPorPack: 4,
    });

    expect(pack.fuenteId).toBe(fuente.id);
    expect(pack.unidadesPorPack).toBe(4);

    const conPacks = await db.product.findUniqueOrThrow({
      where: { id: fuente.id },
      select: { packs: { select: { id: true, unidadesPorPack: true } } },
    });
    expect(conPacks.packs).toEqual([{ id: pack.id, unidadesPorPack: 4 }]);
  });

  it("productos.fuente.007 — `onDelete: Restrict`: una fuente con packs colgando es indeleble; sin packs se borra", async () => {
    const tenant = await crearTenant("restrict");
    const fuente = await crearProducto({
      tenantId: tenant.id,
      titulo: "El libro",
    });
    const pack = await crearProducto({
      tenantId: tenant.id,
      titulo: "Pack 4 libros",
      fuenteId: fuente.id,
      unidadesPorPack: 4,
    });

    // Este Restrict NO es ceremonia: para una fuente vendida SOLO vía packs es el ÚNICO guard que
    // existe (no hay OrderItem ni DownloadGrant apuntándole —apuntan al PACK— ni PackAssignment,
    // V-I2). Sin él, borrar la fuente cascadearía sus ProductFile y dejaría 404 a quien ya compró.
    await expect(
      db.product.delete({ where: { id: fuente.id } }),
    ).rejects.toThrow();

    // Y no se borró a medias: la fuente sigue ahí.
    await expect(
      db.product.count({ where: { id: fuente.id } }),
    ).resolves.toBe(1);

    // Liberar la fuente exige borrar antes sus packs (y `fuenteId` es inmutable, así que no hay
    // "re-apuntar"). Hecho eso, se borra normal.
    await db.product.delete({ where: { id: pack.id } });
    await expect(
      db.product.delete({ where: { id: fuente.id } }),
    ).resolves.toMatchObject({ id: fuente.id });
  });
});
