import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ConfirmarPagoInput,
  TransicionPago,
} from "~/server/domain/pago/confirmarPagoDeOrden";
import type { EnrutarFlowFn, FlowRuteado } from "~/server/pago/enrutarPagoFlow";
import type {
  FlowGetStatusResponse,
  FlowGetStatusWire,
  HttpGet,
} from "~/server/services/flow";
import { crearFlowService } from "~/server/services/flow";
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
    montoEsperado?: number;
    respuesta?: Partial<FlowGetStatusResponse>;
  } = {},
): { enrutar: EnrutarFlowFn; getStatus: ReturnType<typeof vi.fn> } {
  const montoEsperado = extra.montoEsperado ?? 1000;
  const getStatus = vi
    .fn<(token: string) => Promise<FlowGetStatusResponse>>()
    .mockResolvedValue({
      commerceOrder: "flow-dice-otra-cosa", // el body/Flow NO manda el orderId
      status,
      flowOrder: 991,
      amount: montoEsperado, // por defecto el monto coincide (happy path); se overridea por caso
      paymentData: { fee: "103" },
      ...extra.respuesta,
    });
  const ruteo: FlowRuteado = {
    tenantId: extra.tenantId ?? "tenant-A",
    orderId: extra.orderId ?? "order-A",
    montoEsperado,
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
      .mockResolvedValue({ tenantId: "t", orderId: "o1", montoEsperado: 1000, getStatus });
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

  // webhook.amount.match — amount de Flow == montoEsperado ⇒ transiciona a PAGADO normal
  it("con amount == montoEsperado transiciona a PAGADO normalmente", async () => {
    const { enrutar } = enrutarMock(2, {
      montoEsperado: 5000,
      respuesta: { amount: 5000 },
    });
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).toHaveBeenCalledTimes(1);
    expect(confirmarPago).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "PAGADO" }),
    );
    expect(res.status).toBe(200);
  });

  // webhook.amount.mismatch — amount ≠ montoEsperado ⇒ NO transiciona (log + ack 200 irreintentable)
  it("con amount != montoEsperado NO transiciona, loguea y responde 200 con ignorado amount_mismatch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { enrutar } = enrutarMock(2, {
      montoEsperado: 5000,
      respuesta: { amount: 999999 }, // monto adulterado
    });
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).not.toHaveBeenCalled(); // NO se marca PAGADO
    expect(res.status).toBe(200); // ack sin reintento (irreintentable)
    expect(res.body).toMatchObject({ received: true, ignorado: "amount_mismatch" });
    expect(warn).toHaveBeenCalled(); // se logueó el mismatch
  });

  // webhook.amount.undefined — Flow omite amount ⇒ procede (warning) sin bloquear un pago legítimo
  it("con amount undefined procede a confirmar (warning) — no bloquea pagos legítimos", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { enrutar } = enrutarMock(2, {
      montoEsperado: 5000,
      respuesta: { amount: undefined }, // Flow omite amount
    });
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "t" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).toHaveBeenCalledTimes(1);
    expect(confirmarPago).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "PAGADO" }),
    );
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalled();
  });
});

/**
 * Enrutador cableado con el ADAPTER REAL de Flow: el `getStatus` del ruteo es el del
 * `FlowService` de verdad y lo único fake es el WIRE (`httpGet`, la respuesta cruda que
 * Flow serializa). Así estos tests ejercen el camino completo wire → adapter → Gate 5,
 * que es exactamente donde vivía el bug de producción: Flow PRODUCCIÓN manda
 * `{"status":2,"amount":"3000"}` (amount STRING) y el gate comparaba estricto contra
 * un `number`. Un fake del `getStatus` entero no habría visto nunca este bug.
 */
function enrutarConWireReal(
  wire: FlowGetStatusWire,
  montoEsperado: number,
): { enrutar: EnrutarFlowFn; httpGet: ReturnType<typeof vi.fn> } {
  const httpGet = vi.fn<HttpGet>().mockResolvedValue(wire);
  const flow = crearFlowService({
    apiKey: "api-key-tenant",
    secretKey: "secret-tenant",
    baseUrl: "https://www.flow.cl/api",
    urlConfirmation: undefined, // getStatus no las usa
    urlReturn: undefined,
    httpGet,
  });
  const ruteo: FlowRuteado = {
    tenantId: "tenant-iselk",
    orderId: "order-real",
    montoEsperado,
    getStatus: (t) => flow.getStatus(t),
  };
  const enrutar = vi
    .fn<EnrutarFlowFn>()
    .mockResolvedValue(ruteo) as unknown as EnrutarFlowFn;
  return { enrutar, httpGet };
}

/** Respuesta cruda de producción (2026-08-11, orden atascada de iselk), con el amount variable. */
function wireDeProduccion(amount: FlowGetStatusWire["amount"]): FlowGetStatusWire {
  return {
    flowOrder: 177895518,
    commerceOrder: "cmsovwfxe000cyg2vru7qxe7n",
    status: 2,
    ...(amount === undefined ? {} : { amount }),
    paymentData: { fee: "103", balance: "2897" },
  };
}

describe("pago/webhookFlow — amount del WIRE real de Flow (adapter + Gate 5)", () => {
  // webhook.amount.wire.string — el incidente: Flow producción manda amount STRING
  it("con amount STRING del wire ('3000') igual al esperado transiciona a PAGADO", async () => {
    const { enrutar } = enrutarConWireReal(wireDeProduccion("3000"), 3000);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "tok-real" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).toHaveBeenCalledTimes(1);
    expect(confirmarPago).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "PAGADO", commerceOrder: "order-real" }),
    );
    expect(res.body).not.toMatchObject({ ignorado: "amount_mismatch" });
  });

  // webhook.amount.wire.number — el sandbox manda amount NUMBER: no puede regresionar
  it("con amount NUMBER del wire (3000, shape sandbox) igual al esperado transiciona a PAGADO", async () => {
    const { enrutar } = enrutarConWireReal(wireDeProduccion(3000), 3000);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "tok-sandbox" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).toHaveBeenCalledTimes(1);
    expect(confirmarPago).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "PAGADO" }),
    );
    expect(res.body).not.toMatchObject({ ignorado: "amount_mismatch" });
  });

  // webhook.amount.wire.mismatch — normalizar NO relaja el gate (I2): string ≠ esperado sigue bloqueando
  it("con amount STRING del wire ('9999') distinto del esperado NO transiciona: amount_mismatch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { enrutar } = enrutarConWireReal(wireDeProduccion("9999"), 3000);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "tok-adulterado" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).not.toHaveBeenCalled();
    expect(res.status).toBe(200); // irreintentable: ack sin reintento
    expect(res.body).toMatchObject({ received: true, ignorado: "amount_mismatch" });
    expect(warn).toHaveBeenCalled();
  });

  // webhook.amount.wire.ilegible — D1 fail-closed: presente pero no parseable ⇒ NO transiciona
  it.each([
    ["abc", "texto que no es un número"],
    ["", "string vacío"],
  ])(
    "con amount ILEGIBLE del wire (%j, %s) NO transiciona: fail-closed en amount_mismatch",
    async (amount) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { enrutar } = enrutarConWireReal(wireDeProduccion(amount), 3000);
      const confirmarPago = confirmarPagoMock();

      const res = await manejarWebhookFlow({
        req: { method: "POST", headers: {}, body: { token: "tok-corrupto" } },
        enrutarFlow: enrutar,
        confirmarPago,
      });

      expect(confirmarPago).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ received: true, ignorado: "amount_mismatch" });
      expect(warn).toHaveBeenCalled();
    },
  );

  // webhook.amount.wire.ausente — Flow omite el campo ⇒ warning y procede (tolerancia intacta)
  it("sin amount en el wire procede a confirmar con warning (comportamiento actual intacto)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { enrutar } = enrutarConWireReal(wireDeProduccion(undefined), 3000);
    const confirmarPago = confirmarPagoMock();

    const res = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: "tok-sin-amount" } },
      enrutarFlow: enrutar,
      confirmarPago,
    });

    expect(confirmarPago).toHaveBeenCalledTimes(1);
    expect(confirmarPago).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "PAGADO" }),
    );
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("sin amount"),
      expect.anything(),
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
