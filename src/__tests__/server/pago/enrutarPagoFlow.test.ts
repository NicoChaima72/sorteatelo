import { randomBytes } from "crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  crearEnrutadorFlow,
  type PagoConCredencial,
  type RepoRuteoFlow,
} from "~/server/pago/enrutarPagoFlow";
import { cifrar } from "~/server/services/cifrado";
import {
  crearFlowService,
  firmarParams,
  type FlowConfig,
} from "~/server/services/flow";

/**
 * Tests del ruteo multi-tenant del webhook (paso 6, ADR-0006). El mecanismo nuevo más
 * riesgoso del pivote: se prueba con un repo fake que jamás se usan las credenciales de
 * otro tenant ni unas globales, y que un token desconocido no resuelve.
 */

const clave = randomBytes(32);

// Dos tenants con credenciales sandbox DISTINTAS, cifradas con la misma clave.
const TENANT_A: PagoConCredencial = {
  tenantId: "tenant-A",
  orderId: "order-A",
  apiKeyCifrada: cifrar("apikey-A", clave),
  secretKeyCifrada: cifrar("secret-A", clave),
  sandbox: true,
};
const TENANT_B: PagoConCredencial = {
  tenantId: "tenant-B",
  orderId: "order-B",
  apiKeyCifrada: cifrar("apikey-B", clave),
  secretKeyCifrada: cifrar("secret-B", clave),
  sandbox: true,
};

/** Repo fake: token → el pago del tenant correspondiente. */
function repoFake(): RepoRuteoFlow {
  const porToken: Record<string, PagoConCredencial> = {
    "tok-A": TENANT_A,
    "tok-B": TENANT_B,
  };
  return {
    buscarPagoPorToken: (token) => Promise.resolve(porToken[token] ?? null),
  };
}

/** Enrutador con una factory que captura la config de cada service instanciado. */
function enrutadorConCaptura() {
  const configs: FlowConfig[] = [];
  const httpGet = vi.fn().mockResolvedValue({ commerceOrder: "x", status: 2 });
  const enrutar = crearEnrutadorFlow({
    repo: repoFake(),
    clave,
    crearServicio: (config) => {
      configs.push(config);
      return crearFlowService({ ...config, httpGet });
    },
  });
  return { enrutar, configs, httpGet };
}

describe("pago/enrutarPagoFlow — ruteo multi-tenant del webhook", () => {
  // ruteo.001 — token del tenant A ⇒ credenciales del tenant A (nunca de B, nunca globales)
  it("rutea el token al tenant dueño y usa SUS credenciales descifradas", async () => {
    const { enrutar, configs, httpGet } = enrutadorConCaptura();

    const ruteo = await enrutar("tok-A");
    expect(ruteo).not.toBeNull();
    expect(ruteo!.tenantId).toBe("tenant-A");
    expect(ruteo!.orderId).toBe("order-A"); // orderId autoritativo, de nuestra DB

    await ruteo!.getStatus("tok-A");
    // El service se armó con las credenciales del tenant A (descifradas).
    expect(configs[0]!.apiKey).toBe("apikey-A");
    expect(configs[0]!.secretKey).toBe("secret-A");
    // Y la firma de getStatus usó la secretKey de A — NO la de B, NO una global.
    const query = httpGet.mock.calls[0]![1] as Record<string, string>;
    expect(query.s).toBe(
      firmarParams({ apiKey: "apikey-A", token: "tok-A" }, "secret-A"),
    );
    expect(query.s).not.toBe(
      firmarParams({ apiKey: "apikey-B", token: "tok-A" }, "secret-B"),
    );
  });

  // ruteo.002 — dos tokens distintos ⇒ dos juegos de credenciales distintos
  it("no cruza credenciales entre tenants: token B usa las de B", async () => {
    const { enrutar, configs } = enrutadorConCaptura();

    await (await enrutar("tok-A"))!.getStatus("tok-A");
    await (await enrutar("tok-B"))!.getStatus("tok-B");

    expect(configs[0]!.secretKey).toBe("secret-A");
    expect(configs[1]!.secretKey).toBe("secret-B");
    expect(configs[0]!.secretKey).not.toBe(configs[1]!.secretKey);
  });

  // ruteo.003 — token desconocido ⇒ null (notificación ajena; ack+ignore en el núcleo)
  it("devuelve null si ningún Payment matchea el token (no instancia ningún service)", async () => {
    const { enrutar, configs } = enrutadorConCaptura();
    const ruteo = await enrutar("tok-desconocido");
    expect(ruteo).toBeNull();
    expect(configs).toHaveLength(0); // no se descifró ni instanció nada
  });

  // ruteo.004 — I5: los secretos jamás aparecen en logs durante el ruteo
  it("nunca loguea los secretos del tenant (ni cifrados ni en claro)", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
    ];

    const { enrutar } = enrutadorConCaptura();
    const ruteo = await enrutar("tok-A");
    await ruteo!.getStatus("tok-A");

    const todoLoLogueado = spies
      .flatMap((s) => s.mock.calls)
      .flat()
      .map((a) => String(a))
      .join(" ");
    expect(todoLoLogueado).not.toContain("secret-A");
    expect(todoLoLogueado).not.toContain("apikey-A");
    expect(todoLoLogueado).not.toContain(TENANT_A.secretKeyCifrada);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
