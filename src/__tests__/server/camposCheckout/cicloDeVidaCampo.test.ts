import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { borrarCampoCheckout } from "~/server/domain/camposCheckout/borrarCampoCheckout";
import { cambiarActivoCampoCheckout } from "~/server/domain/camposCheckout/cambiarActivoCampoCheckout";
import { reordenarCamposCheckout } from "~/server/domain/camposCheckout/reordenarCamposCheckout";

/**
 * Tests del ciclo de vida de un Campo de checkout (F02/D5/D6): desactivar (reversible), reactivar
 * (recuenta el límite de 10 activos DENTRO de la $tx, D6/I6), borrar (hard delete — las respuestas
 * le sobreviven autocontenidas por el SetNull, fijado DB-backed en `checkout.schema.002`) y
 * reordenar (el cliente manda el orden completo; el server asigna `posicion = índice`).
 *
 * Todo tenant-scopeado por la membresía del acceso (I1): lo ajeno es NOT_FOUND.
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
  activo: boolean;
}

function fakeDb(filas: Fila[] = []) {
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> =
    [];
  const borrados: Array<Record<string, unknown>> = [];

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
        return f ? { id: f.id, activo: f.activo } : null;
      },
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        filas
          .filter((x) => x.tenantId === where.tenantId)
          .map((x) => ({ id: x.id, activo: x.activo })),
      count: async ({ where }: { where: { tenantId: string; activo: boolean } }) =>
        filas.filter((x) => x.tenantId === where.tenantId && x.activo === where.activo)
          .length,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        updates.push({ where, data });
        return { count: 1 };
      },
      deleteMany: async ({
        where,
      }: {
        where: { id: string; tenantId: string };
      }) => {
        const count = filas.filter(
          (x) => x.id === where.id && x.tenantId === where.tenantId,
        ).length;
        if (count > 0) borrados.push(where);
        return { count };
      },
    },
  };

  // `checkoutField` cuelga TAMBIÉN del `db` raíz: `borrarCampoCheckout` es una sola sentencia
  // (`deleteMany` ya es atómica) y por eso NO abre una $transaction — envolverla sería ceremonia.
  const db = {
    ...tx,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return { db, updates, borrados };
}

const ID = "ckcampo0000000000000000";
const diez = (tenantId = "t1"): Fila[] =>
  Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, tenantId, activo: true }));

describe("camposCheckout/cambiarActivoCampoCheckout", () => {
  // campos.activo.001 — desactivar es libre y reversible: saca el campo del checkout sin perder nada
  it("desactiva sin recontar el límite (desactivar siempre libera lugar)", async () => {
    const { db, updates } = fakeDb([
      ...diez(),
      { id: ID, tenantId: "t1", activo: true },
    ]);

    await cambiarActivoCampoCheckout({
      db,
      acceso: acceso(["t1"]),
      input: { campoId: ID, activo: false },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      where: { id: ID, tenantId: "t1" },
      data: { activo: false },
    });
  });

  // campos.activo.002 — reactivar el #11 choca con el límite D6/I6 (recontado en la $tx)
  it("rechaza reactivar cuando ya hay 10 campos activos", async () => {
    const { db, updates } = fakeDb([
      ...diez(),
      { id: ID, tenantId: "t1", activo: false },
    ]);

    await expect(
      cambiarActivoCampoCheckout({
        db,
        acceso: acceso(["t1"]),
        input: { campoId: ID, activo: true },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updates).toHaveLength(0);
  });

  // campos.activo.003 — con lugar disponible, reactivar pasa
  it("reactiva cuando queda lugar bajo el límite", async () => {
    const { db, updates } = fakeDb([
      ...diez().slice(0, 9),
      { id: ID, tenantId: "t1", activo: false },
    ]);

    await cambiarActivoCampoCheckout({
      db,
      acceso: acceso(["t1"]),
      input: { campoId: ID, activo: true },
    });

    expect(updates[0]).toMatchObject({ data: { activo: true } });
  });

  // campos.activo.004 — I1: campo de otro tenant ⇒ NOT_FOUND, sin efecto
  it("responde NOT_FOUND ante un campo de otro tenant", async () => {
    const { db, updates } = fakeDb([{ id: ID, tenantId: "t2", activo: false }]);

    await expect(
      cambiarActivoCampoCheckout({
        db,
        acceso: acceso(["t1"]),
        input: { campoId: ID, activo: true },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updates).toHaveLength(0);
  });
});

describe("camposCheckout/borrarCampoCheckout", () => {
  // campos.borrar.001 — hard delete SCOPEADO por tenant (D5): las respuestas sobreviven por SetNull
  it("borra el campo scopeando el delete por tenant", async () => {
    const { db, borrados } = fakeDb([{ id: ID, tenantId: "t1", activo: true }]);

    await borrarCampoCheckout({
      db,
      acceso: acceso(["t1"]),
      input: { campoId: ID },
    });

    expect(borrados).toEqual([{ id: ID, tenantId: "t1" }]);
  });

  // campos.borrar.002 — I1: no se puede borrar lo ajeno, ni enterarse de que existe
  it("responde NOT_FOUND ante un campo de otro tenant y no borra nada", async () => {
    const { db, borrados } = fakeDb([{ id: ID, tenantId: "t2", activo: true }]);

    await expect(
      borrarCampoCheckout({
        db,
        acceso: acceso(["t1"]),
        input: { campoId: ID },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(borrados).toHaveLength(0);
  });
});

describe("camposCheckout/reordenarCamposCheckout", () => {
  // campos.reordenar.001 — `posicion` = índice en la lista que mandó el cliente
  it("asigna la posición por el índice del orden recibido", async () => {
    const { db, updates } = fakeDb([
      { id: "a", tenantId: "t1", activo: true },
      { id: "b", tenantId: "t1", activo: true },
      { id: "c", tenantId: "t1", activo: false },
    ]);

    await reordenarCamposCheckout({
      db,
      acceso: acceso(["t1"]),
      input: { idsEnOrden: ["c", "a", "b"] },
    });

    expect(updates.map((u) => [u.where.id, u.data.posicion])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    // Cada update sigue scopeado por tenant (I1).
    expect(updates.every((u) => u.where.tenantId === "t1")).toBe(true);
  });

  // campos.reordenar.002 — I1: un id ajeno (o inexistente) invalida TODO el reordenamiento
  it("rechaza el reordenamiento si algún id no es del tenant y no aplica ninguna posición", async () => {
    const { db, updates } = fakeDb([
      { id: "a", tenantId: "t1", activo: true },
      { id: "ajeno", tenantId: "t2", activo: true },
    ]);

    await expect(
      reordenarCamposCheckout({
        db,
        acceso: acceso(["t1"]),
        input: { idsEnOrden: ["a", "ajeno"] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updates).toHaveLength(0);
  });

  // campos.reordenar.003 — el orden debe venir COMPLETO: una lista parcial dejaría posiciones
  //                        duplicadas contra los campos que quedaron fuera
  it("rechaza un orden que no incluye a todos los campos del tenant", async () => {
    const { db, updates } = fakeDb([
      { id: "a", tenantId: "t1", activo: true },
      { id: "b", tenantId: "t1", activo: true },
    ]);

    await expect(
      reordenarCamposCheckout({
        db,
        acceso: acceso(["t1"]),
        input: { idsEnOrden: ["a"] },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(updates).toHaveLength(0);
  });
});
