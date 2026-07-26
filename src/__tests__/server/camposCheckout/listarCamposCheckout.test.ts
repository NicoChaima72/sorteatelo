import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarCamposCheckout } from "~/server/domain/camposCheckout/listarCamposCheckout";

/**
 * Tests del selector `listarCamposCheckout` (F02): la lista que ve el Organizador en su panel.
 * Trae ACTIVOS e INACTIVOS (los inactivos se administran: se reactivan o se borran) en el orden
 * en que se le muestran al Comprador, y SIEMPRE scopeada por la membresía del acceso (I1).
 */

const acceso = (
  tenantIds: string[],
  /** Tienda del HOST del request (ADR-0022): es la que el panel administra. */
  tenantIdDelHost: string | null = tenantIds[0] ?? "t1",
): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  tenantIdDelHost,
});

function fakeDb() {
  let consulta: Record<string, unknown> | null = null;

  const db = {
    checkoutField: {
      findMany: async (args: Record<string, unknown>) => {
        consulta = args;
        return [
          { id: "c1", clave: "telefono", etiqueta: "Teléfono", activo: true },
          { id: "c2", clave: "talla", etiqueta: "Talla", activo: false },
        ];
      },
    },
  } as unknown as PrismaClient;

  return { db, getConsulta: () => consulta };
}

describe("camposCheckout/listarCamposCheckout", () => {
  // campos.listar.001 — tenant-scopeado y con un orden TOTAL determinista
  it("lista los campos del tenant del acceso ordenados por posición con desempate estable", async () => {
    const { db, getConsulta } = fakeDb();

    const campos = await listarCamposCheckout({ db, acceso: acceso(["t1"]) });

    expect(campos).toHaveLength(2);
    const consulta = getConsulta();
    expect(consulta?.where).toEqual({ tenantId: "t1" }); // del acceso, jamás del input (I1)
    // `posicion` no es única (schema F01) ⇒ sin el desempate por `createdAt` dos campos empatados
    // se mostrarían en un orden que cambia entre requests.
    expect(consulta?.orderBy).toEqual([{ posicion: "asc" }, { createdAt: "asc" }]);
  });

  // campos.listar.002 — I1: sin membresía no hay Tienda que listar (fail-closed)
  it("rechaza a un usuario sin membresía", async () => {
    const { db } = fakeDb();

    await expect(
      listarCamposCheckout({ db, acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
