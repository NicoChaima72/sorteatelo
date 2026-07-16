import { describe, expect, it, vi } from "vitest";

import type {
  ConfirmarPagoInput,
  TransicionPago,
} from "~/server/domain/pago/confirmarPagoDeOrden";
import type { EnrutarFlowFn, FlowRuteado } from "~/server/pago/enrutarPagoFlow";
import type { FlowGetStatusResponse } from "~/server/services/flow";
import { manejarWebhookFlow } from "~/server/pago/webhookFlow";

/**
 * Núcleo del webhook de Flow con RUTEO multi-tenant (paso 6, ADR-0001/0006).
 *
 * El enrutador se inyecta como fake: dado un token, devuelve el tenant/orden dueños +
 * un `getStatus` (que en el borde real usa las credenciales de ese tenant). Estos tests
 * verifican la POLÍTICA del núcleo (gates, getStatus-antes-de-efecto, orderId
 * autoritativo, idempotencia delegada), no el ruteo real (eso es enrutarPagoFlow.test).
 */

/** Enrutador fake: token conocido → getStatus con el estado Flow dado. */
function enrutarMock(
  status: number,
  extra: {
    tenantId?: string;
    orderId?: string;
    respuesta?: Partial<FlowGetStatusResponse>;
  } = {},
): { enrutar: EnrutarFlowFn; getStatus: ReturnType<typeof vi.fn> } {
  const getStatus = vi
    .fn<(token: string) => Promise<FlowGetStatusResponse>>()
    .mockResolvedValue({
      commerceOrder: "flow-dice-otra-cosa", // el body/Flow NO manda el orderId
      status,
      flowOrder: 991,
      paymentData: { fee: "103" },
      ...extra.respuesta,
    });
  const ruteo: FlowRuteado = {
    tenantId: extra.tenantId ?? "tenant-A",
    orderId: extra.orderId ?? "order-A",
    getStatus,
  };
  const enrutar = vi
    .fn<EnrutarFlowFn>()
    .mockResolvedValue(ruteo) as unknown as EnrutarFlowFn;
  return { enrutar, getStatus };
}

function confirmarPagoMock(
  ret: { yaProcesado: boolean; transicion: TransicionPago } = {
    yaProcesado: false,
    transicion: "PAGADO",
  },
) {
  return vi
    .fn<(input: ConfirmarPagoInput) => Promise<typeof ret>>()
    .mockResolvedValue(ret);
}

describe("pago/webhookFlow — núcleo del webhook de Flow (multi-tenant)", () => {
  // webhook.gate.405 — método ≠ POST ⇒ 405 sin efecto
  it("responde 405 sin ningún efecto si el método no es POST", async () => {
    const { enrutar } = enrutarMock(2);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "GET", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(res.status).toBe(405);
    expect(enrutar).not.toHaveBeenCalled();
    expect(confirmarPago).not.toHaveBeenCalled();
  });

  // webhook.ruteo.pagado — rutea, confirma server-side y usa el orderId del RUTEO
  it("rutea el token, confirma vía getStatus (pagado) y cierra la orden del ruteo (no la del body)", async () => {
    const { enrutar, getStatus } = enrutarMock(2, { orderId: "order-real-42" });
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "flow-token-xyz" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(enrutar).toHaveBeenCalledWith("flow-token-xyz");
    expect(getStatus).toHaveBeenCalledWith("flow-token-xyz");
    expect(confirmarPago).toHaveBeenCalledTimes(1);
    expect(confirmarPago).toHaveBeenCalledWith({
      commerceOrder: "order-real-42", // autoritativo (del ruteo/DB), NO el commerceOrder de Flow
      resultado: "PAGADO",
      fee: "103",
      flowOrder: 991,
    });
    expect(res.status).toBe(200);
  });

  // webhook.gate.getStatus-first — el body jamás es prueba de pago
  it("NUNCA trata el body como prueba de pago: siempre consulta getStatus antes de cualquier efecto", async () => {
    const orden: string[] = [];
    const getStatus = vi
      .fn<(token: string) => Promise<FlowGetStatusResponse>>()
      .mockImplementation(async () => {
        orden.push("getStatus");
        // Flow dice RECHAZADA (3), aunque el body mienta "status: paid".
        return { commerceOrder: "o1", status: 3, flowOrder: 1, paymentData: null };
      });
    const enrutar = vi
      .fn<EnrutarFlowFn>()
      .mockResolvedValue({ tenantId: "t", orderId: "o1", getStatus });
    const confirmarPago = vi
      .fn<
        (
          input: ConfirmarPagoInput,
        ) => Promise<{ yaProcesado: boolean; transicion: TransicionPago }>
      >()
      .mockImplementation(async () => {
        orden.push("confirmarPago");
        return { yaProcesado: false, transicion: "FALLIDO" };
      });

    await manejarWebhookFlow({
      req: {
        method: "POST",
        headers: {},
        body: { token: "t", status: "paid", amount: "999999" }, // body mentiroso
      },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    // getStatus corre ANTES que cualquier efecto, y el resultado viene de getStatus
    // (FALLIDO), NO del body (que decía "paid").
    expect(orden).toEqual(["getStatus", "confirmarPago"]);
    expect(confirmarPago.mock.calls[0]![0].resultado).toBe("FALLIDO");
  });

  // webhook.confirmacion.fallido — rechazada/anulada ⇒ transición a FALLIDO
  it("con resultado rechazado/anulado en Flow dispara la transición a FALLIDO", async () => {
    const { enrutar } = enrutarMock(4); // anulada
    const confirmarPago = confirmarPagoMock({
      yaProcesado: false,
      transicion: "FALLIDO",
    });

    const anulada = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "FALLIDO" }),
    );
    expect(anulada.status).toBe(200);
  });

  // webhook.idempotencia — replay (pago ya procesado) ⇒ ack sin re-efectos
  it("una segunda llegada (pago ya procesado) responde OK sin re-ejecutar efectos", async () => {
    const { enrutar } = enrutarMock(2);
    const confirmarPago = confirmarPagoMock({
      yaProcesado: true,
      transicion: "NINGUNA",
    });

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ yaProcesado: true, transicion: "NINGUNA" });
  });

  // webhook.pendiente — Flow aún no resolvió ⇒ ack sin efecto
  it("si Flow reporta pendiente (1), ack 200 sin llamar a confirmarPago", async () => {
    const { enrutar } = enrutarMock(1);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(res.status).toBe(200);
    expect(confirmarPago).not.toHaveBeenCalled();
  });

  // webhook.gate.missing-token — sin token ⇒ ack+ignore sin rutear ni confirmar
  it("sin token en el body ack+ignora (200) sin rutear ni confirmar", async () => {
    const { enrutar } = enrutarMock(2);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: {} },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignorado: "missing_token" });
    expect(enrutar).not.toHaveBeenCalled();
    expect(confirmarPago).not.toHaveBeenCalled();
  });

  // webhook.ruteo.unknown-token — token que no matchea ningún Payment ⇒ ack+ignore sin efecto
  it("token desconocido (ruteo devuelve null) ack+ignora (200) sin confirmar", async () => {
    const enrutar = vi.fn<EnrutarFlowFn>().mockResolvedValue(null);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "ajeno" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignorado: "unknown_token" });
    expect(enrutar).toHaveBeenCalledWith("ajeno");
    expect(confirmarPago).not.toHaveBeenCalled();
  });

  // webhook.token.form-urlencoded — Flow postea form-urlencoded crudo
  it("extrae el token de un body form-urlencoded crudo (string)", async () => {
    const { enrutar } = enrutarMock(2);
    const confirmarPago = confirmarPagoMock();

    await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: "token=flow-token-abc&extra=1" },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(enrutar).toHaveBeenCalledWith("flow-token-abc");
  });
});
