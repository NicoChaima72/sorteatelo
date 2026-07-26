import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";

/**
 * Tests DB-backed del SCHEMA de "sorteo por producto" (F01, ADR-0012). Se ejercen contra la DB
 * real porque lo que se verifica vive en Postgres/Prisma, no en un use case: los DEFAULTS de las
 * columnas nuevas (`Product.participaEnSorteo`, `OrderItem.cantidad`, `OrderItem.participaEnSorteo`,
 * `RaffleEntry.ordinal`) y el nuevo `@@unique([raffleId, orderId, ordinal])` (idempotencia por-ticket).
 *
 * Desde ADR-0024 cubre además el `@@unique([raffleId, numero])` del Número del sorteo (004): la capa
 * final de I4, que ningún test de use case alcanza porque el contador de `Raffle` los coordina antes.
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
        numero: ordinal + 1, // Número del sorteo (ADR-0024): NOT NULL, lo asigna el writer
      })),
    });
    expect(
      await db.raffleEntry.count({ where: { raffleId: raffle.id, orderId: orden.id } }),
    ).toBe(3);

    // Repetir un ordinal existente (0) para el mismo (raffle, orden) ⇒ viola el unique.
    // El `numero` va LIBRE (99, no emitido) a propósito: si reusáramos uno, el rechazo lo podría
    // estar causando `@@unique([raffleId, numero])` y el test dejaría de probar lo que dice probar.
    await expect(
      db.raffleEntry.create({
        data: {
          tenantId: t.id,
          raffleId: raffle.id,
          orderId: orden.id,
          email: "fan@example.cl",
          ordinal: 0,
          numero: 99,
        },
      }),
    ).rejects.toThrow();
  });

  // sorteo.schema.004 — el @@unique([raffleId, numero]) de ADR-0024 §3 existe EN LA DB: dos tickets
  //                     no pueden compartir Número del sorteo, y el namespace es POR RAFFLE.
  // Es la capa final de I4 y el único test que se pone rojo si el schema no está pusheado en un
  // entorno nuevo (los use cases coordinan con el contador y nunca llegan a chocar contra ella).
  it("rechaza dos RaffleEntry con el mismo numero en un raffle, pero el mismo numero convive en raffles distintos", async () => {
    const t = await crearTenant("d");
    const p = await db.product.create({
      data: { tenantId: t.id, titulo: "P", descripcion: "d", precio: "1000" },
      select: { id: true },
    });
    const crearRaffle = (nombre: string) =>
      db.raffle.create({
        data: {
          tenantId: t.id,
          nombre,
          premio: "premio",
          estado: "CERRADO",
          fechaInicio: new Date(Date.UTC(2026, 0, 1)),
          fechaFin: new Date(Date.UTC(2026, 11, 31)),
        },
        select: { id: true },
      });
    const raffleA = await crearRaffle("Sorteo A");
    const raffleB = await crearRaffle("Sorteo B");
    const crearOrden = () =>
      db.order.create({
        data: {
          tenantId: t.id,
          email: "fan@example.cl",
          estado: "PAGADO",
          total: "1000",
          items: { create: [{ tenantId: t.id, productId: p.id, precio: "1000" }] },
        },
        select: { id: true },
      });
    const orden1 = await crearOrden();
    const orden2 = await crearOrden();

    const entry = (raffleId: string, orderId: string, numero: number) => ({
      tenantId: t.id,
      raffleId,
      orderId,
      email: "fan@example.cl",
      ordinal: 0,
      numero,
    });

    await db.raffleEntry.create({ data: entry(raffleA.id, orden1.id, 7) });

    // Mismo número, MISMO raffle, otra orden (así el unique de ordinal no interfiere) ⇒ rechazado.
    await expect(
      db.raffleEntry.create({ data: entry(raffleA.id, orden2.id, 7) }),
    ).rejects.toThrow();

    // Mismo número en OTRO raffle ⇒ permitido: cada sorteo numera desde 1 en su propio namespace.
    const enB = await db.raffleEntry.create({
      data: entry(raffleB.id, orden1.id, 7),
      select: { numero: true },
    });
    expect(enB.numero).toBe(7);
  });
});
