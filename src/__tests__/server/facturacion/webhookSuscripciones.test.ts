import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CorreoAEnviar,
  ResultadoNotificacion,
} from "~/server/domain/facturacion/procesarNotificacionSuscripcion";
import { type NotificacionResuelta } from "~/server/facturacion/resolverSuscripcionDeToken";
import {
  type ProcesarNotificacionFn,
  type ResolverIdDeSuscripcionFn,
  manejarWebhookSuscripciones,
} from "~/server/facturacion/webhookSuscripciones";

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
    .fn<ProcesarNotificacionFn>()
    .mockResolvedValue(ret);
}

/**
 * Resolutor del `token` de Flow. **Este es el camino REAL**: Flow postea `token=<…>` y nada más, y
 * de consultar `payment/getStatus` sale la suscripción, el cobro y si ese cobro se pagó (ver
 * `resolverSuscripcionDeToken`).
 */
function resolverMock(
  devuelve: NotificacionResuelta | null = {
    flowSubscriptionId: "flow-sub-7",
    flowInvoiceId: "1179470",
    cobroPagado: true,
  },
) {
  return vi.fn<ResolverIdDeSuscripcionFn>().mockResolvedValue(devuelve);
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
      resolverIdDeSuscripcion: resolverMock(),
      enviarCorreos,
    });

    expect(res.status).toBe(405);
    expect(procesar).not.toHaveBeenCalled();
    expect(enviarCorreos).not.toHaveBeenCalled();
  });

  // facturacion.webhook.011 — EL CAMINO REAL: Flow postea `token=` form-urlencoded y nada más
  // Lo que se resuelve del token viaja ENTERO al use case: la suscripción, el cobro del que habla la
  // notificación y si ese cobro se pagó. Quedarse con el primero tiraba la evidencia del pago.
  it("resuelve el token que Flow postea y procesa la suscripción que le corresponde", async () => {
    const procesar = procesarMock();
    const resolver = resolverMock({
      flowSubscriptionId: "sus_df7ebcc91c",
      flowInvoiceId: "1179470",
      cobroPagado: true,
    });

    const res = await manejarWebhookSuscripciones({
      // Capturado del sandbox real: `application/x-www-form-urlencoded` con un solo campo.
      req: {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "token=4c3d4b1e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",
      },
      procesarNotificacion: procesar,
      resolverIdDeSuscripcion: resolver,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(resolver).toHaveBeenCalledWith(
      "4c3d4b1e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",
    );
    expect(procesar).toHaveBeenCalledWith({
      flowSubscriptionId: "sus_df7ebcc91c",
      flowInvoiceId: "1179470",
      cobroPagado: true,
    });
    expect(res.status).toBe(200);
  });

  // facturacion.webhook.012 — token que no resuelve: irreintentable, se ackea sin procesar
  it("ackea 200 sin procesar cuando el token no resuelve a ninguna suscripción", async () => {
    const procesar = procesarMock();

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: "token=inventado" },
      procesarNotificacion: procesar,
      // `null` = Flow rechazó el token o el commerceOrder no es de una suscripción (ver
      // `resolverSuscripcionDeToken`): insistir con 500 no lo arregla y arriesga el callback.
      resolverIdDeSuscripcion: resolverMock(null),
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignorado: "token_sin_suscripcion" });
    expect(procesar).not.toHaveBeenCalled();
  });

  // facturacion.webhook.013 — resolver caído: transitorio ⇒ 500 para que Flow reintente
  it("responde 500 si resolver el token falla por algo transitorio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const procesar = procesarMock();

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: "token=TOK" },
      procesarNotificacion: procesar,
      resolverIdDeSuscripcion: vi
        .fn<ResolverIdDeSuscripcionFn>()
        .mockRejectedValue(new Error("flow 503")),
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(500);
    expect(procesar).not.toHaveBeenCalled();
  });

  // facturacion.webhook.002 — sin token ni identificador ⇒ ack+ignore (irreintentable, no 4xx)
  it("sin token ni subscriptionId en el body ack+ignora (200) sin procesar", async () => {
    const procesar = procesarMock();

    const res = await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: {} },
      procesarNotificacion: procesar,
      resolverIdDeSuscripcion: resolverMock(),
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignorado: "sin_identificador" });
    expect(procesar).not.toHaveBeenCalled();
  });

  // facturacion.webhook.003 — puerta de reconciliación manual: el id directo, sin token
  it("acepta un subscriptionId directo en el body, sin pasar por payment/getStatus", async () => {
    const procesar = procesarMock();
    const resolver = resolverMock();

    await manejarWebhookSuscripciones({
      // Flow NO manda esto (verificado en el sandbox): es la puerta para re-disparar a mano el
      // espejo de una suscripción cuya notificación se perdió. No autoriza nada — el estado se
      // sigue leyendo de la API de Flow (I3).
      req: { method: "POST", headers: {}, body: "subscriptionId=flow-sub-9&otro=1" },
      procesarNotificacion: procesar,
      resolverIdDeSuscripcion: resolver,
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(procesar).toHaveBeenCalledWith({ flowSubscriptionId: "flow-sub-9" });
    expect(resolver).not.toHaveBeenCalled();
  });

  // facturacion.webhook.004 — Flow mezcla camelCase y snake_case en su API
  it("acepta también la variante snake_case del identificador", async () => {
    const procesar = procesarMock();

    await manejarWebhookSuscripciones({
      req: { method: "POST", headers: {}, body: { subscription_id: "flow-sub-8" } },
      procesarNotificacion: procesar,
      resolverIdDeSuscripcion: resolverMock(),
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
      resolverIdDeSuscripcion: resolverMock(),
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
      resolverIdDeSuscripcion: resolverMock(),
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
      resolverIdDeSuscripcion: resolverMock(),
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
      resolverIdDeSuscripcion: resolverMock(),
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
      resolverIdDeSuscripcion: resolverMock(),
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
      resolverIdDeSuscripcion: resolverMock(),
      enviarCorreos: vi.fn(async () => undefined),
    });

    expect(res.status).toBe(500);
    expect(error).toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
