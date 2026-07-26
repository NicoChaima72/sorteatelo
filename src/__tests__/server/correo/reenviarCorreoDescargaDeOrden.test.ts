import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { db } from "~/server/db";
import { reenviarCorreoDescargaDeOrden } from "~/server/domain/correo/reenviarCorreoDescargaDeOrden";
import type { CorreoInput, CorreoService } from "~/server/services/correo";

/**
 * Tests DB-backed del reenvío del panel (F04/D9). Se ejercen contra la DB real (patrón F02): la
 * regeneración transaccional de grants expirados, el fail-closed cross-tenant y la validación de
 * estado viven en las queries reales. Cada test crea sus datos con slug `test-reenvio-*` y limpia
 * antes/después.
 */

const PREFIJO = "test-reenvio-";
const DIA_MS = 24 * 60 * 60 * 1000;
const BASE_URL = "https://app.test";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // `CorreoEnviado` desde F03 (FK Restrict a Tenant): va antes que el borrado de tenants.
  await db.correoEnviado.deleteMany({ where: { tenantId: { in: ids } } });
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

async function crearOrdenConGrants(
  tenantId: string,
  email: string,
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO",
  grants: Array<{ productId: string; token: string; expiresAt: Date }>,
) {
  const order = await db.order.create({
    data: {
      tenantId,
      email,
      estado,
      total: "1000",
      items: {
        create: grants.map((g) => ({
          tenantId,
          productId: g.productId,
          precio: "1000",
        })),
      },
      downloadGrants: {
        create: grants.map((g) => ({
          tenantId,
          productId: g.productId,
          token: g.token,
          expiresAt: g.expiresAt,
        })),
      },
    },
    select: { id: true },
  });
  return order.id;
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

function correoFake() {
  const enviados: CorreoInput[] = [];
  const service: Pick<CorreoService, "enviarCorreo"> = {
    enviarCorreo: async (input) => {
      enviados.push(input);
      return { id: `fake-${enviados.length}` };
    },
  };
  return { service, enviados };
}

const pasado = () => new Date(Date.now() - 5 * DIA_MS);
const futuro = () => new Date(Date.now() + 20 * DIA_MS);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("domain/correo/reenviarCorreoDescargaDeOrden (DB-backed, panel)", () => {
  // reenvio.001 — fail-closed cross-tenant: no se puede reenviar la orden de OTRA Tienda
  it("un Organizador NO puede reenviar el correo de una orden de otra Tienda (NOT_FOUND, sin envío)", async () => {
    const a = await crearTenant("a");
    const b = await crearTenant("b");
    const pB = await crearProducto(b.id, "PB");
    const ordenB = await crearOrdenConGrants(b.id, "fan@b.cl", "PAGADO", [
      { productId: pB.id, token: "tok-b", expiresAt: futuro() },
    ]);

    const { service, enviados } = correoFake();
    // acceso SOLO de la Tienda A intentando reenviar una orden de la Tienda B.
    await expect(
      reenviarCorreoDescargaDeOrden({
        db,
        acceso: acceso([a.id]),
        correo: service,
        baseUrl: BASE_URL,
        input: { orderId: ordenB },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(enviados).toHaveLength(0); // jamás se envió nada
  });

  // reenvio.002 — orden no-PAGADA ⇒ INVALID, sin envío ni mutación
  it("reenviar una orden no-PAGADA ⇒ INVALID, sin envío y sin tocar los grants", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const vencido = pasado();
    const orden = await crearOrdenConGrants(t.id, "fan@a.cl", "PENDIENTE", [
      { productId: p.id, token: "tok-pendiente", expiresAt: vencido },
    ]);

    const { service, enviados } = correoFake();
    await expect(
      reenviarCorreoDescargaDeOrden({
        db,
        acceso: acceso([t.id]),
        correo: service,
        baseUrl: BASE_URL,
        input: { orderId: orden },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(enviados).toHaveLength(0);
    // El grant NO se tocó (mismo token, misma expiración vencida).
    const grant = await db.downloadGrant.findFirst({ where: { orderId: orden } });
    expect(grant?.token).toBe("tok-pendiente");
    expect(grant?.expiresAt.getTime()).toBe(vencido.getTime());
  });

  // reenvio.003 — regenera SOLO los grants expirados (token nuevo + expiresAt futuro); vigentes intactos
  it("regenera los grants expirados (token distinto + expiresAt futuro) en transacción y el correo lleva los enlaces NUEVOS; los vigentes conservan su token", async () => {
    const t = await crearTenant("a");
    const pExpirado = await crearProducto(t.id, "Expirado");
    const pVigente = await crearProducto(t.id, "Vigente");
    const expVieja = futuro(); // el vigente conserva ESTA expiración
    const orden = await crearOrdenConGrants(t.id, "fan@a.cl", "PAGADO", [
      { productId: pExpirado.id, token: "tok-viejo-expirado", expiresAt: pasado() },
      { productId: pVigente.id, token: "tok-vigente", expiresAt: expVieja },
    ]);

    const { service, enviados } = correoFake();
    const res = await reenviarCorreoDescargaDeOrden({
      db,
      acceso: acceso([t.id]),
      correo: service,
      baseUrl: BASE_URL,
      input: { orderId: orden },
      generarToken: () => "tok-NUEVO-regenerado",
    });

    expect(res.grantsRegenerados).toBe(1);

    const grants = await db.downloadGrant.findMany({
      where: { orderId: orden },
      select: { productId: true, token: true, expiresAt: true },
    });
    const gExpirado = grants.find((g) => g.productId === pExpirado.id)!;
    const gVigente = grants.find((g) => g.productId === pVigente.id)!;

    // El expirado: token NUEVO + expiresAt futuro (~30 días).
    expect(gExpirado.token).toBe("tok-NUEVO-regenerado");
    expect(gExpirado.token).not.toBe("tok-viejo-expirado");
    expect(gExpirado.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DIA_MS);
    // El vigente: intacto (mismo token, misma expiración).
    expect(gVigente.token).toBe("tok-vigente");
    expect(gVigente.expiresAt.getTime()).toBe(expVieja.getTime());

    // El correo lleva el enlace NUEVO del regenerado y el enlace vigente sin cambios.
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.text).toContain(`${BASE_URL}/entrega/tok-NUEVO-regenerado`);
    expect(enviados[0]!.text).toContain(`${BASE_URL}/entrega/tok-vigente`);
    // El token viejo expirado ya NO aparece (fue reemplazado).
    expect(enviados[0]!.text).not.toContain("tok-viejo-expirado");
  });

  // reenvio.004 — el reenvío respeta los mismos invariantes de contenido que F02
  it("el reenvío envía UN correo con todos los enlaces, el nombre de la Tienda y el disclaimer (mismos invariantes que F02)", async () => {
    const t = await crearTenant("mitienda");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    const orden = await crearOrdenConGrants(t.id, "fan@a.cl", "PAGADO", [
      { productId: p1.id, token: "tok-1", expiresAt: futuro() },
      { productId: p2.id, token: "tok-2", expiresAt: futuro() },
    ]);

    const { service, enviados } = correoFake();
    await reenviarCorreoDescargaDeOrden({
      db,
      acceso: acceso([t.id]),
      correo: service,
      baseUrl: BASE_URL,
      input: { orderId: orden },
    });

    expect(enviados).toHaveLength(1);
    const enviado = enviados[0]!;
    expect(enviado.to).toBe("fan@a.cl");
    expect(enviado.from).toContain("mitienda");
    expect(enviado.text).toContain(`${BASE_URL}/entrega/tok-1`);
    expect(enviado.text).toContain(`${BASE_URL}/entrega/tok-2`);
    expect(enviado.text.toLowerCase()).toContain("responsable de la venta"); // disclaimer ADR-0008
    expect(enviado.text).not.toContain(".pdf"); // nunca la key del bucket
  });

  // reenvio.005 — F03: el reenvío manda la plantilla NUEVA (C1), no la vieja de solo enlaces. Sale
  // gratis porque delega en el mismo use case, y por eso mismo hay que fijarlo: si alguien le
  // pusiera al reenvío su propia derivación de contenido, el Organizador reenviaría un correo
  // distinto del que el Comprador recibió al comprar, y nadie lo notaría hasta que alguien reclame.
  it("reenvía la CONFIRMACIÓN completa: números del sorteo con prefijo, sorteo nombrado y resumen de la orden", async () => {
    const t = await db.tenant.create({
      data: {
        slug: `${PREFIJO}conmarca`,
        nombre: "conmarca",
        estado: "PUBLICADA",
        prefijoTicket: "ARMY",
      },
      select: { id: true },
    });
    const p = await crearProducto(t.id, "P1");
    const raffle = await db.raffle.create({
      data: {
        tenantId: t.id,
        nombre: "Sorteo Photocard Firmada",
        premio: "Photocard",
        estado: "ACTIVO",
        fechaInicio: new Date("2026-01-01T00:00:00Z"),
        fechaFin: new Date("2026-03-02T02:59:00Z"),
      },
      select: { id: true },
    });
    const orden = await crearOrdenConGrants(t.id, "fan@a.cl", "PAGADO", [
      { productId: p.id, token: "tok-1", expiresAt: futuro() },
    ]);
    await db.raffleEntry.createMany({
      data: [7, 8].map((numero, ordinal) => ({
        tenantId: t.id,
        raffleId: raffle.id,
        orderId: orden,
        email: "fan@a.cl",
        ordinal,
        numero,
      })),
    });

    const { service, enviados } = correoFake();
    await reenviarCorreoDescargaDeOrden({
      db,
      acceso: acceso([t.id]),
      correo: service,
      baseUrl: BASE_URL,
      input: { orderId: orden },
    });

    const enviado = enviados[0]!;
    expect(enviado.text).toContain("ARMY-7–8");
    expect(enviado.text).toContain("Sorteo Photocard Firmada");
    expect(enviado.text).toContain("hora de Chile");
    expect(enviado.text).toContain(orden); // Nº de orden en el resumen
  });

  // reenvio.006 — el reenvío NO pasa por el ledger, a propósito. Es un «mandalo de nuevo» explícito
  // del Organizador: si respetara el claim, una orden cuya fila ya está ENVIADO no reenviaría nada
  // y el botón del panel mentiría. La fila queda como estaba, sin intentos gastados.
  it("no toca el ledger: reenvía aunque la confirmación ya se haya enviado", async () => {
    const t = await crearTenant("mitienda");
    const p = await crearProducto(t.id, "P1");
    const orden = await crearOrdenConGrants(t.id, "fan@a.cl", "PAGADO", [
      { productId: p.id, token: "tok-1", expiresAt: futuro() },
    ]);
    const fila = await db.correoEnviado.create({
      data: {
        tenantId: t.id,
        tipo: "CONFIRMACION_COMPRA",
        clave: orden,
        email: "fan@a.cl",
        estado: "ENVIADO",
        proveedorId: "resend-original",
        intentos: 1,
        enviadoAt: new Date(),
      },
      select: { id: true },
    });

    const { service, enviados } = correoFake();
    await reenviarCorreoDescargaDeOrden({
      db,
      acceso: acceso([t.id]),
      correo: service,
      baseUrl: BASE_URL,
      input: { orderId: orden },
    });

    expect(enviados).toHaveLength(1); // el reenvío SÍ salió
    const despues = await db.correoEnviado.findUnique({ where: { id: fila.id } });
    expect(despues?.estado).toBe("ENVIADO");
    expect(despues?.intentos).toBe(1); // intacta: el reenvío no consume presupuesto del ledger
    expect(despues?.proveedorId).toBe("resend-original");

    // reenvio.007 — la MISMA propiedad un piso más abajo, y la que se nos había escapado: saltarse
    // el ledger no alcanza si el correo igual sale con la `Idempotency-Key` del envío automático.
    // Resend la honra 24 h, así que devolvería la respuesta cacheada de `resend-original` y el
    // Comprador no recibiría nada, con el panel diciendo que sí. El reenvío va SIN clave: es un
    // «mandalo de nuevo» deliberado, no un reintento.
    expect(enviados[0]!.idempotencyKey).toBeUndefined();
  });
});
