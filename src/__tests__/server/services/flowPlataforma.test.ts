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
    expect(url).toBe("https://sandbox.flow.cl/api/plan/create");
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
    expect(httpGet.mock.calls[0]![0]).toBe("https://www.flow.cl/api/plan/get");
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
