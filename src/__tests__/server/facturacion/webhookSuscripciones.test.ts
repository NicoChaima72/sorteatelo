import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CorreoAEnviar,
  ResultadoNotificacion,
} from "~/server/domain/facturacion/procesarNotificacionSuscripcion";
import { manejarWebhookSuscripciones } from "~/server/facturacion/webhookSuscripciones";

/**
 * Núcleo del webhook de suscripciones de plataforma (F04). Espeja la forma del webhook de ventas
 * (`pago/webhookFlow.ts`): recibe un `req` acotado + dependencias inyectables y devuelve
 * `{ status, body }` sin escribir la respuesta ni tocar `env`.
 *
 * Lo que se prueba acá es la POLÍTICA DEL BORDE —gates, extracción del identificador, semántica de
 * reintento y el envío POST-COMMIT de los correos—, no la derivación de estados (eso es
 * `procesarNotificacion.test.ts`).
 */

const OK: ResultadoNotificacion = {
  ruteo: "PROCESADA",
  estadoAntes: "AL_DIA",
  estadoDespues: "AL_DIA",
  correos: [],
};

function procesarMock(ret: ResultadoNotificacion = OK) {
  return vi
    .fn<
      (input: { flowSubscriptionId: string }) => Promise<ResultadoNotificacion>
    >()
    .mockResolvedValue(ret);
}

const unCorreo: CorreoAEnviar = {
  destinatario: "ana@x.cl",
  datos: { tipo: "COMPROBANTE_PAGO", nombreTienda: "Tienda de Ana", montoBruto: "25000" },
};

describe("facturacion/webhookSuscripciones — núcleo del webhook", () => {
  // facturacion.webhook.001 — gate de método: solo POST dispara efectos
  it("responde 405 sin ningún efecto si el método no es POST", async () => {
    const procesar = procesarMock();
    const enviarCorreos = vi.fn(async () => undefined);

    const res = await manejarWebhookSuscripciones({
      req: { method: "GET", headers: {}, body: { subscriptionId: "s1" } },
      procesarNotificacion: procesar,
      enviarCorreos,
    });

    expect(res.status).toBe(405);
    expect(procesar).not.toHaveBeenCalled();
    expect(enviarCorreos).not.toHaveBeenCalled();
  });

  // facturacion.webhook.002 — sin identificador ⇒ ack+ignore (irreintentable, no 4xx)
  it("sin subscriptionId en el body ack+ignora (200) sin procesar", async () => {
    const procesar = procesarMock();

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: {} },
      procesarNotificacion: procesar,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignorado: "missing_subscription_id" });
    expect(procesar).not.toHaveBeenCalled();
  });

  // facturacion.webhook.003 — Flow postea form-urlencoded crudo
  it("extrae el subscriptionId de un body form-urlencoded crudo (string)", async () => {
    const procesar = procesarMock();

    await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: "subscriptionId=flow-sub-9&otro=1" },
      procesarNotificacion: procesar,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(procesar).toHaveBeenCalledWith({ flowSubscriptionId: "flow-sub-9" });
  });

  // facturacion.webhook.004 — Flow mezcla camelCase y snake_case en su API
  it("acepta también la variante snake_case del identificador", async () => {
    const procesar = procesarMock();

    await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscription_id: "flow-sub-8" } },
      procesarNotificacion: procesar,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(procesar).toHaveBeenCalledWith({ flowSubscriptionId: "flow-sub-8" });
  });

  // facturacion.webhook.005 — I3: del body se toma el ID y NADA más
  it("del cuerpo del POST solo toma el identificador: ningún otro campo viaja al use case", async () => {
    const procesar = procesarMock();

    await manejarWebhookSuscripciones({
      req: {
        method: "POST",
        headers: {},
        // Body mentiroso: dice que está pagada y por cuánto.
        body: {
          subscriptionId: "flow-sub-1",
          status: "paid",
          amount: "999999",
          morose: "0",
        },
      },
      procesarNotificacion: procesar,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(procesar).toHaveBeenCalledWith({ flowSubscriptionId: "flow-sub-1" });
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  // facturacion.webhook.006 — los correos salen DESPUÉS de la transición (post-commit, I9)
  it("manda los correos después de procesar, nunca antes", async () => {
    const orden: string[] = [];
    const procesar = vi
      .fn<
        (input: { flowSubscriptionId: string }) => Promise<ResultadoNotificacion>
      >()
      .mockImplementation(async () => {
        orden.push("procesar");
        return { ...OK, correos: [unCorreo] };
      });
    const enviarCorreos = vi.fn(async () => {
      orden.push("correos");
    });

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscriptionId: "s1" } },
      procesarNotificacion: procesar,
      enviarCorreos,
    });

    expect(orden).toEqual(["procesar", "correos"]);
    expect(enviarCorreos).toHaveBeenCalledWith([unCorreo]);
    expect(res.status).toBe(200);
  });

  // facturacion.webhook.007 — sin transición no se llama al envío (idempotencia del replay)
  it("no llama al envío de correos cuando la notificación no ameritó ninguno", async () => {
    const enviarCorreos = vi.fn(async () => undefined);

    await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscriptionId: "s1" } },
      procesarNotificacion: procesarMock(),
      enviarCorreos,
    });

    expect(enviarCorreos).not.toHaveBeenCalled();
  });

  // facturacion.webhook.008 — I9: log-and-continue, el correo no revierte la transición
  it("si el envío de correos falla, la transición se mantiene y el webhook igual ackea 200", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const enviarCorreos = vi.fn(async () => {
      throw new Error("resend 429");
    });

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscriptionId: "s1" } },
      procesarNotificacion: procesarMock({ ...OK, correos: [unCorreo] }),
      enviarCorreos,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, ruteo: "PROCESADA" });
    expect(error).toHaveBeenCalled();
  });

  // facturacion.webhook.009 — la huérfana cancelada también ackea 200 (D16-C)
  it("una notificación huérfana responde 200 informando el ruteo", async () => {
    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscriptionId: "ajena" } },
      procesarNotificacion: procesarMock({
        ruteo: "HUERFANA_CANCELADA",
        correos: [],
      }),
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ruteo: "HUERFANA_CANCELADA" });
  });

  // facturacion.webhook.010 — un fallo del use case SÍ es reintentable (5xx)
  it("si el use case falla (Flow caído, DB), responde 500 para que Flow reintente", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const procesar = vi
      .fn<
        (input: { flowSubscriptionId: string }) => Promise<ResultadoNotificacion>
      >()
      .mockRejectedValue(new Error("flow 503"));

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscriptionId: "s1" } },
      procesarNotificacion: procesar,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(500);
    expect(error).toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
