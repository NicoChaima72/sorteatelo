import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { firmarParams } from "~/server/services/flow";
import {
  crearFlowPlataformaService,
  type HttpGetPlataforma,
  type HttpPostPlataforma,
} from "~/server/services/flowPlataforma";

/**
 * Tests del service Flow de PLATAFORMA (F02, ADR-0026). Es el OTRO mundo del dinero: cobra la
 * mensualidad de Sortéatelo con la cuenta Flow PROPIA, cuyas credenciales viven SOLO en env (I7).
 * Comparte la primitiva de firma HMAC con el service BYO (`services/flow.ts`) pero jamás sus
 * credenciales (I1).
 */

const post = () => vi.fn<HttpPostPlataforma>().mockResolvedValue({});
const get = () => vi.fn<HttpGetPlataforma>().mockResolvedValue({});

describe("services/flowPlataforma — credenciales de plataforma", () => {
  // flowPlataforma.creds.001 — firma con la secretKey de PLATAFORMA y manda la apiKey de plataforma
  it("firma el payload con las credenciales de plataforma y pega en la baseUrl de la cuenta", async () => {
    const httpPost = post();
    const flow = crearFlowPlataformaService({
      apiKey: "plataforma-api-key",
      secretKey: "plataforma-secret-key",
      sandbox: true,
      httpPost,
      httpGet: get(),
    });

    await flow.crearPlan({
      planId: "sorteatelo-full",
      name: "Sortéatelo — plan tienda",
      amount: "25000",
      urlCallback: "https://sorteatelo.cl/api/webhooks/flow-suscripciones",
    });

    expect(httpPost).toHaveBeenCalledTimes(1);
    const [url, form] = httpPost.mock.calls[0]!;
    // **PLURAL**: `plan/create` responde `400 {"code":105,"message":"No services available"}`; los
    // endpoints que existen son `plans/create` / `plans/get` / `plans/list` / `plans/delete`
    // (verificado contra el sandbox, 3ª pasada del E2E). Los otros recursos SÍ van en singular
    // (`customer/*`, `subscription/*`, `coupon/*`, `invoice/*`): la API de Flow es inconsistente.
    expect(url).toBe("https://sandbox.flow.cl/api/plans/create");
    expect(form.apiKey).toBe("plataforma-api-key");
    expect(form.currency).toBe("CLP");
    // interval 3 = mensual en la API de Flow.
    expect(form.interval).toBe("3");

    // La firma es la del payload SIN `s`, con la secretKey de PLATAFORMA.
    const { s, ...params } = form;
    expect(s).toBe(firmarParams(params, "plataforma-secret-key"));
    // Y NO la de otra cuenta: una secretKey de tenant produciría otra firma.
    expect(s).not.toBe(firmarParams(params, "secret-de-un-tenant"));
  });

  // flowPlataforma.creds.002 — fail-fast sin credenciales, y el mensaje JAMÁS lleva el secreto (I7)
  it("falla fast si faltan las credenciales, sin volcar el secreto en el mensaje", async () => {
    const sinApiKey = crearFlowPlataformaService({
      apiKey: undefined,
      secretKey: "s3cr3t-de-plataforma",
      httpPost: post(),
      httpGet: get(),
    });
    await expect(sinApiKey.getPlan("sorteatelo-full")).rejects.toThrow(
      /FLOW_PLATAFORMA_API_KEY/,
    );
    await expect(sinApiKey.getPlan("sorteatelo-full")).rejects.not.toThrow(
      /s3cr3t-de-plataforma/,
    );

    const sinSecret = crearFlowPlataformaService({
      apiKey: "plataforma-api-key",
      secretKey: undefined,
      httpPost: post(),
      httpGet: get(),
    });
    await expect(sinSecret.getPlan("sorteatelo-full")).rejects.toThrow(
      /FLOW_PLATAFORMA_SECRET_KEY/,
    );
  });

  // flowPlataforma.creds.003 — el flag sandbox elige la baseUrl de la cuenta de la plataforma
  it("apunta a producción cuando sandbox es false", async () => {
    const httpGet = get();
    const flow = crearFlowPlataformaService({
      apiKey: "k",
      secretKey: "s",
      sandbox: false,
      httpPost: post(),
      httpGet,
    });

    await flow.getPlan("sorteatelo-full");
    expect(httpGet.mock.calls[0]![0]).toBe("https://www.flow.cl/api/plans/get");
  });
});

/**
 * **Contrato REAL de la API de Flow**, verificado contra el sandbox de la cuenta de plataforma en la
 * 3ª pasada del `feature-tester` (2026-07-26). Cada uno de estos tests existe porque el fake anterior
 * codificaba el contrato EQUIVOCADO y los 209 tests de facturación pasaban con la integración rota.
 * Son la línea que separa «mi fake dice que sí» de «Flow dice que sí».
 */
describe("services/flowPlataforma — contrato verificado contra el sandbox real", () => {
  // flowPlataforma.registro.001 — el redirect del registro de tarjeta VA CON el token
  it("devuelve la URL de registro con el token en la query, no la URL pelada", async () => {
    const httpPost = vi.fn<HttpPostPlataforma>().mockResolvedValue({
      url: "https://sandbox.flow.cl/app/customer/register",
      token: "TOK123abc",
    });
    const flow = crearFlowPlataformaService({
      apiKey: "k",
      secretKey: "s",
      httpPost,
      httpGet: get(),
    });

    const r = await flow.registrarTarjeta({
      customerId: "cus_1",
      urlReturn: "https://mi-tienda.sorteatelo.cl/api/facturacion/retorno-plan",
    });

    // Sin el `?token=`, Flow contesta «¡Ups! Ha ocurrido un error / Error Processing Request» y el
    // Pagador no llega nunca al formulario de tarjeta. El service BYO ya lo hace así (`flow.ts:144`).
    expect(r.redirectUrl).toBe(
      "https://sandbox.flow.cl/app/customer/register?token=TOK123abc",
    );
    expect(r.token).toBe("TOK123abc");
  });

  // flowPlataforma.cupon.001 — «para siempre» es duration 0 SIN times
  it("manda duration=0 y ningún times cuando el cupón no vence nunca", async () => {
    const httpPost = post();
    const flow = crearFlowPlataformaService({
      apiKey: "k",
      secretKey: "s",
      httpPost,
      httpGet: get(),
    });

    await flow.crearCupon({ name: "ARMY2026", percentOff: 50 });

    const [, form] = httpPost.mock.calls[0]!;
    // Verificado contra el sandbox: `duration=1` sin `times` ⇒ «If duration = 1 times must be sent».
    expect(form.duration).toBe("0");
    expect(form.times).toBeUndefined();
  });

  // flowPlataforma.cupon.002 — «N períodos» es duration 1 CON times
  it("manda duration=1 con times=N cuando el descuento dura N períodos", async () => {
    const httpPost = post();
    const flow = crearFlowPlataformaService({
      apiKey: "k",
      secretKey: "s",
      httpPost,
      httpGet: get(),
    });

    await flow.crearCupon({ name: "ARMY2026", percentOff: 50, duracionPeriodos: 3 });

    const [, form] = httpPost.mock.calls[0]!;
    // Verificado contra el sandbox: `duration=2` ⇒ «The duration must be 0 or 1».
    expect(form.duration).toBe("1");
    expect(form.times).toBe("3");
  });

  // flowPlataforma.registro.002 — una respuesta incompleta NO manda al Pagador a una pantalla rota
  it("falla fast si Flow no devuelve url o token, en vez de armar una URL inservible", async () => {
    for (const respuesta of [
      { url: "https://sandbox.flow.cl/app/customer/register" },
      { token: "TOK123abc" },
    ]) {
      const flow = crearFlowPlataformaService({
        apiKey: "k",
        secretKey: "s",
        httpPost: vi.fn<HttpPostPlataforma>().mockResolvedValue(respuesta),
        httpGet: get(),
      });
      await expect(
        flow.registrarTarjeta({ customerId: "cus_1", urlReturn: "https://x/r" }),
      ).rejects.toThrow(/customer\/register/);
    }
  });
});

/**
 * Guards de regresión de **I1 (mundos separados)**. Son tests que leen el CÓDIGO, no el
 * comportamiento: la garantía «por construcción» de I1 no la puede dar el sistema de tipos (una
 * `apiKey` de tenant y una de plataforma son dos `string`), así que la sostiene el hecho de que
 * (a) el service de plataforma no conoce el mundo BYO y (b) en la app hay UN SOLO productor.
 * Mismo espíritu que los guards de `authPolicy.test.ts` contra reintroducir un bypass de rol.
 */
describe("services/flowPlataforma — I1: mundos separados (guards de regresión)", () => {
  const fuente = readFileSync(
    new URL("../../../server/services/flowPlataforma.ts", import.meta.url),
    "utf8",
  );

  // flowPlataforma.i1.001 — el service de plataforma no conoce el mundo BYO de los tenants
  it("no importa NADA del mundo BYO: su única dependencia es la primitiva de firma", () => {
    // Los MÓDULOS que importa, no el texto del archivo (el docstring nombra a propósito lo
    // prohibido — un `toContain` crudo se pondría rojo por la documentación misma).
    const modulos = [...fuente.matchAll(/from\s+"([^"]+)"/g)]
      .map((m) => m[1]!)
      .sort();

    // Lo ÚNICO que comparte con el service BYO es la primitiva pública de firma HMAC y las dos
    // base URLs: el algoritmo de Flow es el mismo para cualquier cuenta; las CREDENCIALES jamás.
    expect(modulos).toEqual(["~/server/services/flow"]);

    // Y en particular, nada del mundo BYO ni de env/DB (I1/I7).
    for (const prohibido of [
      "flowDeTenant",
      "cifrado",
      "server/db",
      "~/env",
      "@prisma/client",
    ]) {
      expect(modulos.some((m) => m.includes(prohibido))).toBe(false);
    }
  });

  // flowPlataforma.i1.002 — un solo productor en la app: el borde de env. Nadie más lo construye.
  it("solo `facturacion/flowPlataformaDeEnv.ts` construye el service en toda la app", () => {
    const raiz = fileURLToPath(new URL("../../../", import.meta.url)); // src/
    const archivos = readdirSync(raiz, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) =>
        readFileSync(raiz + f, "utf8").includes("crearFlowPlataformaService"),
      )
      .map((f) => f.split("\\").join("/"))
      .sort();

    expect(archivos).toEqual([
      "__tests__/server/services/flowPlataforma.test.ts", // este mismo test
      "server/facturacion/flowPlataformaDeEnv.ts", // el ÚNICO productor de la app
      "server/services/flowPlataforma.ts", // la definición
    ]);
  });
});
