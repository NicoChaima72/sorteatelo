import { describe, expect, it } from "vitest";

import { type Session } from "next-auth";

import {
  emailEnLista,
  esOperador,
  parsearAllowlist,
  resolverGuard,
  resolverTenantAutorizado,
} from "~/server/authPolicy";
import { DomainError, type DomainErrorCode } from "~/server/domain/errors";

/**
 * Corre `fn` esperando un `DomainError` y devuelve su `code`. Evita pasarle a
 * `toThrowError` el matcher `expect.objectContaining(...)`, tipado `any` (dispara
 * `@typescript-eslint/no-unsafe-argument`), y de paso aserta que lo lanzado ES un
 * `DomainError` con el code exacto. Falla explícito si no lanza o lanza otro error.
 */
function codeDeErrorLanzado(fn: () => unknown): DomainErrorCode {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  throw new Error("Se esperaba un DomainError pero la función no lanzó");
}

describe("authPolicy.parsearAllowlist", () => {
  it("normaliza a lowercase + trim y descarta entradas vacías", () => {
    expect(parsearAllowlist("A@Gmail.com, b@x.cl")).toEqual([
      "a@gmail.com",
      "b@x.cl",
    ]);
  });

  it("devuelve lista vacía para string vacío, solo-espacios o solo-comas", () => {
    expect(parsearAllowlist("")).toEqual([]);
    expect(parsearAllowlist("   ")).toEqual([]);
    expect(parsearAllowlist(" , , ,")).toEqual([]);
    expect(parsearAllowlist(undefined)).toEqual([]);
    expect(parsearAllowlist(null)).toEqual([]);
  });
});

describe("authPolicy.emailEnLista", () => {
  const lista = ["autora@gmail.com", "b@x.cl"];

  it("devuelve true para un email presente, ignorando mayúsculas y espacios", () => {
    expect(emailEnLista("  Autora@Gmail.com ", lista)).toBe(true);
  });

  it("devuelve false para un email ausente de la lista", () => {
    expect(emailEnLista("intruso@gmail.com", lista)).toBe(false);
  });

  it("devuelve false para email undefined/null/vacío (fail-closed)", () => {
    expect(emailEnLista(undefined, lista)).toBe(false);
    expect(emailEnLista(null, lista)).toBe(false);
    expect(emailEnLista("", lista)).toBe(false);
    expect(emailEnLista("   ", lista)).toBe(false);
  });

  it("con allowlist vacía devuelve false para cualquier email (fail-closed)", () => {
    expect(emailEnLista("autora@gmail.com", [])).toBe(false);
  });
});

describe("authPolicy.esOperador", () => {
  // F05: el Operador de plataforma se designa por env var PLATFORM_OPERATOR_EMAILS (D4).
  // Reusa la política pura (parsearAllowlist + emailEnLista), fail-closed.
  it("es true para un email presente en la lista de operadores", () => {
    expect(esOperador("op@x.cl", parsearAllowlist("op@x.cl,otra@x.cl"))).toBe(
      true,
    );
  });

  it("normaliza case y espacios al comparar", () => {
    expect(esOperador("  OP@X.cl ", parsearAllowlist("op@x.cl"))).toBe(true);
  });

  it("con var ausente/vacía nadie es Operador (fail-closed)", () => {
    expect(esOperador("op@x.cl", parsearAllowlist(undefined))).toBe(false);
    expect(esOperador("op@x.cl", parsearAllowlist(""))).toBe(false);
    expect(esOperador("op@x.cl", parsearAllowlist("   "))).toBe(false);
  });

  it("es false para un email ausente de la lista, y para email vacío", () => {
    expect(esOperador("intruso@x.cl", parsearAllowlist("op@x.cl"))).toBe(false);
    expect(esOperador(undefined, parsearAllowlist("op@x.cl"))).toBe(false);
  });
});

describe("authPolicy.resolverTenantAutorizado", () => {
  // F05/D5: la AUTORIZACIÓN sale de la membresía o del flag Operador (server-side); el
  // input solo SELECCIONA (y solo para el Operador). Un tenantId ajeno JAMÁS autoriza (I1).

  it("Organizador con membresía y sin selección resuelve SU tenant", () => {
    expect(
      resolverTenantAutorizado({
        esOperador: false,
        tenantIdsDeMembresia: ["A"],
        tenantIdSolicitado: null,
      }),
    ).toBe("A");
  });

  it("Organizador que solicita SU propio tenant lo resuelve", () => {
    expect(
      resolverTenantAutorizado({
        esOperador: false,
        tenantIdsDeMembresia: ["A", "B"],
        tenantIdSolicitado: "B",
      }),
    ).toBe("B");
  });

  it("Organizador que solicita un tenant AJENO ⇒ FORBIDDEN (el input no autoriza)", () => {
    expect(
      codeDeErrorLanzado(() =>
        resolverTenantAutorizado({
          esOperador: false,
          tenantIdsDeMembresia: ["A"],
          tenantIdSolicitado: "Z",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("sesión sin membresía y sin rol Operador ⇒ FORBIDDEN (fail-closed)", () => {
    expect(
      codeDeErrorLanzado(() =>
        resolverTenantAutorizado({
          esOperador: false,
          tenantIdsDeMembresia: [],
          tenantIdSolicitado: null,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("Operador con selección explícita resuelve ese tenant (aunque no sea membresía suya)", () => {
    expect(
      resolverTenantAutorizado({
        esOperador: true,
        tenantIdsDeMembresia: [],
        tenantIdSolicitado: "X",
      }),
    ).toBe("X");
  });

  it("Operador sin selección y sin membresía propia ⇒ error claro, nunca un tenant por defecto", () => {
    expect(
      codeDeErrorLanzado(() =>
        resolverTenantAutorizado({
          esOperador: true,
          tenantIdsDeMembresia: [],
          tenantIdSolicitado: null,
        }),
      ),
    ).toBe("INVALID");
  });

  it("Operador con membresía propia y sin selección cae a SU tenant (S8: la primera)", () => {
    expect(
      resolverTenantAutorizado({
        esOperador: true,
        tenantIdsDeMembresia: ["A"],
        tenantIdSolicitado: null,
      }),
    ).toBe("A");
  });
});

describe("authPolicy.resolverGuard", () => {
  it("sin sesión devuelve redirect a /login (permanent: false)", () => {
    expect(resolverGuard(null)).toEqual({
      redirect: { destination: "/login", permanent: false },
    });
  });

  it("con sesión válida expone la sesión (rama de props, sin redirect)", () => {
    const session: Session = {
      user: { id: "u1", email: "autora@gmail.com" },
      expires: "2099-01-01T00:00:00.000Z",
    };
    expect(resolverGuard(session)).toEqual({ session });
  });
});
