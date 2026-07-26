import { type CheckoutFieldType, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { editarCampoCheckout } from "~/server/domain/camposCheckout/editarCampoCheckout";
import { type EditarCampoCheckoutInput } from "~/server/domain/camposCheckout/schemas";

/**
 * Tests del use case `editarCampoCheckout` (F02/D5): la edición es COSMÉTICA. `clave` y `tipo` son
 * inmutables tras crear —no están en el input, así que son inalcanzables— y el efecto de lo que sí
 * se edita es solo HACIA ADELANTE: el snapshot de las compras ya hechas no se toca (I4).
 */

const acceso = (
  tenantIds: string[],
  /** Tienda del HOST del request (ADR-0022): es la que el panel administra. */
  tenantIdDelHost: string | null = tenantIds[0] ?? "t1",
): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds,
  tenantIdDelHost,
});

interface Fila {
  id: string;
  tenantId: string;
  clave: string;
  tipo: CheckoutFieldType;
}

function fakeDb(filas: Fila[] = []) {
  let actualizado: { where: Record<string, unknown>; data: Record<string, unknown> } | null =
    null;

  const tx = {
    checkoutField: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string };
      }) => {
        const f = filas.find(
          (x) => x.id === where.id && x.tenantId === where.tenantId,
        );
        return f ? { id: f.id, tipo: f.tipo, clave: f.clave } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        actualizado = { where, data };
        return { count: 1 };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return { db, getActualizado: () => actualizado };
}

const base: EditarCampoCheckoutInput = {
  campoId: "ckcampo0000000000000000",
  etiqueta: "Teléfono (WhatsApp)",
  obligatorio: true,
  placeholder: null,
  textoAyuda: null,
  opciones: [],
  defaultMarcado: false,
};

const filaTelefono: Fila = {
  id: "ckcampo0000000000000000",
  tenantId: "t1",
  clave: "telefono_de_contacto",
  tipo: "TELEFONO",
};

describe("camposCheckout/editarCampoCheckout", () => {
  // campos.editar.001 — los cosméticos se guardan; la clave NO viaja y la fila conserva la suya
  it("actualiza los campos cosméticos sin tocar clave ni tipo", async () => {
    const { db, getActualizado } = fakeDb([filaTelefono]);

    await editarCampoCheckout({
      db,
      acceso: acceso(["t1"]),
      input: { ...base, placeholder: "+56 9 ...", textoAyuda: "Te escribimos si ganas" },
    });

    const upd = getActualizado();
    expect(upd?.data).toEqual({
      etiqueta: "Teléfono (WhatsApp)",
      obligatorio: true,
      placeholder: "+56 9 ...",
      textoAyuda: "Te escribimos si ganas",
      opciones: [],
      defaultMarcado: false,
    });
    // Ni `clave` ni `tipo` aparecen en el update: son inmutables (D5) y no hay input que los traiga.
    expect(upd?.data).not.toHaveProperty("clave");
    expect(upd?.data).not.toHaveProperty("tipo");
    // El update sigue scopeado por tenant (defensa en profundidad, I1).
    expect(upd?.where).toMatchObject({ id: base.campoId, tenantId: "t1" });
  });

  // campos.editar.002 — I1: un campo de OTRO tenant es indistinguible de inexistente
  it("responde NOT_FOUND ante un campo de otro tenant", async () => {
    const { db, getActualizado } = fakeDb([{ ...filaTelefono, tenantId: "t2" }]);

    await expect(
      editarCampoCheckout({ db, acceso: acceso(["t1"]), input: base }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getActualizado()).toBeNull();
  });

  // campos.editar.003 — la validación que depende del tipo usa el tipo VIGENTE de la fila,
  //                     porque el input no lo trae: un SELECT no puede quedarse sin opciones
  it("rechaza dejar un SELECT sin opciones y normaliza las opciones de un tipo que no las usa", async () => {
    const select = fakeDb([{ ...filaTelefono, tipo: "SELECT", clave: "sucursal" }]);
    await expect(
      editarCampoCheckout({
        db: select.db,
        acceso: acceso(["t1"]),
        input: { ...base, opciones: [] },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(select.getActualizado()).toBeNull();

    // Y un TELEFONO al que le mandan opciones las ve normalizadas a [] (D4/D7, no rechazo).
    const telefono = fakeDb([filaTelefono]);
    await editarCampoCheckout({
      db: telefono.db,
      acceso: acceso(["t1"]),
      input: { ...base, opciones: ["ruido"] },
    });
    expect(telefono.getActualizado()?.data).toMatchObject({ opciones: [] });
  });

  // campos.editar.004 — D4/I5: un CHECKBOX nunca queda obligatorio, tampoco editándolo
  it("normaliza obligatorio a false al editar un CHECKBOX", async () => {
    const { db, getActualizado } = fakeDb([
      { ...filaTelefono, tipo: "CHECKBOX", clave: "novedades" },
    ]);

    await editarCampoCheckout({
      db,
      acceso: acceso(["t1"]),
      input: { ...base, obligatorio: true, defaultMarcado: true },
    });

    expect(getActualizado()?.data).toMatchObject({
      obligatorio: false,
      defaultMarcado: true,
    });
  });
});
