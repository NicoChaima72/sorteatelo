import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { enviarCorreoDescargaDeOrden } from "~/server/domain/correo/enviarCorreoDescargaDeOrden";
import { aplicarEfectosPostPago } from "~/server/domain/pago/aplicarEfectosPostPago";
import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
import { conCorreoPostPago } from "~/server/pago/conCorreoPostPago";
import type {
  EnrutarFlowFn,
  FlowRuteado,
} from "~/server/pago/enrutarPagoFlow";
import type { CorreoInput, CorreoService } from "~/server/services/correo";
import type { FlowGetStatusResponse } from "~/server/services/flow";
import { manejarWebhookFlow } from "~/server/pago/webhookFlow";

/**
 * Tests DB-backed de `enviarCorreoDescargaDeOrden` (F04/F02) + del circuito real webhook→correo.
 * Se ejercen contra la DB real (patrón F02): la derivación server-side de TODO el contenido, el
 * reply-to por membresía más antigua y la garantía "la venta es lo primario si el correo falla"
 * viven en las queries/composición reales, no en el use case aislado. Cada test crea sus datos con
 * slug `test-correo-*` y limpia antes/después.
 */

const PREFIJO = "test-correo-";
const DIA_MS = 24 * 60 * 60 * 1000;
const BASE_URL = "https://app.test";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length > 0) {
    // Orden FK-safe: memberships (Restrict a Tenant) e hijos antes que sus padres.
    await db.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
    await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
    await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
    await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
    await db.payment.deleteMany({ where: { tenantId: { in: ids } } });
    await db.order.deleteMany({ where: { tenantId: { in: ids } } });
    await db.product.deleteMany({ where: { tenantId: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  // Los Users de prueba se identifican por su email (frontera NextAuth, sin tenantId).
  await db.user.deleteMany({ where: { email: { contains: PREFIJO } } });
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

async function crearUsuarioConMembresia(
  tenantId: string,
  email: string,
  createdAt: Date,
) {
  const user = await db.user.create({ data: { email }, select: { id: true } });
  await db.tenantMembership.create({
    data: { tenantId, userId: user.id, createdAt },
  });
  return user;
}

/** Orden PAGADA con un DownloadGrant (token conocido) por producto. */
async function crearOrdenPagadaConGrants(
  tenantId: string,
  email: string,
  productos: Array<{ id: string; token: string }>,
) {
  const expiresAt = new Date(Date.now() + 30 * DIA_MS);
  const order = await db.order.create({
    data: {
      tenantId,
      email,
      estado: "PAGADO",
      total: "1000",
      items: {
        create: productos.map((p) => ({
          tenantId,
          productId: p.id,
          precio: "1000",
        })),
      },
      downloadGrants: {
        create: productos.map((p) => ({
          tenantId,
          productId: p.id,
          token: p.token,
          expiresAt,
        })),
      },
    },
    select: { id: true },
  });
  return order.id;
}

/** Orden PENDIENTE + Payment PENDIENTE con token (para el circuito real del webhook). */
async function crearOrdenPendienteConPago(
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
      payment: { create: { tenantId, estado: "PENDIENTE", monto: "1000", token } },
    },
    select: { id: true },
  });
  return { orderId: order.id, token };
}

/** Service de correo FAKE que captura cada envío y devuelve un id. */
function correoFake() {
  const enviados: CorreoInput[] = [];
  const service: CorreoService = {
    enviarCorreo: async (input) => {
      enviados.push(input);
      return { id: `fake-${enviados.length}` };
    },
  };
  return { service, enviados };
}

/** Service de correo que SIEMPRE falla (simula caída de Resend). */
function correoQueFalla(): CorreoService {
  return {
    enviarCorreo: async () => {
      throw new Error("Resend respondió 500.");
    },
  };
}

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
  return vi
    .fn<EnrutarFlowFn>()
    .mockResolvedValue(ruteo) as unknown as EnrutarFlowFn;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("domain/correo/enviarCorreoDescargaDeOrden (DB-backed)", () => {
  // correo.usecase.001 — TODO el contenido sale de la orden server-side; un correo, un enlace por grant
  it("envía UN correo cuyos datos (destino, tienda, títulos, tokens) salen de la orden, con un enlace /api/descargas/<token> por grant", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "GuiaBias");
    const p2 = await crearProducto(t.id, "Photobook");
    await crearUsuarioConMembresia(t.id, `org@${PREFIJO}x.cl`, new Date("2026-01-01"));
    const orderId = await crearOrdenPagadaConGrants(t.id, "compradora@fan.cl", [
      { id: p1.id, token: "TOKEN-uno" },
      { id: p2.id, token: "TOKEN-dos" },
    ]);

    const { service, enviados } = correoFake();
    const res = await enviarCorreoDescargaDeOrden({
      db,
      correo: service,
      orderId,
      baseUrl: BASE_URL,
    });

    expect(res.items).toBe(2);
    expect(enviados).toHaveLength(1);
    const enviado = enviados[0]!;
    expect(enviado.to).toBe("compradora@fan.cl"); // destino = Order.email (server-side)
    expect(enviado.from).toContain("a"); // nombre de la Tienda en el from
    // Un enlace por grant, con el baseUrl + token.
    expect(enviado.text).toContain(`${BASE_URL}/api/descargas/TOKEN-uno`);
    expect(enviado.text).toContain(`${BASE_URL}/api/descargas/TOKEN-dos`);
    // Nunca el pdfPath/key del bucket.
    expect(enviado.text + (enviado.html ?? "")).not.toContain(".pdf");
  });

  // correo.usecase.002 — reply-to = email de la membresía MÁS ANTIGUA del tenant
  it("deriva reply-to del email del Organizador de la membresía más antigua del tenant", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    // Dos organizadores: el reply-to debe ser el de la membresía MÁS antigua.
    await crearUsuarioConMembresia(t.id, `viejo@${PREFIJO}x.cl`, new Date("2026-01-01"));
    await crearUsuarioConMembresia(t.id, `nuevo@${PREFIJO}x.cl`, new Date("2026-06-01"));
    const orderId = await crearOrdenPagadaConGrants(t.id, "fan@fan.cl", [
      { id: p.id, token: "tok" },
    ]);

    const { service, enviados } = correoFake();
    await enviarCorreoDescargaDeOrden({ db, correo: service, orderId, baseUrl: BASE_URL });

    expect(enviados[0]!.replyTo).toBe(`viejo@${PREFIJO}x.cl`);
  });

  // correo.usecase.003 — sin membresía ⇒ correo sin reply-to (válido)
  it("sin membresía en el tenant, el correo sale sin reply-to", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const orderId = await crearOrdenPagadaConGrants(t.id, "fan@fan.cl", [
      { id: p.id, token: "tok" },
    ]);

    const { service, enviados } = correoFake();
    await enviarCorreoDescargaDeOrden({ db, correo: service, orderId, baseUrl: BASE_URL });

    expect(enviados[0]!.replyTo).toBeUndefined();
  });

  // correo.usecase.004 — circuito real: PENDIENTE→PAGADO por el webhook ⇒ envía una vez
  it("con el webhook real + decorator: la transición PENDIENTE→PAGADO envía UN correo con los tokens de los grants recién creados", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    await crearUsuarioConMembresia(t.id, `org@${PREFIJO}x.cl`, new Date("2026-01-01"));
    const { orderId, token } = await crearOrdenPendienteConPago(t.id, "fan@fan.cl", [
      p1.id,
      p2.id,
    ]);

    const { service, enviados } = correoFake();
    const confirmarPago = conCorreoPostPago(
      (input) => confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
      (oid) => enviarCorreoDescargaDeOrden({ db, correo: service, orderId: oid, baseUrl: BASE_URL }),
    );

    const r = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token } },
      enrutarFlow: enrutarFake(t.id, orderId, 2), // Flow: PAGADA
      confirmarPago,
    });

    expect(r.status).toBe(200);
    // Orden PAGADA con 2 grants creados por los efectos post-pago.
    const orden = await db.order.findUnique({ where: { id: orderId }, select: { estado: true } });
    expect(orden?.estado).toBe("PAGADO");
    const grants = await db.downloadGrant.findMany({
      where: { orderId },
      select: { token: true },
    });
    expect(grants).toHaveLength(2);
    // UN correo, con los tokens REALES de los grants recién creados.
    expect(enviados).toHaveLength(1);
    for (const g of grants) {
      expect(enviados[0]!.text).toContain(`${BASE_URL}/api/descargas/${g.token}`);
    }
  });

  // correo.usecase.005 — el correo falla ⇒ la venta NO se compromete: 200, PAGADO, grants intactos
  it("si el envío falla, el webhook responde 200 y la orden queda PAGADA con sus grants (la venta es lo primario); se loguea sin token ni email", async () => {
    const errores: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errores.push(args.map(String).join(" "));
      });

    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const { orderId, token } = await crearOrdenPendienteConPago(
      t.id,
      "secreta@fan.cl",
      [p.id],
    );

    const confirmarPago = conCorreoPostPago(
      (input) => confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
      (oid) => enviarCorreoDescargaDeOrden({ db, correo: correoQueFalla(), orderId: oid, baseUrl: BASE_URL }),
    );

    const r = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token } },
      enrutarFlow: enrutarFake(t.id, orderId, 2),
      confirmarPago,
    });
    spy.mockRestore();

    // La venta es lo primario: 200, orden PAGADA, grant intacto (I1).
    expect(r.status).toBe(200);
    const orden = await db.order.findUnique({ where: { id: orderId }, select: { estado: true } });
    expect(orden?.estado).toBe("PAGADO");
    const grants = await db.downloadGrant.findMany({
      where: { orderId },
      select: { token: true },
    });
    expect(grants).toHaveLength(1);

    // El fallo se logueó con el orderId, SIN el email del comprador ni el token del grant (I3).
    const salida = errores.join("\n");
    expect(salida).toContain(orderId);
    expect(salida).not.toContain("secreta@fan.cl");
    expect(salida).not.toContain(grants[0]!.token);
  });
});
