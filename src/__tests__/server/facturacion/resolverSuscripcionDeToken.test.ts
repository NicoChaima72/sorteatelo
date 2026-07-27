import { afterEach, describe, expect, it, vi } from "vitest";

import { resolverSuscripcionDeToken } from "~/server/facturacion/resolverSuscripcionDeToken";
import {
  ErrorFlowPlataforma,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * El paso que le faltaba al webhook para oír a Flow (F04, blocker 4 de la 3ª pasada del E2E):
 * traducir el `token` que Flow postea al `flowSubscriptionId` con el que se rutea la notificación.
 *
 * Lo que se prueba acá es la **semántica de reintento**, que es lo caro de equivocar:
 *
 * - Un token que Flow no reconoce es **irreintentable** ⇒ `null`, y el webhook ackea 200. Insistir
 *   con 500 sería empujar a Flow a reintentar para siempre una notificación que nunca va a andar —
 *   y, en el peor caso, a desactivar el `urlCallback` de la cuenta.
 * - Una caída de Flow o de la red es **transitoria** ⇒ el error PROPAGA, el webhook responde 500 y
 *   el reintento de Flow hace de red. Tragarlo con un 200 sería perder un cobro en silencio.
 */

function fakeFlow(getEstadoPago: unknown): FlowPlataformaService {
  return { getEstadoPago } as unknown as FlowPlataformaService;
}

describe("facturacion/resolverSuscripcionDeToken", () => {
  // facturacion.resolverToken.001 — el camino real: token ⇒ payment/getStatus ⇒ commerceOrder
  // La respuesta trae TRES datos y los tres importan: de qué suscripción habla, de qué cobro habla y
  // si ese cobro se pagó. Quedarse solo con el primero —como hacía la versión anterior— tiraba a la
  // basura la evidencia más fresca que existe del hecho notificado (blocker 5).
  it("consulta payment/getStatus con el token y devuelve suscripción, invoice y si se pagó", async () => {
    const getEstadoPago = vi.fn(async () => ({
      commerceOrder: "sus_df7ebcc91c_1179464_2026-07-26 20:32",
      status: 2,
      amount: 25000,
    }));

    const r = await resolverSuscripcionDeToken({
      flow: fakeFlow(getEstadoPago),
      token: "TOK-de-flow",
    });

    expect(getEstadoPago).toHaveBeenCalledWith("TOK-de-flow");
    expect(r).toEqual({
      flowSubscriptionId: "sus_df7ebcc91c",
      flowInvoiceId: "1179464",
      cobroPagado: true,
    });
  });

  // facturacion.resolverToken.005 — un cobro que Flow todavía no cobró no se anuncia como pagado
  it("no declara pagado un cobro cuyo estado en Flow no es «pagada»", async () => {
    for (const status of [1, 3, 4, undefined]) {
      const flow = fakeFlow(
        vi.fn(async () => ({
          commerceOrder: "sus_df7ebcc91c_1179464_2026-07-26 20:32",
          status,
        })),
      );
      await expect(
        resolverSuscripcionDeToken({ flow, token: "TOK" }),
      ).resolves.toMatchObject({ cobroPagado: false });
    }
  });

  // facturacion.resolverToken.002 — token que Flow no reconoce: irreintentable
  it("devuelve null si Flow rechaza el token con un 4xx, en vez de propagar", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const flow = fakeFlow(
      vi.fn(async () => {
        throw new ErrorFlowPlataforma({
          ruta: "/api/payment/getStatus",
          httpStatus: 400,
          codigoFlow: 1002,
          mensajeFlow: "Invalid token",
        });
      }),
    );

    await expect(
      resolverSuscripcionDeToken({ flow, token: "inventado" }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  // facturacion.resolverToken.003 — Flow caído: transitorio, tiene que reintentarse
  it("propaga un fallo transitorio para que el webhook responda 500 y Flow reintente", async () => {
    for (const error of [
      new ErrorFlowPlataforma({
        ruta: "/api/payment/getStatus",
        httpStatus: 503,
        codigoFlow: null,
        mensajeFlow: null,
      }),
      // 401/403: la credencial de plataforma quedó mal en Vercel o se rotó. Es un 4xx, pero el
      // problema es NUESTRO y se arregla — ackear acá perdería el cobro en silencio, que es
      // exactamente el modo de falla del blocker 4 en versión más difícil de diagnosticar.
      new ErrorFlowPlataforma({
        ruta: "/api/payment/getStatus",
        httpStatus: 401,
        codigoFlow: null,
        mensajeFlow: "Unauthorized",
      }),
      // 429: ráfaga de notificaciones contra el rate limit. Reintentar es justamente la solución.
      new ErrorFlowPlataforma({
        ruta: "/api/payment/getStatus",
        httpStatus: 429,
        codigoFlow: null,
        mensajeFlow: "Too many requests",
      }),
      new Error("fetch failed"), // la red, que ni siquiera llegó a Flow
    ]) {
      const flow = fakeFlow(
        vi.fn(async () => {
          throw error;
        }),
      );
      await expect(
        resolverSuscripcionDeToken({ flow, token: "TOK" }),
      ).rejects.toThrow();
    }
  });

  // facturacion.resolverToken.004 — un commerceOrder que no es de una suscripción no se adivina
  it("devuelve null si el commerceOrder no tiene la forma de un cobro de suscripción", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const flow = fakeFlow(
      vi.fn(async () => ({ commerceOrder: "una-orden-cualquiera", status: 2 })),
    );

    await expect(
      resolverSuscripcionDeToken({ flow, token: "TOK" }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
