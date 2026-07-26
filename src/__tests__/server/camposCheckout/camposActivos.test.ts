import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  listarCamposActivosDelStorefront,
  SELECCION_CAMPO_DEL_CHECKOUT,
} from "~/server/domain/camposCheckout/camposActivos";

/**
 * Tests del selector que alimenta el CHECKOUT público (F04). Es el hermano de
 * `listarCamposCheckout` (el del panel) y sostiene el invariante de tenancy más sensible de la
 * feature: qué Tienda es la dueña de los campos que ve el Comprador. Acá se verifica la CONSULTA
 * (where/orderBy/select), que es la decisión; el render y el aislamiento en vivo los cubre el E2E
 * (`tasks/e2e-storefront.md#storefront.campos.aislamiento.001`).
 */

function fakeDb() {
  let consulta: Record<string, unknown> | null = null;

  const db = {
    checkoutField: {
      findMany: async (args: Record<string, unknown>) => {
        consulta = args;
        return [{ clave: "telefono", etiqueta: "Teléfono" }];
      },
    },
  } as unknown as PrismaClient;

  return { db, getConsulta: () => consulta };
}

describe("camposCheckout/listarCamposActivosDelStorefront (F04)", () => {
  // campos.storefront.001 — I1/D5: la Tienda sale del slug DEL HOST y los inactivos quedan fuera
  it("filtra por la Tienda del host y solo por campos activos, en el orden compartido", async () => {
    const { db, getConsulta } = fakeDb();

    await listarCamposActivosDelStorefront({ db, tenantSlug: "autora" });

    const consulta = getConsulta();
    // El slug lo resolvió el SSR desde el subdominio (I1/ADR-0007): jamás llega del input.
    expect(consulta?.where).toEqual({
      tenant: { slug: "autora" },
      activo: true, // D5: desactivar es sacar el campo del CHECKOUT, no borrarlo
    });
    // MISMO orden que el panel (`ordenDeCamposCheckout`): el Organizador ordena exactamente lo que
    // el Comprador va a ver, y el desempate por `createdAt` evita un form barajado entre requests.
    expect(consulta?.orderBy).toEqual([
      { posicion: "asc" },
      { createdAt: "asc" },
    ]);
  });

  // campos.storefront.002 — lo que viaja al cliente es el shape público, sin `id` ni `activo`
  it("pide solo las columnas que el Comprador necesita para responder", async () => {
    const { db, getConsulta } = fakeDb();

    await listarCamposActivosDelStorefront({ db, tenantSlug: "autora" });

    expect(getConsulta()?.select).toBe(SELECCION_CAMPO_DEL_CHECKOUT);
    // El `id` NO viaja: la respuesta se identifica por `clave` (D2/D7) y mandar el id sugeriría que
    // el cliente puede seleccionar por él. `posicion`/`activo` son redundantes (el orden es el del
    // array; activo es siempre true acá).
    expect(SELECCION_CAMPO_DEL_CHECKOUT).not.toHaveProperty("id");
    expect(SELECCION_CAMPO_DEL_CHECKOUT).not.toHaveProperty("posicion");
    expect(SELECCION_CAMPO_DEL_CHECKOUT).not.toHaveProperty("activo");
  });
});
