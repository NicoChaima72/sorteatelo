import { describe, expect, it } from "vitest";

import {
  HEADER_TENANT_SLUG,
  aplicarHeaderDeTenant,
} from "~/server/tenancy/headerTenant";

describe("aplicarHeaderDeTenant", () => {
  it("publica el slug resuelto del host en el header", () => {
    const salida = aplicarHeaderDeTenant(new Headers(), {
      zona: "tenant",
      slug: "autora",
    });

    expect(salida.get(HEADER_TENANT_SLUG)).toBe("autora");
  });

  it("PISA un header de tenant entrante: el valor es siempre del servidor", () => {
    // Lección H1 (datawalt-app): el tenant no puede venir del cliente. Si un
    // request llega con el header puesto a mano, el host manda igual.
    const entrantes = new Headers({ [HEADER_TENANT_SLUG]: "victima" });

    const salida = aplicarHeaderDeTenant(entrantes, {
      zona: "tenant",
      slug: "autora",
    });

    expect(salida.get(HEADER_TENANT_SLUG)).toBe("autora");
  });

  it("BORRA un header de tenant entrante en la zona plataforma", () => {
    const entrantes = new Headers({ [HEADER_TENANT_SLUG]: "victima" });

    const salida = aplicarHeaderDeTenant(entrantes, { zona: "plataforma" });

    expect(salida.has(HEADER_TENANT_SLUG)).toBe(false);
  });

  it("BORRA un header de tenant entrante cuando el host no resuelve (fail-closed)", () => {
    const entrantes = new Headers({ [HEADER_TENANT_SLUG]: "victima" });

    const salida = aplicarHeaderDeTenant(entrantes, null);

    expect(salida.has(HEADER_TENANT_SLUG)).toBe(false);
  });

  it("no pierde los demás headers del request", () => {
    const entrantes = new Headers({
      host: "autora.plataforma.test",
      "user-agent": "vitest",
    });

    const salida = aplicarHeaderDeTenant(entrantes, {
      zona: "tenant",
      slug: "autora",
    });

    expect(salida.get("host")).toBe("autora.plataforma.test");
    expect(salida.get("user-agent")).toBe("vitest");
  });

  it("no muta los headers entrantes (devuelve una copia)", () => {
    const entrantes = new Headers({ [HEADER_TENANT_SLUG]: "victima" });

    aplicarHeaderDeTenant(entrantes, { zona: "plataforma" });

    expect(entrantes.get(HEADER_TENANT_SLUG)).toBe("victima");
  });
});
