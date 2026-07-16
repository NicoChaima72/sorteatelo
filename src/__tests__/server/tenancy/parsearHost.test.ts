import { describe, expect, it } from "vitest";

import { parsearHost } from "~/server/tenancy/parsearHost";

/**
 * Dominio raíz de fixture. Deliberadamente `.test` (TLD reservado, RFC 2606):
 * el dominio real de la plataforma es la **decisión abierta #4** y el parser es
 * genérico sobre el dominio raíz inyectado — ningún test presume cuál será.
 */
const PLATAFORMA = { dominioRaiz: "plataforma.test" };

/** Dev multi-tenant vía `*.localhost` (supuesto S1 del roadmap). */
const DEV = { dominioRaiz: "localhost" };

describe("parsearHost — subdominio de tienda", () => {
  it("resuelve `a.dominio` a la zona tenant con slug `a`", () => {
    expect(parsearHost("a.plataforma.test", PLATAFORMA)).toEqual({
      zona: "tenant",
      slug: "a",
    });
  });

  it("resuelve `a.localhost:3000` a slug `a` en dev, stripeando el puerto (S1)", () => {
    expect(parsearHost("a.localhost:3000", DEV)).toEqual({
      zona: "tenant",
      slug: "a",
    });
  });

  it("stripea el puerto también en el dominio de producción", () => {
    expect(parsearHost("a.plataforma.test:8080", PLATAFORMA)).toEqual({
      zona: "tenant",
      slug: "a",
    });
  });
});

describe("parsearHost — zona plataforma (sin tenant)", () => {
  it("el apex es zona plataforma, no una tienda (S4)", () => {
    expect(parsearHost("plataforma.test", PLATAFORMA)).toEqual({
      zona: "plataforma",
    });
  });

  it("`www` es zona plataforma, no un tenant con slug `www`", () => {
    expect(parsearHost("www.plataforma.test", PLATAFORMA)).toEqual({
      zona: "plataforma",
    });
  });

  it("el apex de dev (`localhost:3000`) es zona plataforma", () => {
    expect(parsearHost("localhost:3000", DEV)).toEqual({ zona: "plataforma" });
  });
});

describe("parsearHost — fail-closed (no resuelve tenant)", () => {
  it("no resuelve un subdominio anidado (`x.y.dominio`)", () => {
    expect(parsearHost("x.y.plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("x.y.localhost:3000", DEV)).toBeNull();
  });

  it("no resuelve host vacío, undefined, null ni solo-espacios", () => {
    expect(parsearHost("", PLATAFORMA)).toBeNull();
    expect(parsearHost(undefined, PLATAFORMA)).toBeNull();
    expect(parsearHost(null, PLATAFORMA)).toBeNull();
    expect(parsearHost("   ", PLATAFORMA)).toBeNull();
  });

  it("no resuelve un host ajeno al dominio raíz de la plataforma", () => {
    expect(parsearHost("otra-cosa.cl", PLATAFORMA)).toBeNull();
    expect(parsearHost("a.otra-cosa.cl", PLATAFORMA)).toBeNull();
    // El sufijo debe cerrar en un límite de label: `malaplataforma.test`
    // NO cuelga de `plataforma.test` aunque el string termine igual.
    expect(parsearHost("malaplataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("127.0.0.1:3000", DEV)).toBeNull();
    expect(parsearHost("[::1]:3000", DEV)).toBeNull();
  });

  it("no resuelve un slug con forma inválida (no es un label DNS)", () => {
    // Prefijo vacío (`.dominio`), guion al borde, caracteres fuera de [a-z0-9-],
    // y un label de más de 63 chars (límite DNS).
    expect(parsearHost(".plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("-a.plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("a-.plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("a_b.plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("a b.plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost("ä.plataforma.test", PLATAFORMA)).toBeNull();
    expect(parsearHost(`${"a".repeat(64)}.plataforma.test`, PLATAFORMA)).toBeNull();
  });

  it("acepta slugs válidos: alfanuméricos con guion interior y 63 chars", () => {
    expect(parsearHost("tienda-de-la-autora.plataforma.test", PLATAFORMA)).toEqual({
      zona: "tenant",
      slug: "tienda-de-la-autora",
    });
    expect(parsearHost("a1.plataforma.test", PLATAFORMA)).toEqual({
      zona: "tenant",
      slug: "a1",
    });
    expect(parsearHost(`${"a".repeat(63)}.plataforma.test`, PLATAFORMA)).toEqual({
      zona: "tenant",
      slug: "a".repeat(63),
    });
  });
});
