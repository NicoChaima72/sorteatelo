import { describe, expect, it, vi } from "vitest";

import {
  crearFlowService,
  firmarParams,
  type HttpGet,
  type HttpPost,
} from "~/server/services/flow";

describe("services/flow — firma HMAC-SHA256", () => {
  // flow.firma.001
  it("ordena los parámetros por clave y produce la firma esperada para un vector conocido", () => {
    // Vector de prueba: el golden se computó independientemente (crypto.createHmac
    // sobre la cadena `clave+valor` con las claves en orden alfabético). Los params
    // acá van DESORDENADOS a propósito: firmarParams debe ordenarlos antes de firmar.
    const params = {
      urlReturn: "https://libros-iselk.test/dev/checkout/retorno",
      amount: 3000,
      email: "fan@example.cl",
      apiKey: "test-api-key-1234",
      urlConfirmation: "https://libros-iselk.test/api/webhooks/flow",
      commerceOrder: "clorder000000000000000001",
      subject: "Cómo enriquecer a tu idol favorito",
      currency: "CLP",
    };
    const firma = firmarParams(params, "test-secret-key-abcdef");
    expect(firma).toBe(
      "238e135d7cc487d917a459cabbddf988f3e4d21baad902ab0e1fd5b76d8a8118",
    );
  });

  // flow.firma.002
  it("es sensible al orden real de las claves (mismo set, distinto valor → distinta firma)", () => {
    const base = { a: "1", b: "2", c: "3" };
    const otra = { a: "1", b: "2", c: "4" };
    const secret = "s";
    expect(firmarParams(base, secret)).not.toBe(firmarParams(otra, secret));
  });
});

describe("services/flow — crearPago", () => {
  // flow.crearPago.001
  it("arma el payload firmado (commerceOrder, subject, amount, email, urls, apiKey) y devuelve la URL de redirect", async () => {
    const httpPost = vi.fn<HttpPost>().mockResolvedValue({
      url: "https://sandbox.flow.cl/app/web/pay.php",
      token: "flow-token-xyz",
      flowOrder: 991,
    });
    const flow = crearFlowService({
      apiKey: "api-key-1",
      secretKey: "secret-1",
      baseUrl: "https://sandbox.flow.cl/api",
      urlConfirmation: "https://libros-iselk.test/api/webhooks/flow",
      urlReturn: "https://libros-iselk.test/dev/checkout/retorno",
      httpPost,
    });

    const res = await flow.crearPago({
      commerceOrder: "clorder000000000000000001",
      subject: "Cómo enriquecer a tu idol favorito",
      amount: "3000",
      email: "fan@example.cl",
    });

    // POST a payment/create
    expect(httpPost).toHaveBeenCalledTimes(1);
    const [urlLlamada, payload] = httpPost.mock.calls[0]!;
    expect(urlLlamada).toBe("https://sandbox.flow.cl/api/payment/create");

    // El payload contiene todos los campos exigidos por Flow + la firma adjunta.
    expect(payload).toMatchObject({
      apiKey: "api-key-1",
      commerceOrder: "clorder000000000000000001",
      subject: "Cómo enriquecer a tu idol favorito",
      currency: "CLP",
      amount: "3000",
      email: "fan@example.cl",
      urlConfirmation: "https://libros-iselk.test/api/webhooks/flow",
      urlReturn: "https://libros-iselk.test/dev/checkout/retorno",
    });
    expect(typeof payload.s).toBe("string");
    expect(payload.s).toHaveLength(64); // hex de sha256

    // La firma del payload es la de sus params (sin `s`).
    const { s, ...sinFirma } = payload;
    expect(s).toBe(firmarParams(sinFirma, "secret-1"));

    // Devuelve la URL de redirect (url + token) + token/flowOrder para persistir.
    expect(res).toEqual({
      redirectUrl: "https://sandbox.flow.cl/app/web/pay.php?token=flow-token-xyz",
      token: "flow-token-xyz",
      flowOrder: 991,
    });
  });

  // flow.crearPago.003 — BYO-Flow (ADR-0006): la firma es por-tenant
  it("dos tenants (secretKeys distintas) firman el MISMO payload con firmas distintas", async () => {
    const httpPostA = vi.fn<HttpPost>().mockResolvedValue({
      url: "https://sandbox.flow.cl/app/web/pay.php",
      token: "tok-A",
    });
    const httpPostB = vi.fn<HttpPost>().mockResolvedValue({
      url: "https://sandbox.flow.cl/app/web/pay.php",
      token: "tok-B",
    });
    // Misma apiKey y mismas urls a propósito: lo ÚNICO distinto es la secretKey de
    // cada tenant. Aun así la firma `s` debe diferir (es HMAC con la secretKey).
    const base = {
      apiKey: "api-key-compartida",
      baseUrl: "https://sandbox.flow.cl/api",
      urlConfirmation: "https://plataforma.test/api/webhooks/flow",
      urlReturn: "https://plataforma.test/dev/checkout/retorno",
    } as const;
    const flowA = crearFlowService({ ...base, secretKey: "secret-tenant-A", httpPost: httpPostA });
    const flowB = crearFlowService({ ...base, secretKey: "secret-tenant-B", httpPost: httpPostB });

    const input = {
      commerceOrder: "clorder000000000000000001",
      subject: "Producto idéntico",
      amount: "3000",
      email: "fan@example.cl",
    };
    await flowA.crearPago(input);
    await flowB.crearPago(input);

    const { s: firmaA, ...paramsA } = httpPostA.mock.calls[0]![1];
    const { s: firmaB, ...paramsB } = httpPostB.mock.calls[0]![1];
    // Las firmas difieren...
    expect(firmaA).not.toBe(firmaB);
    // ...y cada una es exactamente la de SU secretKey (nunca la del otro tenant).
    expect(firmaA).toBe(firmarParams(paramsA, "secret-tenant-A"));
    expect(firmaB).toBe(firmarParams(paramsB, "secret-tenant-B"));
  });

  // flow.crearPago.002
  it("falla claro (fail-fast) si faltan credenciales al ejecutar", async () => {
    const flow = crearFlowService({
      apiKey: undefined,
      secretKey: undefined,
      baseUrl: undefined,
      urlConfirmation: undefined,
      urlReturn: undefined,
      httpPost: vi.fn<HttpPost>(),
    });
    await expect(
      flow.crearPago({
        commerceOrder: "o1",
        subject: "s",
        amount: "3000",
        email: "e@e.cl",
      }),
    ).rejects.toThrow(/FLOW/i);
  });
});

describe("services/flow — getStatus", () => {
  // flow.getStatus.001
  it("consulta payment/getStatus firmado y devuelve el estado crudo de Flow", async () => {
    const httpGet = vi.fn<HttpGet>().mockResolvedValue({
      flowOrder: 991,
      commerceOrder: "clorder000000000000000001",
      status: 2,
      amount: 3000,
      paymentData: { fee: "103", balance: "2897" },
    });
    const flow = crearFlowService({
      apiKey: "api-key-1",
      secretKey: "secret-1",
      baseUrl: "https://sandbox.flow.cl/api",
      urlConfirmation: "https://x/c",
      urlReturn: "https://x/r",
      httpGet,
    });

    const status = await flow.getStatus("flow-token-xyz");

    expect(httpGet).toHaveBeenCalledTimes(1);
    const [urlLlamada, query] = httpGet.mock.calls[0]!;
    expect(urlLlamada).toBe("https://sandbox.flow.cl/api/payment/getStatus");
    expect(query).toMatchObject({ apiKey: "api-key-1", token: "flow-token-xyz" });
    expect(query.s).toBe(
      firmarParams({ apiKey: "api-key-1", token: "flow-token-xyz" }, "secret-1"),
    );
    expect(status).toMatchObject({
      commerceOrder: "clorder000000000000000001",
      status: 2,
      paymentData: { fee: "103" },
    });
  });
});
