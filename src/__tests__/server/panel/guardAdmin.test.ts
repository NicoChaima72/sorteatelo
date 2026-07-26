import { describe, expect, it } from "vitest";

import {
  decidirAccesoAdmin,
  origenDeHostAdmin,
  type EntradaAdmin,
} from "~/server/panel/guardAdmin";

/**
 * Tests de la DECISIÓN PURA del guard del panel admin (admin-multi-tienda F02/D2, ADR-0022).
 *
 * Es la matriz de acceso a `<tienda>.<apex>/admin`: quién entra, quién rebota y adónde. Pura —
 * sin DB, sin NextAuth, sin request real: recibe la zona del host (ya resuelta server-side), si
 * hay sesión y las membresías en orden canónico, y devuelve un resultado discriminado que el
 * `getServerSideProps` traduce a `redirect`/`notFound`/`props`.
 *
 * I4: un logueado NO miembro jamás recibe chrome del admin de una tienda ajena — rebota al
 * storefront ANTES de que se renderice nada del panel.
 *
 * D11 (2026-07-25): el rol **Operador de plataforma NO es excepción** — el panel de Organizador es
 * por membresía y nada más. Por eso la entrada del guard ya ni siquiera TIENE un flag Operador: la
 * excepción no se puede reintroducir por descuido. La red equivalente en la capa de datos (un
 * `AccesoPanel` con `esOperador: true` sobre un host ajeno ⇒ `FORBIDDEN`) vive en
 * `tenantDelHost.test.ts::panel.host.003`.
 */

const ORIGEN = { protocolo: "https:", apex: "sorteatelo.cl" };

/** Entrada base: subdominio de la tienda `T-autora` (`autora.sorteatelo.cl/admin`), sin sesión. */
function entrada(over: Partial<EntradaAdmin> = {}): EntradaAdmin {
  return {
    zona: { tipo: "tienda", tenantId: "T-autora", slug: "autora" },
    haySesion: false,
    membresias: [],
    ruta: "/admin",
    origen: ORIGEN,
    ...over,
  };
}

describe("panel/guardAdmin — matriz de acceso (pura)", () => {
  // panel.guard.001 — sin sesión en el subdominio ⇒ login del apex con callbackUrl de vuelta
  it("sin sesión redirige al login del apex con callbackUrl de vuelta al subdominio", () => {
    expect(decidirAccesoAdmin(entrada({ ruta: "/admin/productos" }))).toEqual({
      tipo: "redirect",
      destino:
        "https://sorteatelo.cl/login?callbackUrl=" +
        encodeURIComponent("https://autora.sorteatelo.cl/admin/productos"),
    });
  });

  // panel.guard.002 — miembro de la tienda del host ⇒ panel con ESE tenant activo
  it("miembro de la tienda del host entra al panel con ese tenant activo", () => {
    const decision = decidirAccesoAdmin(
      entrada({
        haySesion: true,
        // La membresía de OTRA tienda va primera en el orden canónico: si el guard cayera al
        // viejo `tenantIds[0]` en vez de mirar el host, activaría la tienda equivocada.
        membresias: [
          { tenantId: "T-otra", slug: "otra" },
          { tenantId: "T-autora", slug: "autora" },
        ],
      }),
    );
    expect(decision).toEqual({
      tipo: "panel",
      tenantId: "T-autora",
      slug: "autora",
    });
  });

  // panel.guard.003 — CUALQUIER logueado sin membresía en la tienda del host —incluido el Operador
  // de plataforma (D11)— ⇒ storefront `/` del mismo subdominio (I4)
  it("logueado sin membresía rebota al storefront del mismo subdominio, sin chrome de admin", () => {
    const decision = decidirAccesoAdmin(
      entrada({
        haySesion: true,
        membresias: [{ tenantId: "T-otra", slug: "otra" }],
      }),
    );
    expect(decision).toEqual({ tipo: "redirect", destino: "/" });
  });

  // panel.guard.004 — D11: NADIE entra sin membresía. Es el caso del Operador de plataforma, que
  // antes tenía puerta de servicio a cualquier tienda: ahora la decisión depende solo de (zona,
  // sesión, membresías) y su rol ni siquiera llega al guard (`EntradaAdmin` no lo declara).
  it("sin ninguna membresía tampoco entra al panel del subdominio: rebota al storefront", () => {
    expect(decidirAccesoAdmin(entrada({ haySesion: true, membresias: [] }))).toEqual({
      tipo: "redirect",
      destino: "/",
    });
  });

  // panel.guard.005 — host que no resuelve a tienda ⇒ 404 neutral, con y sin sesión
  it("un host que no resuelve a una tienda da 404 neutral, haya sesión o no", () => {
    expect(decidirAccesoAdmin(entrada({ zona: { tipo: "sin-tienda" } }))).toEqual(
      { tipo: "no-encontrado" },
    );
    expect(
      decidirAccesoAdmin(
        entrada({
          zona: { tipo: "sin-tienda" },
          haySesion: true,
          membresias: [{ tenantId: "T-autora", slug: "autora" }],
        }),
      ),
    ).toEqual({ tipo: "no-encontrado" });
  });
});

describe("panel/guardAdmin — el apex es una puerta (D1/D8)", () => {
  /** Entrada base en el APEX (`sorteatelo.cl/admin`). */
  const enApex = (over: Partial<EntradaAdmin> = {}): EntradaAdmin =>
    entrada({ zona: { tipo: "apex" }, ...over });

  // panel.apex.001 — con membresías redirige a la PRIMERA tienda del orden canónico
  it("con membresías redirige al panel de la primera tienda", () => {
    expect(
      decidirAccesoAdmin(
        enApex({
          haySesion: true,
          membresias: [
            { tenantId: "T-primera", slug: "primera" },
            { tenantId: "T-segunda", slug: "segunda" },
          ],
        }),
      ),
    ).toEqual({
      tipo: "redirect",
      destino: "https://primera.sorteatelo.cl/admin",
    });
  });

  // panel.apex.002 — PRESERVA la subruta (D8): un bookmark viejo no se pierde
  it("preserva la subruta del bookmark al redirigir a la tienda", () => {
    expect(
      decidirAccesoAdmin(
        enApex({
          haySesion: true,
          ruta: "/admin/productos",
          membresias: [{ tenantId: "T-primera", slug: "primera" }],
        }),
      ),
    ).toEqual({
      tipo: "redirect",
      destino: "https://primera.sorteatelo.cl/admin/productos",
    });
  });

  // panel.apex.003 — sin membresía se queda en el apex: empty state / alta de tienda
  it("sin membresía se queda en el apex con el alta de tienda", () => {
    expect(decidirAccesoAdmin(enApex({ haySesion: true }))).toEqual({
      tipo: "alta",
    });
  });

  // panel.apex.004 — sin sesión al login del MISMO host, con la ruta preservada en el callback
  it("sin sesión manda al login del apex preservando la ruta pedida", () => {
    expect(decidirAccesoAdmin(enApex({ ruta: "/admin/ventas" }))).toEqual({
      tipo: "redirect",
      destino: `/login?callbackUrl=${encodeURIComponent("/admin/ventas")}`,
    });
  });

  // panel.apex.005 — en dev (lvh.me:3001) el destino conserva puerto y protocolo http
  it("en dev construye el destino con puerto y http", () => {
    expect(
      decidirAccesoAdmin(
        enApex({
          haySesion: true,
          membresias: [{ tenantId: "T-primera", slug: "primera" }],
          origen: { protocolo: "http:", apex: "lvh.me", puerto: "3001" },
        }),
      ),
    ).toEqual({
      tipo: "redirect",
      destino: "http://primera.lvh.me:3001/admin",
    });
  });
});

describe("panel/guardAdmin — origen del request (puro)", () => {
  // panel.guard.006 — el apex sale de la config, el puerto del host; dev es http
  it("deriva apex de la config y puerto del host, con http en dev (localhost y lvh.me)", () => {
    expect(
      origenDeHostAdmin({ host: "autora.lvh.me:3001", dominioRaiz: "lvh.me" }),
    ).toEqual({ protocolo: "http:", apex: "lvh.me", puerto: "3001" });

    expect(
      origenDeHostAdmin({ host: "localhost:3001", dominioRaiz: "localhost" }),
    ).toEqual({ protocolo: "http:", apex: "localhost", puerto: "3001" });
  });

  // panel.guard.007 — prod: sin puerto, https, y el apex NO se contagia del subdominio
  it("en producción usa https, sin puerto, y el apex nunca incluye el subdominio", () => {
    expect(
      origenDeHostAdmin({
        host: "autora.sorteatelo.cl",
        dominioRaiz: "sorteatelo.cl",
      }),
    ).toEqual({ protocolo: "https:", apex: "sorteatelo.cl", puerto: undefined });
  });

  // panel.guard.008 — con proxy delante manda `x-forwarded-proto` (túnel cloudflared en dev)
  it("respeta x-forwarded-proto cuando hay proxy delante", () => {
    expect(
      origenDeHostAdmin({
        host: "autora.lvh.me:3001",
        forwardedProto: "https,http",
        dominioRaiz: "lvh.me",
      }),
    ).toEqual({ protocolo: "https:", apex: "lvh.me", puerto: "3001" });
  });
});
