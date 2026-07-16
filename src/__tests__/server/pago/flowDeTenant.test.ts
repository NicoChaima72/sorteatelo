import { randomBytes } from "crypto";

import { describe, expect, it, vi } from "vitest";

import { construirFlowDeCredencial } from "~/server/pago/flowDeTenant";
import { cifrar } from "~/server/services/cifrado";
import {
  crearFlowService,
  FLOW_PROD_BASE_URL,
  FLOW_SANDBOX_BASE_URL,
  firmarParams,
  type FlowConfig,
} from "~/server/services/flow";

/**
 * Tests del núcleo puro de instanciación por-tenant del service Flow (BYO-Flow, ADR-0006).
 * Cubren la parte de Carril C del ítem "El service Flow se instancia con las credenciales
 * del tenant" — con `cifrar` real (no fake) para probar el roundtrip descifrado→firma.
 */
describe("pago/flowDeTenant — construirFlowDeCredencial", () => {
  const clave = randomBytes(32);

  // flowDeTenant.001 — descifra la credencial y firma con la secretKey del tenant
  it("descifra la credencial y el service resultante firma con la secretKey del tenant", async () => {
    const credencial = {
      apiKeyCifrada: cifrar("apikey-tenant-real", clave),
      secretKeyCifrada: cifrar("secretkey-tenant-real", clave),
      sandbox: true,
    };

    // Captura la config que recibe la factory: prueba directa de qué credenciales se usan.
    const capturada: FlowConfig[] = [];
    const crearServicio = (config: FlowConfig) => {
      capturada.push(config);
      return crearFlowService(config);
    };

    const flow = construirFlowDeCredencial({ credencial, clave, crearServicio });

    // La factory recibió las credenciales DESCIFRADAS (nunca el ciphertext).
    expect(capturada[0]!.apiKey).toBe("apikey-tenant-real");
    expect(capturada[0]!.secretKey).toBe("secretkey-tenant-real");
    expect(capturada[0]!.baseUrl).toBe(FLOW_SANDBOX_BASE_URL);

    // Y firma de verdad con esa secretKey (getStatus, que no necesita urls).
    const httpGet = vi.fn().mockResolvedValue({ commerceOrder: "o1", status: 2 });
    const flow2 = construirFlowDeCredencial({
      credencial,
      clave,
      crearServicio: (config) => crearFlowService({ ...config, httpGet }),
    });
    await flow2.getStatus("tok-1");
    const query = httpGet.mock.calls[0]![1] as Record<string, string>;
    expect(query.s).toBe(
      firmarParams(
        { apiKey: "apikey-tenant-real", token: "tok-1" },
        "secretkey-tenant-real",
      ),
    );
    expect(flow).toBeDefined();
  });

  // flowDeTenant.002 — el flag sandbox rutea la baseUrl (ambiente por cuenta Flow)
  it("rutea la baseUrl a producción cuando la credencial NO es sandbox", () => {
    const credencial = {
      apiKeyCifrada: cifrar("k", clave),
      secretKeyCifrada: cifrar("s", clave),
      sandbox: false,
    };
    const capturada: FlowConfig[] = [];
    construirFlowDeCredencial({
      credencial,
      clave,
      crearServicio: (config) => {
        capturada.push(config);
        return crearFlowService(config);
      },
    });
    expect(capturada[0]!.baseUrl).toBe(FLOW_PROD_BASE_URL);
  });

  // flowDeTenant.003 — descifrar con clave incorrecta falla (integridad GCM), sin fuga
  it("falla al descifrar si la clave es incorrecta (no construye un service con basura)", () => {
    const credencial = {
      apiKeyCifrada: cifrar("k", clave),
      secretKeyCifrada: cifrar("s", clave),
      sandbox: true,
    };
    const claveMala = randomBytes(32);
    expect(() =>
      construirFlowDeCredencial({ credencial, clave: claveMala }),
    ).toThrow();
  });
});
