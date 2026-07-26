import { describe, expect, it } from "vitest";

import {
  derivarUrlCallback,
  RUTA_WEBHOOK_SUSCRIPCIONES,
} from "~/server/domain/facturacion/_urlWebhook";

/**
 * Tests de la derivación del `urlCallback` de los planes de Flow (F02). Núcleo puro compartido por
 * el cableado de la app y el script CLI: si las dos copias divergieran, el script registraría en
 * Flow una URL distinta de la que la app cree tener, y eso solo se nota cuando un cobro real no
 * notifica.
 */

describe("domain/facturacion/derivarUrlCallback", () => {
  // facturacion.webhookUrl.001 — la env var explícita gana (el túnel público de dev)
  it("prefiere la URL explícita sobre cualquier base derivada", () => {
    expect(
      derivarUrlCallback({
        explicita: "https://tunel.trycloudflare.com/api/webhooks/flow-suscripciones",
        appUrl: "http://localhost:3001",
      }),
    ).toBe("https://tunel.trycloudflare.com/api/webhooks/flow-suscripciones");
  });

  // facturacion.webhookUrl.002 — sin explícita, deriva de APP_URL y si no de NEXTAUTH_URL
  it("deriva de APP_URL, y cae a NEXTAUTH_URL cuando no está", () => {
    expect(derivarUrlCallback({ appUrl: "https://sorteatelo.cl" })).toBe(
      `https://sorteatelo.cl${RUTA_WEBHOOK_SUSCRIPCIONES}`,
    );
    expect(
      derivarUrlCallback({ nextAuthUrl: "https://sorteatelo.cl" }),
    ).toBe(`https://sorteatelo.cl${RUTA_WEBHOOK_SUSCRIPCIONES}`);
  });

  // facturacion.webhookUrl.003 — la barra final de la base no duplica la del path
  it("no duplica la barra cuando la base termina en /", () => {
    expect(derivarUrlCallback({ appUrl: "https://sorteatelo.cl/" })).toBe(
      `https://sorteatelo.cl${RUTA_WEBHOOK_SUSCRIPCIONES}`,
    );
  });

  // facturacion.webhookUrl.004 — sin base utilizable devuelve null (el caller falla diciendo qué falta)
  it("devuelve null sin ninguna base utilizable, en vez de una URL rota", () => {
    expect(derivarUrlCallback({})).toBeNull();
    expect(derivarUrlCallback({ appUrl: "" })).toBeNull();
    expect(derivarUrlCallback({ appUrl: "no-es-una-url" })).toBeNull();
  });
});
