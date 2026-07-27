import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { TOOLS } from "~/server/mcp/tools/registro";
import { db } from "~/server/db";

/**
 * Tools de CATÁLOGO contra DB real — regresión del bug de `actualizar_producto` (2026-07-27):
 * la tool no recibe `unidadesPorPack` pero el input del panel lo trae con `.default(1)`, así que
 * parsear sin él RESETEABA las unidades de un pack a 1 en cada edición (le pasó al «Pack 4 Libros»
 * de iselk). La tool ahora preserva el valor vigente leyéndolo del listado tenant-scoped.
 */

const PREFIJO = "test-mcp-catalogo-";

async function limpiar() {
  // Primero los packs (la self-relation de fuente es Restrict) y después el resto.
  await db.product.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } }, fuenteId: { not: null } },
  });
  await db.product.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.storefrontPage.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenantMembership.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenant.deleteMany({ where: { slug: { startsWith: PREFIJO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

function tool(nombre: string) {
  const t = TOOLS.find((x) => x.nombre === nombre);
  if (!t) throw new Error(`La tool "${nombre}" no está en el registro.`);
  return t;
}

/** Tienda del organizador vía la MISMA tool de alta, + un libro fuente y su pack de 4. */
async function tiendaConPack() {
  const user = await db.user.create({
    data: { email: `${PREFIJO}org@example.cl`, name: "Org" },
    select: { id: true, email: true },
  });
  const ctx: ContextoMcp = {
    db,
    userId: user.id,
    email: user.email,
    clientId: `${PREFIJO}cli`,
    scopes: ["mcp"],
    membresias: [],
  };
  await tool("crear_tienda").manejar(
    { direccion: `${PREFIJO}mia`, nombre: "Tienda con packs" },
    ctx,
  );
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { slug: `${PREFIJO}mia` },
    select: { id: true, slug: true },
  });
  const ctxConTienda: ContextoMcp = {
    ...ctx,
    membresias: [{ tenantId: tenant.id, slug: tenant.slug }],
  };

  const libro = await db.product.create({
    data: {
      tenantId: tenant.id,
      titulo: "El libro",
      descripcion: "El libro fuente.",
      precio: "3000",
      activo: true,
      participaEnSorteo: true,
      modalidad: "ESTANDAR",
      // Con archivo CONFIRMADO: el gate «la fuente del pack tiene contenido» corre en cada
      // actualización de un pack activo, y sin esto el update se rechaza antes de llegar al bug.
      files: {
        create: {
          tenantId: tenant.id,
          key: `${tenant.id}/${PREFIJO}libro.pdf`,
          contentType: "application/pdf",
          tipo: "PDF",
          bytes: 1024,
          nombreArchivo: "libro.pdf",
          confirmadoAt: new Date(),
        },
      },
    },
    select: { id: true },
  });
  const pack = await db.product.create({
    data: {
      tenantId: tenant.id,
      titulo: "Pack 4 Libros",
      descripcion: "Cuatro copias del libro.",
      precio: "10000",
      activo: true,
      participaEnSorteo: true,
      modalidad: "ESTANDAR",
      fuenteId: libro.id,
      unidadesPorPack: 4,
    },
    select: { id: true },
  });

  return { tenant, ctxConTienda, libro, pack };
}

describe("mcp/tools de catálogo (DB-backed)", () => {
  // mcp.catalogo.001 — editar un pack por MCP NO le resetea las unidades ni la fuente
  it("actualizar_producto preserva unidadesPorPack y fuenteId de un pack", async () => {
    const { tenant, ctxConTienda, libro, pack } = await tiendaConPack();

    await tool("actualizar_producto").manejar(
      {
        tienda: tenant.slug,
        id: pack.id,
        titulo: "Pack 4 Libros (renombrado)",
        descripcion: "Cuatro copias del libro, ahora con mejor copy.",
        precio: "10000",
        activo: true,
        participaEnSorteo: true,
      },
      ctxConTienda,
    );

    const fila = await db.product.findUniqueOrThrow({
      where: { id: pack.id },
      select: { titulo: true, unidadesPorPack: true, fuenteId: true },
    });
    expect(fila.titulo).toBe("Pack 4 Libros (renombrado)");
    // EL bug: sin la preservación, esto quedaba en 1 y el pack vendía 4 tickets como 1.
    expect(fila.unidadesPorPack).toBe(4);
    expect(fila.fuenteId).toBe(libro.id);
  });

  // mcp.catalogo.002 — un id que no es de la tienda no aparece en el listado scoped ⇒ NOT_FOUND
  it("actualizar_producto rechaza un id inexistente sin tocar nada", async () => {
    const { tenant, ctxConTienda, pack } = await tiendaConPack();

    await expect(
      tool("actualizar_producto").manejar(
        {
          tienda: tenant.slug,
          id: "cccccccccccccccccccccccc",
          titulo: "No debería escribirse",
          descripcion: "No debería escribirse.",
          precio: "9999",
          activo: true,
          participaEnSorteo: false,
        },
        ctxConTienda,
      ),
    ).rejects.toThrow(/no existe en esta tienda/);

    const fila = await db.product.findUniqueOrThrow({
      where: { id: pack.id },
      select: { titulo: true, unidadesPorPack: true },
    });
    expect(fila.titulo).toBe("Pack 4 Libros");
    expect(fila.unidadesPorPack).toBe(4);
  });
});
