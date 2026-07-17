import { randomUUID } from "node:crypto";

import { type OrderStatus, type RaffleStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { aplicarEfectosPostPago } from "~/server/domain/pago/aplicarEfectosPostPago";
import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
import type {
  EnrutarFlowFn,
  FlowRuteado,
} from "~/server/pago/enrutarPagoFlow";
import type { FlowGetStatusResponse } from "~/server/services/flow";
import { manejarWebhookFlow } from "~/server/pago/webhookFlow";

/**
 * Tests DB-backed de `aplicarEfectosPostPago` (F02). Se ejercen contra la DB real (S9)
 * porque las propiedades clave — idempotencia por `@@unique` + `skipDuplicates`, scoping
 * del lookup del raffle, aislamiento cross-tenant y rollback DENTRO de la `$transaction` —
 * viven en la semántica de Prisma/Postgres, no en el use case aislado. Cada test crea sus
 * tenants/productos/órdenes/raffles con slugs `test-efectos-*` y limpia antes/después.
 */

const PREFIJO = "test-efectos-";
const DIA_MS = 24 * 60 * 60 * 1000;

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // Orden FK-safe: hijos (Restrict) antes que sus padres.
  await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.payment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

// ── Fixtures ────────────────────────────────────────────────────────────────
async function crearTenant(nombre: string) {
  return db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA" },
    select: { id: true },
  });
}

async function crearProducto(tenantId: string, titulo: string) {
  return db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "desc",
      precio: "1000",
      pdfPath: `${tenantId}/${titulo}.pdf`,
    },
    select: { id: true },
  });
}

async function crearRaffle(
  tenantId: string,
  estado: RaffleStatus,
  nombre = "Sorteo",
) {
  return db.raffle.create({
    data: {
      tenantId,
      nombre,
      premio: "premio",
      estado,
      fechaInicio: new Date(Date.UTC(2026, 0, 1)),
      fechaFin: new Date(Date.UTC(2026, 11, 31)),
    },
    select: { id: true },
  });
}

async function crearOrden(
  tenantId: string,
  email: string,
  productIds: string[],
  estado: OrderStatus = "PAGADO",
) {
  return db.order.create({
    data: {
      tenantId,
      email,
      estado,
      total: "1000",
      items: {
        create: productIds.map((productId) => ({
          tenantId,
          productId,
          precio: "1000",
        })),
      },
    },
    select: { id: true },
  });
}

/** Orden PENDIENTE + Payment PENDIENTE con token (para el test del webhook real). */
async function crearOrdenConPago(
  tenantId: string,
  email: string,
  productIds: string[],
) {
  const token = randomUUID();
  const order = await db.order.create({
    data: {
      tenantId,
      email,
      estado: "PENDIENTE",
      total: "1000",
      items: {
        create: productIds.map((productId) => ({
          tenantId,
          productId,
          precio: "1000",
        })),
      },
      payment: {
        create: { tenantId, estado: "PENDIENTE", monto: "1000", token },
      },
    },
    select: { id: true },
  });
  return { orderId: order.id, token };
}

/** Corre el use case dentro de una $transaction real (como lo hace el webhook). */
function aplicar(orderId: string) {
  return db.$transaction((tx) => aplicarEfectosPostPago({ tx, orderId }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("domain/pago/aplicarEfectosPostPago (DB-backed, tenant-scoped)", () => {
  // efectos.001 — N ítems ⇒ N DownloadGrant con token, expiresAt y tenantId de la orden
  it("crea exactamente N DownloadGrant (uno por ítem) con token único, expiresAt y el tenantId de la orden", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    const p3 = await crearProducto(t.id, "P3");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [p1.id, p2.id, p3.id]);

    await aplicar(orden.id);

    const grants = await db.downloadGrant.findMany({
      where: { orderId: orden.id },
    });
    expect(grants).toHaveLength(3);
    expect(new Set(grants.map((g) => g.productId))).toEqual(
      new Set([p1.id, p2.id, p3.id]),
    );
    // Cada grant: token no vacío + único, tenantId de la orden, expiresAt ~30 días.
    expect(new Set(grants.map((g) => g.token)).size).toBe(3);
    for (const g of grants) {
      expect(g.token.length).toBeGreaterThan(0);
      expect(g.tenantId).toBe(t.id);
      expect(g.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DIA_MS);
      expect(g.expiresAt.getTime()).toBeLessThan(Date.now() + 31 * DIA_MS);
    }
  });

  // efectos.002 — 1 RaffleEntry en el ACTIVO del tenant de la orden, con tenantId + email snapshot
  it("crea una RaffleEntry en el Raffle ACTIVO del tenant de la orden, con tenantId y email copiado de Order.email", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "compradora@example.cl", [p.id]);

    await aplicar(orden.id);

    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tenantId: t.id,
      raffleId: raffle.id,
      email: "compradora@example.cl", // snapshot de Order.email (I5)
    });
  });

  // efectos.003 — aislamiento cross-tenant: la entry cae SIEMPRE en el raffle de la tienda de la orden
  it("aisla cross-tenant: la entry de una orden de la tienda A cae en el raffle de A, nunca en el de B", async () => {
    const a = await crearTenant("a");
    const b = await crearTenant("b");
    const raffleA = await crearRaffle(a.id, "ACTIVO", "Sorteo A");
    const raffleB = await crearRaffle(b.id, "ACTIVO", "Sorteo B");
    const pA = await crearProducto(a.id, "PA");
    const orden = await crearOrden(a.id, "fan@a.cl", [pA.id]);

    await aplicar(orden.id);

    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.raffleId).toBe(raffleA.id);
    // El raffle de B jamás recibe la entry de una orden de A.
    expect(await db.raffleEntry.count({ where: { raffleId: raffleB.id } })).toBe(0);
  });

  // efectos.004 — idempotencia: dos invocaciones ⇒ N grants + 1 entry (sin duplicar)
  it("es idempotente: invocarlo dos veces deja exactamente N grants + 1 entry", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [p1.id, p2.id]);

    await aplicar(orden.id);
    await aplicar(orden.id); // replay

    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(2);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(1);
  });

  // efectos.005 — los efectos viven en la MISMA transacción: si se revierte, no persiste nada
  it("no persiste ningún grant ni entry si la $transaction se revierte", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [p.id]);

    await expect(
      db.$transaction(async (tx) => {
        await aplicarEfectosPostPago({ tx, orderId: orden.id });
        throw new Error("rollback forzado");
      }),
    ).rejects.toThrow(/rollback forzado/);

    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
  });

  // efectos.006 — sin Raffle ACTIVO en la tienda de la orden (aunque OTRA tienda tenga uno):
  //               grants sí, entry no, sin error
  it("sin Raffle ACTIVO en la tienda de la orden (aunque otra tienda tenga uno) crea los grants, NO la entry y no lanza", async () => {
    const a = await crearTenant("a"); // sin raffle activo
    const b = await crearTenant("b");
    await crearRaffle(b.id, "ACTIVO", "Sorteo de OTRA tienda");
    const pA = await crearProducto(a.id, "PA");
    const orden = await crearOrden(a.id, "fan@a.cl", [pA.id]);

    await expect(aplicar(orden.id)).resolves.toBeUndefined(); // no lanza

    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(1);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
  });

  // efectos.007 — un Raffle CERRADO no recibe entry (solo el ACTIVO cuenta)
  it("un Raffle CERRADO en la tienda de la orden no recibe RaffleEntry (solo el ACTIVO cuenta)", async () => {
    const t = await crearTenant("a");
    const cerrado = await crearRaffle(t.id, "CERRADO");
    const p = await crearProducto(t.id, "P1");
    const orden = await crearOrden(t.id, "fan@example.cl", [p.id]);

    await aplicar(orden.id);

    expect(await db.raffleEntry.count({ where: { raffleId: cerrado.id } })).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
    // Los grants sí se crean (la entrega no depende del sorteo).
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(1);
  });

  // efectos.008 — cableado real del webhook: PENDIENTE→PAGADO produce grants+entry;
  //               replay y FALLIDO no producen efectos
  it("con el webhook real cableado: PENDIENTE→PAGADO produce grants+entry; el replay y un FALLIDO no producen efectos", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    await crearRaffle(t.id, "ACTIVO");
    const pagada = await crearOrdenConPago(t.id, "fan@example.cl", [p1.id, p2.id]);

    const enrutarFlow = enrutarFake(t.id, pagada.orderId, 2); // Flow: PAGADA
    const confirmarPago = (input: Parameters<typeof confirmarPagoDeOrden>[0]["input"]) =>
      confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago });

    // 1) Transición PENDIENTE→PAGADO ⇒ grants + entry.
    const r1 = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: pagada.token } },
      enrutarFlow,
      confirmarPago,
    });
    expect(r1.status).toBe(200);
    expect(await db.downloadGrant.count({ where: { orderId: pagada.orderId } })).toBe(2);
    expect(await db.raffleEntry.count({ where: { orderId: pagada.orderId } })).toBe(1);

    // 2) Replay del webhook ⇒ ack sin re-efectos (sigue 2 grants + 1 entry).
    const r2 = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: pagada.token } },
      enrutarFlow,
      confirmarPago,
    });
    expect(r2.body).toMatchObject({ yaProcesado: true });
    expect(await db.downloadGrant.count({ where: { orderId: pagada.orderId } })).toBe(2);
    expect(await db.raffleEntry.count({ where: { orderId: pagada.orderId } })).toBe(1);

    // 3) Otra orden que Flow reporta FALLIDA ⇒ ningún efecto.
    const p3 = await crearProducto(t.id, "P3");
    const fallida = await crearOrdenConPago(t.id, "otra@example.cl", [p3.id]);
    const r3 = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: fallida.token } },
      enrutarFlow: enrutarFake(t.id, fallida.orderId, 3), // Flow: RECHAZADA
      confirmarPago,
    });
    expect(r3.status).toBe(200);
    expect(await db.downloadGrant.count({ where: { orderId: fallida.orderId } })).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: fallida.orderId } })).toBe(0);
  });

  // efectos.009 — el token del grant y el email del comprador no aparecen en logs
  it("no loguea el token del grant ni el email del comprador (el log del skip de raffle es inocuo)", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      }),
    );

    // (a) Happy path con raffle activo: grants + entry, NINGÚN log debe traer email/token.
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const conRaffle = await crearOrden(t.id, "secreta@example.cl", [p.id]);
    await aplicar(conRaffle.id);

    // (b) Skip: sin raffle activo se loguea (inocuo) — no debe contener email ni token.
    const sinRaffleTenant = await crearTenant("b");
    const p2 = await crearProducto(sinRaffleTenant.id, "P2");
    const sinRaffle = await crearOrden(sinRaffleTenant.id, "otra-secreta@example.cl", [p2.id]);
    await aplicar(sinRaffle.id);

    const grants = await db.downloadGrant.findMany({
      where: { tenantId: { in: [t.id, sinRaffleTenant.id] } },
      select: { token: true },
    });
    spies.forEach((s) => s.mockRestore());

    const salida = logs.join("\n");
    expect(salida).not.toContain("secreta@example.cl");
    expect(salida).not.toContain("otra-secreta@example.cl");
    for (const g of grants) {
      expect(salida).not.toContain(g.token);
    }
    // Y el skip sí dejó su rastro inocuo (referencia a la orden, sin secretos).
    expect(salida).toContain(sinRaffle.id);
  });
});

/** Enrutador fake: token → tenant/orden reales + getStatus con el estado Flow dado. */
function enrutarFake(
  tenantId: string,
  orderId: string,
  status: number,
): EnrutarFlowFn {
  const getStatus = vi
    .fn<(token: string) => Promise<FlowGetStatusResponse>>()
    .mockResolvedValue({
      commerceOrder: "flow-dice-otra-cosa",
      status,
      flowOrder: 555,
      paymentData: { fee: "100" },
    });
  const ruteo: FlowRuteado = { tenantId, orderId, getStatus };
  return vi.fn<EnrutarFlowFn>().mockResolvedValue(ruteo) as unknown as EnrutarFlowFn;
}
