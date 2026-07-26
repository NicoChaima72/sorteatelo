import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getProductoStorefront } from "~/server/domain/checkout/getProductoStorefront";

/**
 * Tests del use case `getProductoStorefront` (detalle de producto del STOREFRONT, F03). El
 * `tenantId` viene del contexto (subdominio), NUNCA del input (I1/ADR-0005): el `id` solo
 * SELECCIONA dentro de la Tienda. Un producto de otra Tienda / inactivo / inexistente ⇒
 * `NOT_FOUND` neutral (aislamiento por construcción, indistinguible de "no existe").
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  portadaUrl: string | null;
  participaEnSorteo: boolean;
  activo: boolean;
  /** F07 — modalidad y menú de packs del sobre. */
  modalidad: "ESTANDAR" | "SOBRE";
  packOptions: Array<{
    id: string;
    unidades: number;
    precio: Prisma.Decimal;
    activo: boolean;
  }>;
}

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { id: string; tenantId: string; activo: boolean };
        select?: {
          packOptions?: {
            where?: { activo?: boolean };
            orderBy?: { unidades: "asc" };
          };
        };
      }) => {
        const p = productos.find(
          (x) =>
            x.id === where.id &&
            x.tenantId === where.tenantId &&
            x.activo === where.activo,
        );
        if (!p) return null;
        return {
          ...p,
          // HONRA el `where` del select (misma razón que en `iniciarCheckout.test.ts`): si el use
          // case se olvidara de pedir solo las ACTIVAS, las apagadas llegarían al Comprador y
          // `checkout.producto.storefront.006` lo caza.
          packOptions: p.packOptions
            .filter((o) =>
              select?.packOptions?.where?.activo === true ? o.activo : true,
            )
            // También honra el `orderBy`: el orden del selector es parte del contrato (el más chico
            // primero), y emularlo acá es lo que hace que la aserción de orden signifique algo.
            .sort((a, b) =>
              select?.packOptions?.orderBy?.unidades === "asc"
                ? a.unidades - b.unidades
                : 0,
            ),
        };
      },
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);
const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const producto = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p1",
  tenantId: TENANT_A,
  titulo: "Guía",
  descripcion: "una guía",
  precio: dec("3000"),
  portadaUrl: null,
  participaEnSorteo: false,
  activo: true,
  modalidad: "ESTANDAR",
  packOptions: [],
  ...over,
});

describe("domain/checkout/getProductoStorefront (fake db, tenant-scoped)", () => {
  // checkout.producto.storefront.001 — producto activo de la Tienda del contexto ⇒ devuelto (precio number)
  it("devuelve un producto activo de la Tienda del contexto, con precio como número entero (CLP)", async () => {
    const db = fakeDb([producto({ id: "p1", precio: dec("3000") })]);
    const res = await getProductoStorefront({
      db,
      tenantId: TENANT_A,
      input: { id: "p1" },
    });
    expect(res).toMatchObject({ id: "p1", titulo: "Guía", precio: 3000 });
    expect(typeof res.precio).toBe("number");
  });

  // checkout.producto.storefront.005 — devuelve portadaUrl + participaEnSorteo (plantilla-rica F02)
  it("devuelve portadaUrl y participaEnSorteo del producto (para el badge Sorteo del storefront)", async () => {
    const db = fakeDb([
      producto({
        id: "p1",
        portadaUrl: "https://pub.r2.dev/A/productos/p1/portada?v=9",
        participaEnSorteo: true,
      }),
    ]);
    const res = await getProductoStorefront({
      db,
      tenantId: TENANT_A,
      input: { id: "p1" },
    });
    expect(res.portadaUrl).toBe("https://pub.r2.dev/A/productos/p1/portada?v=9");
    expect(res.participaEnSorteo).toBe(true);
  });

  // checkout.producto.storefront.002 — producto de OTRA Tienda ⇒ NOT_FOUND (aislamiento)
  it("un producto de otra Tienda ⇒ NOT_FOUND (aislamiento cross-tenant)", async () => {
    const db = fakeDb([producto({ id: "pB", tenantId: TENANT_B })]);
    await expect(
      getProductoStorefront({ db, tenantId: TENANT_A, input: { id: "pB" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // checkout.producto.storefront.003 — producto inactivo ⇒ NOT_FOUND (no visible al comprador)
  it("un producto inactivo del propio tenant ⇒ NOT_FOUND", async () => {
    const db = fakeDb([producto({ id: "p1", activo: false })]);
    await expect(
      getProductoStorefront({ db, tenantId: TENANT_A, input: { id: "p1" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // checkout.producto.storefront.004 — inexistente ⇒ NOT_FOUND
  it("un producto inexistente ⇒ NOT_FOUND", async () => {
    const db = fakeDb([]);
    await expect(
      getProductoStorefront({ db, tenantId: TENANT_A, input: { id: "nope" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // checkout.producto.storefront.006 — F07: el menú del sobre llega al Comprador con SOLO las
  // opciones activas, de la más chica a la más grande, y sin filtrar nada del pool.
  it("un SOBRE devuelve su menú de packs ordenado, solo las activas, y jamás el contenido del pool", async () => {
    const db = fakeDb([
      producto({
        id: "sobre-1",
        modalidad: "SOBRE",
        packOptions: [
          { id: "pack-4u", unidades: 4, precio: dec("10000"), activo: true },
          { id: "pack-1u", unidades: 1, precio: dec("3000"), activo: true },
          // Apagada: no se ofrece (y el checkout la rechaza igual, `checkout.pack.004`).
          { id: "pack-8u", unidades: 8, precio: dec("18000"), activo: false },
        ],
      }),
    ]);

    const res = await getProductoStorefront({
      db,
      tenantId: TENANT_A,
      input: { id: "sobre-1" },
    });

    expect(res.modalidad).toBe("SOBRE");
    expect(res.opcionesDePack).toEqual([
      { id: "pack-1u", unidades: 1, precio: 3000 },
      { id: "pack-4u", unidades: 4, precio: 10000 },
    ]);
    // Display-only, como `precio` (I4).
    expect(typeof res.opcionesDePack[0]!.precio).toBe("number");
    // El "desde" lo computa el server (una sola definición, compartida con la tarjeta del catálogo)
    // y sale del pack ACTIVO más barato — la de 8 unidades a $18.000 está apagada y no cuenta.
    expect(res.precioDesde).toBe(3000);
    // D10: qué archivos hay adentro del sobre es justamente lo que NO se muestra antes de comprar.
    expect(JSON.stringify(res)).not.toMatch(/archivo|files|key/i);
  });

  // checkout.producto.storefront.007 — un ESTANDAR sigue respondiendo igual que siempre
  it("un producto estándar devuelve modalidad ESTANDAR y el menú vacío", async () => {
    const db = fakeDb([producto({ id: "p1" })]);
    const res = await getProductoStorefront({
      db,
      tenantId: TENANT_A,
      input: { id: "p1" },
    });
    expect(res.modalidad).toBe("ESTANDAR");
    expect(res.opcionesDePack).toEqual([]);
  });
});
