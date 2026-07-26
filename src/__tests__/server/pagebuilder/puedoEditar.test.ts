import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { debeMostrarBanner } from "~/lib/pagebuilder/banner";
import { puedoEditar } from "~/server/domain/pagebuilder/puedoEditar";

/**
 * Tests del banner "Editar mi tienda" (F09/D11, ADR-0019): la autorización `puedoEditar` (por
 * TenantMembership server-side, jamás input del cliente) y la decisión pura de mostrar el
 * banner SOLO post-hidratación (para que el HTML SSR anónimo sea idéntico con/sin cookie ⇒ cacheable).
 */

function fakeDb(membresias: { tenantId: string; userId: string }[]) {
  return {
    tenantMembership: {
      findFirst: async ({ where }: { where: { tenantId: string; userId: string } }) => {
        const m = membresias.find(
          (x) => x.tenantId === where.tenantId && x.userId === where.userId,
        );
        return m ? { id: "m1" } : null;
      },
    },
  } as unknown as PrismaClient;
}

describe("pagebuilder/puedoEditar (autorización server-side)", () => {
  // page.editar.001 — con membresía para (tenant, user) ⇒ puede editar
  it("con TenantMembership para (tenant, usuario) ⇒ puede editar", async () => {
    const db = fakeDb([{ tenantId: "t1", userId: "u1" }]);
    expect(await puedoEditar({ db, tenantId: "t1", userId: "u1" })).toEqual({
      puedeEditar: true,
    });
  });

  // page.editar.002 — sin membresía ⇒ NO puede editar
  it("sin membresía ⇒ no puede editar", async () => {
    const db = fakeDb([{ tenantId: "t1", userId: "u1" }]);
    // Otro usuario en la misma tienda.
    expect(await puedoEditar({ db, tenantId: "t1", userId: "ajeno" })).toEqual({
      puedeEditar: false,
    });
    // Mismo usuario, OTRA tienda (no puede editar la ajena) — I1: scopeado por tenantId.
    expect(await puedoEditar({ db, tenantId: "otra", userId: "u1" })).toEqual({
      puedeEditar: false,
    });
  });

  // page.editar.003 — NO existe god-mode: la membresía es la ÚNICA fuente de autorización (I5).
  // Guardia de regresión contra reintroducir un bypass por flag/rol: una propiedad extra en el
  // argumento no autoriza nada, porque la decisión sale exclusivamente de la capa de datos.
  //
  // NO BORRAR EL CAST: con la firma actual la propiedad extra es inerte, así que la 2ª aserción
  // hoy es redundante — ese ES el punto. Solo puede ponerse roja el día que alguien reintroduzca
  // un `esOperador?: boolean` con early-return. Si se "limpia" el cast por parecer ruido, el
  // guard desaparece en silencio. (El `fakeDb` cubre la otra vía: solo expone `tenantMembership`,
  // así que autorizar leyendo cualquier otra tabla explota acá mismo.)
  it("sin membresía no puede editar — ni siquiera con un flag de rol heredado en el input", async () => {
    const db = fakeDb([]); // sin membresías
    expect(await puedoEditar({ db, tenantId: "cualquiera", userId: "op" })).toEqual({
      puedeEditar: false,
    });

    const conFlagHeredado = {
      db,
      tenantId: "cualquiera",
      userId: "op",
      esOperador: true,
    } as Parameters<typeof puedoEditar>[0];
    expect(await puedoEditar(conFlagHeredado)).toEqual({ puedeEditar: false });
  });
});

describe("pagebuilder/debeMostrarBanner (post-hidratación, cache público)", () => {
  // page.editar.004 — en SSR/pre-hidratación (montado=false) el banner NUNCA aparece ⇒ HTML idéntico
  it("no muestra el banner antes de hidratar (montado=false), pase lo que pase con puedeEditar", () => {
    expect(debeMostrarBanner({ montado: false, puedeEditar: true })).toBe(false);
    expect(debeMostrarBanner({ montado: false, puedeEditar: false })).toBe(false);
  });

  // page.editar.005 — post-hidratación: solo si puede editar
  it("post-hidratación (montado=true): muestra solo si puede editar", () => {
    expect(debeMostrarBanner({ montado: true, puedeEditar: true })).toBe(true);
    expect(debeMostrarBanner({ montado: true, puedeEditar: false })).toBe(false);
  });
});
