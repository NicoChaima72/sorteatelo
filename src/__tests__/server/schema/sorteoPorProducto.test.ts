import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";

/**
 * Tests DB-backed del SCHEMA de "sorteo por producto" (F01, ADR-0012). Se ejercen contra la DB
 * real porque lo que se verifica vive en Postgres/Prisma, no en un use case: los DEFAULTS de las
 * columnas nuevas (`Product.participaEnSorteo`, `OrderItem.cantidad`, `OrderItem.participaEnSorteo`,
 * `RaffleEntry.ordinal`) y el nuevo `@@unique([raffleId, orderId, ordinal])` (idempotencia por-ticket).
 *
 * Slugs `test-schema-sorteo-*` scopeados y limpiados antes/después (FK-safe: hijos antes que padres).
 */

const PREFIJO = "test-schema-sorteo-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
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

describe("schema/sorteo-por-producto (DB-backed)", () => {
  // sorteo.schema.001 — Product nace con participaEnSorteo = false si no se especifica (opt-in)
  it("un Product nace con participaEnSorteo = false por default (opt-in)", async () => {
    const t = await crearTenant("a");
    const p = await db.product.create({
      data: {
        tenantId: t.id,
        titulo: "Sin flag",
        descripcion: "desc",
        precio: "1000",
      },
      select: { participaEnSorteo: true },
    });
    expect(p.participaEnSorteo).toBe(false);

    // Y acepta true cuando se especifica.
    const p2 = await db.product.create({
      data: {
        tenantId: t.id,
        titulo: "Con flag",
        descripcion: "desc",
        precio: "1000",
        participaEnSorteo: true,
      },
      select: { participaEnSorteo: true },
    });
    expect(p2.participaEnSorteo).toBe(true);
  });

  // sorteo.schema.002 — OrderItem: cantidad default 1, acepta ≥1, y persiste participaEnSorteo snapshot
  it("un OrderItem toma cantidad default 1, acepta cantidad ≥ 1 y persiste participaEnSorteo como snapshot", async () => {
    const t = await crearTenant("b");
    const p1 = await db.product.create({
      data: { tenantId: t.id, titulo: "P1", descripcion: "d", precio: "1000" },
      select: { id: true },
    });
    const p2 = await db.product.create({
      data: { tenantId: t.id, titulo: "P2", descripcion: "d", precio: "1000" },
      select: { id: true },
    });

    const orden = await db.order.create({
      data: {
        tenantId: t.id,
        email: "fan@example.cl",
        estado: "PENDIENTE",
        total: "1000",
        items: {
          create: [
            // Sin `cantidad` explícita ⇒ default 1; participaEnSorteo snapshot true.
            { tenantId: t.id, productId: p1.id, precio: "1000", participaEnSorteo: true },
            // cantidad explícita 3; participaEnSorteo snapshot false (default).
            { tenantId: t.id, productId: p2.id, precio: "1000", cantidad: 3 },
          ],
        },
      },
      select: { id: true },
    });

    const items = await db.orderItem.findMany({
      where: { orderId: orden.id },
      select: { productId: true, cantidad: true, participaEnSorteo: true },
    });
    const porProducto = new Map(items.map((it) => [it.productId, it]));
    expect(porProducto.get(p1.id)).toMatchObject({ cantidad: 1, participaEnSorteo: true });
    expect(porProducto.get(p2.id)).toMatchObject({ cantidad: 3, participaEnSorteo: false });
  });

  // sorteo.schema.003 — RaffleEntry: ≥2 con mismo (raffleId, orderId) y ordinal distinto OK;
  //                     dos con el mismo (raffleId, orderId, ordinal) colisionan (unique)
  it("permite ≥2 RaffleEntry para el mismo (raffleId, orderId) con ordinal distinto; colisiona si el ordinal se repite", async () => {
    const t = await crearTenant("c");
    const p = await db.product.create({
      data: { tenantId: t.id, titulo: "P", descripcion: "d", precio: "1000" },
      select: { id: true },
    });
    const raffle = await db.raffle.create({
      data: {
        tenantId: t.id,
        nombre: "Sorteo",
        premio: "premio",
        estado: "ACTIVO",
        fechaInicio: new Date(Date.UTC(2026, 0, 1)),
        fechaFin: new Date(Date.UTC(2026, 11, 31)),
      },
      select: { id: true },
    });
    const orden = await db.order.create({
      data: {
        tenantId: t.id,
        email: "fan@example.cl",
        estado: "PAGADO",
        total: "1000",
        items: { create: [{ tenantId: t.id, productId: p.id, precio: "1000" }] },
      },
      select: { id: true },
    });

    // 3 entries con ordinal 0,1,2 para el mismo (raffle, orden) ⇒ OK.
    await db.raffleEntry.createMany({
      data: [0, 1, 2].map((ordinal) => ({
        tenantId: t.id,
        raffleId: raffle.id,
        orderId: orden.id,
        email: "fan@example.cl",
        ordinal,
      })),
    });
    expect(
      await db.raffleEntry.count({ where: { raffleId: raffle.id, orderId: orden.id } }),
    ).toBe(3);

    // Repetir un ordinal existente (0) para el mismo (raffle, orden) ⇒ viola el unique.
    await expect(
      db.raffleEntry.create({
        data: {
          tenantId: t.id,
          raffleId: raffle.id,
          orderId: orden.id,
          email: "fan@example.cl",
          ordinal: 0,
        },
      }),
    ).rejects.toThrow();
  });
});
