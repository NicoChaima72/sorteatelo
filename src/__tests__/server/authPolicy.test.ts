import { describe, expect, it } from "vitest";

import { type Session } from "next-auth";

import {
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

describe("authPolicy.resolverTenantAutorizado", () => {
  // La AUTORIZACIÓN sale EXCLUSIVAMENTE de la membresía (server-side); el input solo
  // SELECCIONA entre lo ya autorizado. Un tenantId ajeno JAMÁS autoriza (I1). Desde el retiro
  // del rol Operador de plataforma no queda ninguna rama que autorice por fuera de la membresía.

  it("Organizador con membresía y sin selección resuelve SU tenant", () => {
    expect(
      resolverTenantAutorizado({
        tenantIdsDeMembresia: ["A"],
        tenantIdSolicitado: null,
      }),
    ).toBe("A");
  });

  it("Organizador que solicita SU propio tenant lo resuelve", () => {
    expect(
      resolverTenantAutorizado({
        tenantIdsDeMembresia: ["A", "B"],
        tenantIdSolicitado: "B",
      }),
    ).toBe("B");
  });

  it("Organizador que solicita un tenant AJENO ⇒ FORBIDDEN (el input no autoriza)", () => {
    expect(
      codeDeErrorLanzado(() =>
        resolverTenantAutorizado({
          tenantIdsDeMembresia: ["A"],
          tenantIdSolicitado: "Z",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("sesión sin membresía ⇒ FORBIDDEN (fail-closed)", () => {
    expect(
      codeDeErrorLanzado(() =>
        resolverTenantAutorizado({
          tenantIdsDeMembresia: [],
          tenantIdSolicitado: null,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  // Guard de regresión (I5): NO existe god-mode. Antes, un `esOperador: true` hacía que una
  // selección FUERA de la membresía se resolviera igual, y que la ausencia de membresía diera
  // `INVALID` ("indica sobre qué Tienda operar") en vez de negar. Las dos ramas murieron: un flag
  // de rol heredado en el input no cambia NADA, porque la única fuente es `tenantIdsDeMembresia`.
  //
  // NO BORRAR EL CAST: con la firma actual la propiedad extra es inerte — ese es el punto. Solo se
  // pone rojo el día que alguien reintroduzca un `esOperador` que autorice.
  it("un flag de rol heredado en el input no autoriza nada: selección ajena ⇒ FORBIDDEN", () => {
    const conFlagHeredado = {
      esOperador: true,
      tenantIdsDeMembresia: [],
      tenantIdSolicitado: "X",
    } as Parameters<typeof resolverTenantAutorizado>[0];
    expect(codeDeErrorLanzado(() => resolverTenantAutorizado(conFlagHeredado))).toBe(
      "FORBIDDEN",
    );

    // Y sin selección tampoco hay "indica sobre qué Tienda operar": sin membresía se NIEGA.
    const sinSeleccion = {
      esOperador: true,
      tenantIdsDeMembresia: [],
      tenantIdSolicitado: null,
    } as Parameters<typeof resolverTenantAutorizado>[0];
    expect(codeDeErrorLanzado(() => resolverTenantAutorizado(sinSeleccion))).toBe("FORBIDDEN");
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
