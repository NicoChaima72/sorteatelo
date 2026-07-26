import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { enviarConfirmacionDeCompra } from "~/server/domain/correo/enviarConfirmacionDeCompra";
import { aplicarEfectosPostPago } from "~/server/domain/pago/aplicarEfectosPostPago";
import { conCorreoPostPago } from "~/server/pago/conCorreoPostPago";
import { CorreoError, type CorreoInput, type CorreoService } from "~/server/services/correo";

/**
 * Tests DB-backed del envío POST-COMMIT de la confirmación de compra (F03/C1).
 *
 * Este es el camino que dispara el webhook con `waitUntil`, y su propiedad central no es «manda un
 * correo» sino **«manda EXACTAMENTE uno»** (I2): pasa por el mismo protocolo claim→send→confirm
 * del ledger que usa el cron, así que si el cron y el post-pago corren a la vez, uno de los dos
 * suelta la fila. Se ejerce contra la DB real porque esa carrera vive en el `@@unique` y en el CAS
 * de Postgres, no en el use case.
 *
 * Cada test crea sus datos con slug `test-confirmacion-*` y limpia antes/después.
 */

const PREFIJO = "test-confirmacion-";
const BASE_URL = "https://app.test";
const TIPO = "CONFIRMACION_COMPRA" as const;

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  await db.correoEnviado.deleteMany({ where: { tenantId: { in: ids } } });
  await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

/**
 * Orden PAGADA con su sorteo y sus efectos post-pago YA aplicados — o sea, con la fila
 * `CONFIRMACION_COMPRA` PENDIENTE escrita por el productor REAL y no a mano. Que el fixture use el
 * productor de verdad es lo que hace que estos tests prueben el circuito y no una simulación suya.
 */
async function ordenConfirmada(nombre: string) {
  const tenant = await db.tenant.create({
    data: {
      slug: `${PREFIJO}${nombre}`,
      nombre: `Tienda ${nombre}`,
      estado: "PUBLICADA",
      prefijoTicket: "ARMY",
    },
    select: { id: true },
  });
  const producto = await db.product.create({
    data: {
      tenantId: tenant.id,
      titulo: "Guía del bias",
      descripcion: "desc",
      precio: "1000",
      pdfPath: `${tenant.id}/p.pdf`,
    },
    select: { id: true },
  });
  await db.raffle.create({
    data: {
      tenantId: tenant.id,
      nombre: "Sorteo Photocard Firmada",
      premio: "Photocard",
      estado: "ACTIVO",
      fechaInicio: new Date("2026-01-01T00:00:00Z"),
      fechaFin: new Date("2026-03-02T02:59:00Z"),
    },
  });
  const order = await db.order.create({
    data: {
      tenantId: tenant.id,
      email: "compradora@fan.cl",
      estado: "PAGADO",
      total: "3000",
      items: {
        create: [
          {
            tenantId: tenant.id,
            productId: producto.id,
            precio: "1000",
            cantidad: 3,
            participaEnSorteo: true,
          },
        ],
      },
    },
    select: { id: true },
  });
  await db.$transaction((tx) =>
    aplicarEfectosPostPago({ tx, orderId: order.id }),
  );
  return { tenantId: tenant.id, orderId: order.id };
}

function correoFake() {
  const enviados: CorreoInput[] = [];
  const service: Pick<CorreoService, "enviarCorreo"> = {
    enviarCorreo: async (input) => {
      enviados.push(input);
      return { id: `resend-${enviados.length}` };
    },
  };
  return { service, enviados };
}

function correoQueFalla(error: Error): Pick<CorreoService, "enviarCorreo"> {
  return {
    enviarCorreo: async () => {
      throw error;
    },
  };
}

function filaDe(orderId: string) {
  return db.correoEnviado.findUnique({
    where: { tipo_clave: { tipo: TIPO, clave: orderId } },
  });
}

describe("domain/correo/enviarConfirmacionDeCompra (DB-backed, ledger)", () => {
  // correo.confirmacion.001 — el camino feliz completo: reclama la fila que dejó la $tx, manda el
  // correo con su contenido real y la deja ENVIADO con el id del proveedor. Sin ese CONFIRM, la
  // corrida del cron siguiente la volvería a mandar.
  it("reclama la fila PENDIENTE, envía el correo y la deja ENVIADO con el proveedorId", async () => {
    const { orderId } = await ordenConfirmada("a");
    const { service, enviados } = correoFake();

    const res = await enviarConfirmacionDeCompra({
      db,
      correo: service,
      orderId,
      baseUrl: BASE_URL,
    });

    expect(res.enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.to).toBe("compradora@fan.cl");
    expect(enviados[0]!.text).toContain("ARMY-1–3"); // los 3 tickets de la compra
    expect(enviados[0]!.idempotencyKey).toBe(`confirmacion-compra/${orderId}`);

    const fila = await filaDe(orderId);
    expect(fila?.estado).toBe("ENVIADO");
    expect(fila?.proveedorId).toBe("resend-1");
    expect(fila?.intentos).toBe(1);
    expect(fila?.enviadoAt).not.toBeNull();
  });

  // correo.confirmacion.002 — I2, el invariante que justifica todo el ledger: dos disparos del
  // mismo envío (un replay de Flow, o el cron pisándose con el `waitUntil`) mandan UN correo. El
  // dominio de envío es reputación de TODAS las Tiendas: un duplicado no se puede deshacer.
  it("dos disparos seguidos mandan UN solo correo (la fila ya ENVIADO no se vuelve a reclamar)", async () => {
    const { orderId } = await ordenConfirmada("a");
    const { service, enviados } = correoFake();

    const primero = await enviarConfirmacionDeCompra({ db, correo: service, orderId, baseUrl: BASE_URL });
    const segundo = await enviarConfirmacionDeCompra({ db, correo: service, orderId, baseUrl: BASE_URL });

    expect(primero.enviado).toBe(true);
    expect(segundo.enviado).toBe(false);
    expect(enviados).toHaveLength(1);
    const fila = await filaDe(orderId);
    expect(fila?.intentos).toBe(1); // el segundo ni siquiera reclamó
    expect(fila?.proveedorId).toBe("resend-1");
  });

  // correo.confirmacion.003 — falla segura (ADR-0027 §3): un fallo REAL del proveedor consume el
  // intento, deja el error visible y la fila PENDIENTE para el cron. Y NO lanza: el caller es un
  // webhook de venta ya confirmada (I1 de F04).
  it("si el proveedor falla, no lanza: consume el intento, guarda el error y deja la fila PENDIENTE", async () => {
    const errores: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errores.push(a.map(String).join(" "));
    });
    const { orderId } = await ordenConfirmada("a");

    const res = await enviarConfirmacionDeCompra({
      db,
      correo: correoQueFalla(new CorreoError("Resend respondió 500.", { status: 500 })),
      orderId,
      baseUrl: BASE_URL,
    });
    spy.mockRestore();

    expect(res.enviado).toBe(false);
    const fila = await filaDe(orderId);
    expect(fila?.estado).toBe("PENDIENTE"); // recuperable por el cron
    expect(fila?.intentos).toBe(1); // el intento SÍ se gastó (fallo real)
    expect(fila?.ultimoError).toContain("500");
    expect(fila?.proveedorId).toBeNull();
    // Log sin PII: el orderId no es secreto, el email del Comprador sí (I3).
    const salida = errores.join("\n");
    expect(salida).toContain(orderId);
    expect(salida).not.toContain("compradora@fan.cl");
  });

  // correo.confirmacion.004 — I9: la CUOTA no es un fallo del correo. Con Resend Free (100/día) un
  // día cargado devolvería 429 a correos perfectamente sanos; si gastaran intentos, tres días de
  // tope los degradarían a FALLIDO y nadie los recibiría nunca.
  it("un 429 de cuota devuelve el intento: la fila queda como estaba, lista para el próximo ciclo", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { orderId } = await ordenConfirmada("a");

    const res = await enviarConfirmacionDeCompra({
      db,
      correo: correoQueFalla(new CorreoError("Resend respondió 429.", { status: 429 })),
      orderId,
      baseUrl: BASE_URL,
    });
    spy.mockRestore();

    expect(res.enviado).toBe(false);
    const fila = await filaDe(orderId);
    expect(fila?.estado).toBe("PENDIENTE");
    expect(fila?.intentos).toBe(0); // devuelto: la cuota no consume presupuesto
    expect(fila?.ultimoError).toContain("429");
  });
});

describe("pago/conCorreoPostPago — el webhook nunca espera a Resend (I3)", () => {
  // correo.confirmacion.005 — I3 hecho observable. Sin el seam `programar`, el decorator AWAITEA el
  // envío y el ack de Flow queda colgando de la latencia de Resend (8 s de timeout del adapter, y
  // Flow reintenta si el webhook tarda). Con él, `confirmarPago` resuelve y el correo sale después.
  //
  // El seam existe además para poder PROBARLO: `waitUntil` es infraestructura de Vercel y solo se
  // cablea en el borde (`pages/api/webhooks/flow.ts`); acá se inyecta un recolector, que es lo que
  // permite afirmar «cuando el webhook respondió, el correo todavía no había salido».
  it("el decorator devuelve el resultado del pago ANTES de que el correo salga; la tarea corre en segundo plano", async () => {
    const tareas: Promise<unknown>[] = [];
    let correoSalio = false;

    // Resend tarda: el envío queda colgado hasta que el test lo libera. Es la parte que importa
    // modelar —un fake que resuelve al toque no distinguiría esperar de no esperar— y es también
    // lo que hace este test capaz de fallar: con el decorator viejo (que AWAITEA el envío), el
    // `await confirmarPago(...)` de abajo no volvería nunca.
    let liberarRed = () => undefined as void;
    const red = new Promise<void>((resolve) => {
      liberarRed = resolve;
    });

    const confirmarPago = conCorreoPostPago(
      async () => ({ yaProcesado: false, transicion: "PAGADO" as const }),
      async () => {
        await red;
        correoSalio = true;
      },
      (tarea) => {
        tareas.push(tarea);
      },
    );

    const resultado = await confirmarPago({
      commerceOrder: "ord_x",
      resultado: "PAGADO",
    });

    // El webhook ya tiene su respuesta y el correo sigue en vuelo: Flow recibe su 200 sin esperar
    // un solo milisegundo de Resend.
    expect(resultado.transicion).toBe("PAGADO");
    expect(correoSalio).toBe(false);
    expect(tareas).toHaveLength(1);

    // Y la tarea programada sí termina el trabajo (es lo que `waitUntil` mantiene vivo en Vercel).
    liberarRed();
    await Promise.all(tareas);
    expect(correoSalio).toBe(true);
  });

  // correo.confirmacion.006 — la política de F04 sigue intacta con el seam nuevo: un replay
  // idempotente o una transición a FALLIDO no programan nada. Es la primera línea contra el
  // duplicado, antes incluso del ledger.
  it("no programa nada en un replay idempotente ni en una transición a FALLIDO", async () => {
    const tareas: Promise<unknown>[] = [];
    const programar = (t: Promise<unknown>) => {
      tareas.push(t);
    };
    const enviar = async () => undefined;

    const replay = conCorreoPostPago(
      async () => ({ yaProcesado: true, transicion: "PAGADO" as const }),
      enviar,
      programar,
    );
    const fallido = conCorreoPostPago(
      async () => ({ yaProcesado: false, transicion: "FALLIDO" as const }),
      enviar,
      programar,
    );

    await replay({ commerceOrder: "o1", resultado: "PAGADO" });
    await fallido({ commerceOrder: "o2", resultado: "FALLIDO" });

    expect(tareas).toHaveLength(0);
  });
});
