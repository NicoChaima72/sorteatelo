import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { enviarConfirmacionDeCompra } from "~/server/domain/correo/enviarConfirmacionDeCompra";
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
    // `CorreoEnviado` entra desde F03 (la $tx post-pago encola la confirmación): FK Restrict.
    await db.correoEnviado.deleteMany({ where: { tenantId: { in: ids } } });
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
async function crearTenant(
  nombre: string,
  branding: {
    logoUrl?: string;
    colorPrimario?: string;
    prefijoTicket?: string;
  } = {},
) {
  return db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA", ...branding },
    select: { id: true },
  });
}

/** Sorteo ACTIVO con nombre y cierre conocidos (para el contenido de C1). */
async function crearRaffle(tenantId: string, nombre: string, fechaFin: Date) {
  return db.raffle.create({
    data: {
      tenantId,
      nombre,
      premio: "Photocard firmada",
      estado: "ACTIVO",
      fechaInicio: new Date("2026-01-01T00:00:00Z"),
      fechaFin,
    },
    select: { id: true },
  });
}

/** Tickets ya emitidos para una orden, con sus Números del sorteo explícitos (ADR-0024). */
async function crearTickets(
  tenantId: string,
  raffleId: string,
  orderId: string,
  email: string,
  numeros: number[],
) {
  await db.raffleEntry.createMany({
    data: numeros.map((numero, ordinal) => ({
      tenantId,
      raffleId,
      orderId,
      email,
      ordinal,
      numero,
    })),
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
  const service: Pick<CorreoService, "enviarCorreo"> = {
    enviarCorreo: async (input) => {
      enviados.push(input);
      return { id: `fake-${enviados.length}` };
    },
  };
  return { service, enviados };
}

/** Service de correo que SIEMPRE falla (simula caída de Resend). */
function correoQueFalla(): Pick<CorreoService, "enviarCorreo"> {
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
  const ruteo: FlowRuteado = { tenantId, orderId, montoEsperado: 1000, getStatus };
  return vi
    .fn<EnrutarFlowFn>()
    .mockResolvedValue(ruteo) as unknown as EnrutarFlowFn;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("domain/correo/enviarCorreoDescargaDeOrden (DB-backed)", () => {
  // correo.usecase.001 — TODO el contenido sale de la orden server-side; un correo, un enlace por grant
  it("envía UN correo cuyos datos (destino, tienda, títulos, tokens) salen de la orden, con un enlace /entrega/<token> por grant", async () => {
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
    // Un enlace por grant, con el baseUrl + token, a la PÁGINA DE ENTREGA (F09/D5) y NO al endpoint
    // que baja un archivo suelto: lo comprado puede ser un sobre de N archivos sorteados.
    expect(enviado.text).toContain(`${BASE_URL}/entrega/TOKEN-uno`);
    expect(enviado.text).toContain(`${BASE_URL}/entrega/TOKEN-dos`);
    // Y ya NO se manda el enlace crudo de descarga: el correo es la puerta a la página.
    expect(enviado.text).not.toContain("/api/descargas/");
    // Nunca el pdfPath/key del bucket.
    expect(enviado.text + (enviado.html ?? "")).not.toContain(".pdf");
  });

  // correo.usecase.006 — F03/C1: el correo post-pago ya no es "los enlaces", es la CONFIRMACIÓN de
  // la compra. Lo que se prueba acá es la DERIVACIÓN server-side del contenido nuevo, que es lo que
  // el test de la plantilla (puro) no puede cubrir: que los Números salgan de las `RaffleEntry` de
  // ESA orden, el sorteo de la relación, y el prefijo/logo/color del `Tenant` — nada de parámetros.
  it("arma la confirmación con los Números de ESA orden, el sorteo nombrado y el branding del Tenant, todo server-side", async () => {
    const t = await crearTenant("a", {
      logoUrl: "https://pub.r2.dev/ten/branding/logo?v=1",
      colorPrimario: "#e11d48",
      prefijoTicket: "ARMY",
    });
    const p = await crearProducto(t.id, "GuiaBias");
    const raffle = await crearRaffle(
      t.id,
      "Sorteo Photocard Firmada",
      new Date("2026-03-02T02:59:00Z"), // 1 de marzo 2026, 23:59 en Chile
    );
    const orderId = await crearOrdenPagadaConGrants(t.id, "compradora@fan.cl", [
      { id: p.id, token: "TOKEN-uno" },
    ]);
    await crearTickets(t.id, raffle.id, orderId, "compradora@fan.cl", [
      1043, 1044, 1045,
    ]);

    const { service, enviados } = correoFake();
    await enviarCorreoDescargaDeOrden({
      db,
      correo: service,
      orderId,
      baseUrl: BASE_URL,
    });

    const enviado = enviados[0]!;
    // Números con el prefijo del Tenant, plegados por bloque (D12/I12).
    expect(enviado.text).toContain("ARMY-1043–1045");
    // El sorteo NOMBRADO (I10) y su cierre en hora de Chile (I7).
    expect(enviado.text).toContain("Sorteo Photocard Firmada");
    expect(enviado.text).toContain("1 de marzo de 2026");
    expect(enviado.text).toContain("hora de Chile");
    // Branding del Tenant en el layout (D9-rev/I11).
    expect(enviado.html).toContain("background-color:#e11d48");
    expect(enviado.html).toContain('src="https://pub.r2.dev/ten/branding/logo?v=1"');
    // **SIN `Idempotency-Key`**, y es lo contrario de lo que este test pedía antes. Este use case
    // es el del REENVÍO manual del panel (el post-pago usa `enviarConfirmacionDeCompra`). La clave
    // automática `confirmacion-compra/<orderId>` es estable para siempre, así que un reenvío que la
    // llevara caería dentro de la ventana de 24 h del envío original: Resend devuelve la respuesta
    // CACHEADA, el panel dice «reenviado» y al Comprador no le llega nada — justo cuando el
    // Organizador aprieta el botón porque el primero no llegó. Es la misma razón por la que el
    // reenvío tampoco pasa por el claim del ledger (`reenvio.006`), un piso más abajo.
    expect(enviado.idempotencyKey).toBeUndefined();
  });

  // correo.usecase.007 — cada orden habla de SUS números. Con dos compras en el mismo sorteo, el
  // filtro por `orderId` es lo único que separa un correo del otro: sin él, el segundo correo le
  // contaría a su Compradora los números de la primera (y el rango plegado lo haría invisible).
  it("no filtra los Números de otra orden del mismo sorteo", async () => {
    const t = await crearTenant("a", { prefijoTicket: "ARMY" });
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "Sorteo Único", new Date("2026-03-02T02:59:00Z"));
    const primera = await crearOrdenPagadaConGrants(t.id, "una@fan.cl", [
      { id: p.id, token: "tok-1" },
    ]);
    await crearTickets(t.id, raffle.id, primera, "una@fan.cl", [1, 2]);
    const segunda = await crearOrdenPagadaConGrants(t.id, "otra@fan.cl", [
      { id: p.id, token: "tok-2" },
    ]);
    await crearTickets(t.id, raffle.id, segunda, "otra@fan.cl", [3]);

    const { service, enviados } = correoFake();
    await enviarCorreoDescargaDeOrden({ db, correo: service, orderId: segunda, baseUrl: BASE_URL });

    const enviado = enviados[0]!;
    expect(enviado.to).toBe("otra@fan.cl");
    expect(enviado.text).toContain("ARMY-3");
    expect(enviado.text).not.toContain("ARMY-1");
    expect(enviado.text).not.toContain("ARMY-2");
  });

  // correo.usecase.008 — degradación (§5.2): una orden sin tickets recibe su confirmación igual,
  // sin sección de sorteo. Es el caso de una compra de un producto que no participa.
  it("una orden sin tickets recibe su confirmación sin sección de sorteo", async () => {
    const t = await crearTenant("a", { prefijoTicket: "ARMY" });
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "Sorteo Que No Le Toca", new Date("2026-03-02T02:59:00Z"));
    const orderId = await crearOrdenPagadaConGrants(t.id, "fan@fan.cl", [
      { id: p.id, token: "tok" },
    ]);

    const { service, enviados } = correoFake();
    await enviarCorreoDescargaDeOrden({ db, correo: service, orderId, baseUrl: BASE_URL });

    const enviado = enviados[0]!;
    expect(enviado.text).not.toContain("Sorteo Que No Le Toca");
    expect(enviado.text).not.toContain("ARMY-");
    // Pero el correo sale entero: enlace de entrega y resumen de la compra.
    expect(enviado.text).toContain(`${BASE_URL}/entrega/tok`);
    expect(enviado.text).toContain(orderId);
  });

  // correo.usecase.009 — *(cobertura extra, no prevista en el plan; hueco que marcó el
  // `backend-reviewer` en la pasada de verificación)*. Una orden puede tener tickets en DOS sorteos
  // y no es hipotético: el arrastre D13 de `crearSorteo` COPIA los participantes de un sorteo al
  // siguiente, dejando vivas las entries viejas. Se alcanza al REENVIAR desde el panel una compra
  // ya arrastrada. La regla es «el ACTIVO manda» (`sorteoDelCorreo`), y lo que hay que fijar es que
  // los números que viajan son SOLO los de ese sorteo: mezclarlos daría un rango plegado que no
  // existe en ninguna parte —ni en el panel, ni en el sorteo— y el Comprador reclamaría por números
  // que nadie le puede reconocer.
  it("con tickets en dos sorteos habla del ACTIVO y no mezcla los números del cerrado", async () => {
    const t = await crearTenant("a", { prefijoTicket: "ARMY" });
    const p = await crearProducto(t.id, "P1");
    const viejo = await crearRaffle(t.id, "Sorteo Viejo", new Date("2026-02-01T02:59:00Z"));
    await db.raffle.update({
      where: { id: viejo.id },
      data: { estado: "CERRADO" },
    });
    const activo = await crearRaffle(t.id, "Sorteo Nuevo", new Date("2026-03-02T02:59:00Z"));
    const orderId = await crearOrdenPagadaConGrants(t.id, "fan@fan.cl", [
      { id: p.id, token: "tok" },
    ]);
    // Los MISMOS tickets, renumerados por el arrastre: 55–56 en el viejo, 1–2 en el nuevo.
    await crearTickets(t.id, viejo.id, orderId, "fan@fan.cl", [55, 56]);
    await crearTickets(t.id, activo.id, orderId, "fan@fan.cl", [1, 2]);

    const { service, enviados } = correoFake();
    await enviarCorreoDescargaDeOrden({ db, correo: service, orderId, baseUrl: BASE_URL });

    const enviado = enviados[0]!;
    expect(enviado.text).toContain("Sorteo Nuevo");
    expect(enviado.text).not.toContain("Sorteo Viejo");
    expect(enviado.text).toContain("ARMY-1–2");
    // Lo que de verdad protege este test: ni los números del cerrado, ni un rango inventado que los
    // pliegue junto con los del activo.
    expect(enviado.text).not.toContain("ARMY-55");
    expect(enviado.text).not.toContain("ARMY-56");
    expect(enviado.text).not.toContain("ARMY-1–56");
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
    // Recolector del seam `ProgramarTarea` (F03/I3). Desde que el decorator dejó de AWAITEAR el
    // correo —el ack a Flow ya no puede colgar de Resend— el envío ocurre después de que el webhook
    // respondió, así que un test que asserte `enviados` sin esperar la tarea es una CARRERA: pasaba
    // solo mientras las 2 queries del armado terminaran antes que las 2 lecturas de verificación de
    // acá. En producción esto lo sostiene `waitUntil`; en el test, este recolector (mismo patrón que
    // `correo.confirmacion.005`).
    const tareas: Promise<unknown>[] = [];
    const confirmarPago = conCorreoPostPago(
      (input) => confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
      (oid) => enviarCorreoDescargaDeOrden({ db, correo: service, orderId: oid, baseUrl: BASE_URL }),
      (tarea) => {
        tareas.push(tarea);
      },
    );

    const r = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token } },
      enrutarFlow: enrutarFake(t.id, orderId, 2), // Flow: PAGADA
      confirmarPago,
    });

    expect(r.status).toBe(200);
    // El ack salió con el correo TODAVÍA sin mandar: eso es I3, y de paso deja el resto del test
    // determinista.
    expect(enviados).toHaveLength(0);
    await Promise.all(tareas);
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
      expect(enviados[0]!.text).toContain(`${BASE_URL}/entrega/${g.token}`);
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

    // Mismo recolector que `correo.usecase.004`: el log del fallo lo emite la TAREA, que corre
    // después del ack. Sin esperarla, `spy.mockRestore()` llegaba antes que el `console.error` y el
    // test verificaba una lista de errores vacía — pasaba por carrera, no por comportamiento.
    //
    // Y el callback es `enviarConfirmacionDeCompra`, que es lo que el webhook cablea DE VERDAD
    // desde F03 (`pages/api/webhooks/flow.ts`). Antes acá iba `enviarCorreoDescargaDeOrden`, que
    // hoy es el camino del REENVÍO del panel: ese lanza el error (el panel tiene que enterarse),
    // mientras que el automático lo atrapa, lo deja en la fila del ledger y loguea. Probar la
    // promesa de I1 contra un cableado que ya no existe en producción no prueba nada.
    const tareas: Promise<unknown>[] = [];
    const confirmarPago = conCorreoPostPago(
      (input) => confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
      (oid) => enviarConfirmacionDeCompra({ db, correo: correoQueFalla(), orderId: oid, baseUrl: BASE_URL }),
      (tarea) => {
        tareas.push(tarea);
      },
    );

    const r = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token } },
      enrutarFlow: enrutarFake(t.id, orderId, 2),
      confirmarPago,
    });
    // El envío falla y la tarea NO debe propagar el error (el webhook ya respondió).
    await Promise.all(tareas);
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
