import { describe, expect, it } from "vitest";

import {
  apexDesdeHost,
  construirUrlApex,
  construirUrlSubdominio,
} from "~/lib/urlApex";

/**
 * Tests de los helpers de URL al apex (F09b, ADR-0019/D6): derivar el apex del host de un subdominio y
 * construir la URL absoluta al login/panel del apex con `callbackUrl` encodeado.
 */
describe("lib/urlApex — apexDesdeHost", () => {
  // page.apex.001 — quita el label del slug del host
  it("deriva el apex quitando el label del slug", () => {
    expect(apexDesdeHost("autora.sorteatelo.cl", "autora")).toBe("sorteatelo.cl");
    expect(apexDesdeHost("autora.lvh.me", "autora")).toBe("lvh.me");
    expect(apexDesdeHost("autora.localhost", "autora")).toBe("localhost");
  });

  // page.apex.002 — host que no empieza con el slug ⇒ devuelve el host tal cual (defensivo)
  it("si el host no empieza con el slug, devuelve el host tal cual", () => {
    expect(apexDesdeHost("sorteatelo.cl", "autora")).toBe("sorteatelo.cl");
  });
});

describe("lib/urlApex — construirUrlApex", () => {
  // page.apex.003 — arma la URL con puerto y callbackUrl encodeado
  it("arma la URL del login con puerto y callbackUrl encodeado", () => {
    expect(
      construirUrlApex({
        protocol: "http:",
        apex: "lvh.me",
        puerto: "3001",
        path: "/login",
        callbackUrl: "http://autora.lvh.me:3001/producto/123",
      }),
    ).toBe(
      "http://lvh.me:3001/login?callbackUrl=http%3A%2F%2Fautora.lvh.me%3A3001%2Fproducto%2F123",
    );
  });

  // page.apex.004 — sin puerto ni callbackUrl (prod, panel)
  it("arma la URL del panel sin puerto ni callbackUrl (prod)", () => {
    expect(
      construirUrlApex({ protocol: "https:", apex: "sorteatelo.cl", path: "/admin" }),
    ).toBe("https://sorteatelo.cl/admin");
  });
});

/**
 * URLs CRUZADAS entre tiendas (admin-multi-tienda F05, ADR-0022). Con el panel viviendo en
 * `<tienda>.<apex>`, todo enlace a otra tienda (switcher) o a la propia ("Ver mi tienda", editor)
 * tiene que colgar del APEX — no del host actual, que YA tiene un subdominio. Pegarle el slug al
 * host actual producía `<otra>.<tienda>.<apex>`: ese era el bug de `url-tienda.ts`.
 */
describe("lib/urlApex — construirUrlSubdominio (URLs cross-tienda)", () => {
  // page.subdominio.001 — desde el panel de una tienda, la URL de OTRA cuelga del apex
  it("desde <tienda>.<apex> construye la URL de otra tienda colgando del apex", () => {
    const apex = apexDesdeHost("autora.sorteatelo.cl", "autora");
    const url = construirUrlSubdominio({
      protocol: "https:",
      apex,
      slug: "prueba",
      path: "/admin",
    });
    expect(url).toBe("https://prueba.sorteatelo.cl/admin");
    // La forma rota que esta feature elimina.
    expect(url).not.toContain("prueba.autora");
  });

  // page.subdominio.002 — dev con puerto: lvh.me:3001 y localhost:3001 se comportan igual
  it("conserva el puerto en dev (lvh.me y localhost)", () => {
    expect(
      construirUrlSubdominio({
        protocol: "http:",
        apex: apexDesdeHost("autora.lvh.me", "autora"),
        puerto: "3001",
        slug: "prueba",
        path: "/admin",
      }),
    ).toBe("http://prueba.lvh.me:3001/admin");

    expect(
      construirUrlSubdominio({
        protocol: "http:",
        apex: apexDesdeHost("autora.localhost", "autora"),
        puerto: "3001",
        slug: "prueba",
        path: "/admin",
      }),
    ).toBe("http://prueba.localhost:3001/admin");
  });

  // page.subdominio.003 — la propia tienda: "Ver mi tienda" (raíz) y el editor
  it("arma la URL de la propia tienda para Ver mi tienda y el editor", () => {
    const apex = apexDesdeHost("autora.lvh.me", "autora");
    expect(
      construirUrlSubdominio({
        protocol: "http:",
        apex,
        puerto: "3001",
        slug: "autora",
        path: "",
      }),
    ).toBe("http://autora.lvh.me:3001");
    expect(
      construirUrlSubdominio({
        protocol: "http:",
        apex,
        puerto: "3001",
        slug: "autora",
        path: "/editor",
      }),
    ).toBe("http://autora.lvh.me:3001/editor");
  });
});
