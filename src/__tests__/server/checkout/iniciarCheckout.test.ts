import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { iniciarCheckout } from "~/server/domain/checkout/iniciarCheckout";
import { iniciarCheckoutInput } from "~/server/domain/checkout/schemas";
import { type FlowService } from "~/server/services/flow";

/**
 * Tests del use case `iniciarCheckout` con un `db` FAKE (sin DB): el foco es la lógica de
 * dominio scopeada por tenant (I1/ADR-0005), no la integración Prisma. Cubren Validaciones
 * F02 (ADR-0012): compra POR CANTIDAD — cada `OrderItem` congela precio UNITARIO + `cantidad`
 * + snapshot de `participaEnSorteo`; el `total` = Σ `precio × cantidad` en `Decimal` server-side
 * (I4, sin drift de redondeo); el monto a Flow = `total.toFixed(0)`. Y el AISLAMIENTO cross-tenant
 * (un producto de otra Tienda ⇒ NOT_FOUND). El service Flow se inyecta fake (no pega a la API real).
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  precio: Prisma.Decimal;
  activo: boolean;
  participaEnSorteo: boolean;
}

/** `db` fake: solo lo que iniciarCheckout toca. Captura los datos con que se crea la Order. */
function fakeDb(productos: ProductoFake[]) {
  let ordenCreada: Record<string, unknown> | null = null;
  let paymentUpdate: Record<string, unknown> | null = null;

  const tx = {
    product: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; id: { in: string[] } };
      }) =>
        productos
          .filter(
            (p) => p.tenantId === where.tenantId && where.id.in.includes(p.id),
          )
          .map((p) => ({
            id: p.id,
            titulo: p.titulo,
            precio: p.precio,
            activo: p.activo,
            participaEnSorteo: p.participaEnSorteo,
          })),
    },
    order: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ordenCreada = data;
        return {
          id: "order-fake-1",
          total: data.total as Prisma.Decimal,
          email: data.email as string,
        };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
    payment: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        paymentUpdate = data;
        return {};
      },
    },
  } as unknown as PrismaClient;

  return {
    db,
    getOrden: () => ordenCreada,
    getPaymentUpdate: () => paymentUpdate,
  };
}

function flowFake() {
  const crearPago = vi.fn<FlowService["crearPago"]>().mockResolvedValue({
    redirectUrl: "https://sandbox.flow.cl/app/web/pay.php?token=fake-token",
    token: "fake-token",
    flowOrder: 123,
  });
  const flow: FlowService = { crearPago, getStatus: vi.fn() };
  return { flow, crearPago };
}

const dec = (v: string) => new Prisma.Decimal(v);

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const producto = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p1",
  tenantId: TENANT_A,
  titulo: "Producto",
  precio: dec("3000"),
  activo: true,
  participaEnSorteo: false,
  ...over,
});

describe("domain/checkout/iniciarCheckout (fake db, tenant-scoped)", () => {
  // checkout.iniciar.001 — 1 ítem con cantidad 3: OrderItem cantidad 3 + precio unit snapshot
  //                        + participaEnSorteo snapshot; total = precio × 3
  it("con items [{cantidad: 3}] crea 1 OrderItem con cantidad 3, precio unitario y participaEnSorteo snapshot; total = precio × 3", async () => {
    const { db, getOrden, getPaymentUpdate } = fakeDb([
      producto({ id: "p1", precio: dec("3000"), participaEnSorteo: true }),
    ]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: { email: "fan@example.cl", items: [{ productId: "p1", cantidad: 3 }] },
    });

    const orden = getOrden()!;
    expect(orden.tenantId).toBe(TENANT_A);
    expect(orden.estado).toBe("PENDIENTE");
    // total = 3000 × 3 = 9000, exacto en Decimal.
    expect((orden.total as Prisma.Decimal).toFixed(2)).toBe("9000.00");

    const items = (orden.items as { create: Array<Record<string, unknown>> }).create;
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.productId).toBe("p1");
    expect(it0.cantidad).toBe(3);
    expect((it0.precio as Prisma.Decimal).toFixed(2)).toBe("3000.00"); // UNITARIO, no subtotal
    expect(it0.participaEnSorteo).toBe(true); // snapshot del Product (D2)
    expect(it0.tenantId).toBe(TENANT_A);

    // Payment PENDIENTE con monto = total; monto a Flow = total.toFixed(0).
    const payment = (orden.payment as { create: Record<string, unknown> }).create;
    expect((payment.monto as Prisma.Decimal).toFixed(2)).toBe("9000.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({ commerceOrder: "order-fake-1", amount: "9000" }),
    );
    expect(getPaymentUpdate()).toMatchObject({ token: "fake-token", flowOrder: 123 });
    expect(res.total).toBe("9000");
  });

  // checkout.iniciar.002 — múltiples ítems de cantidades distintas: total = Σ precio × cantidad
  it("total con múltiples ítems de cantidades distintas = Σ precio × cantidad (Decimal, sin drift); monto a Flow = total.toFixed(0)", async () => {
    const { db, getOrden } = fakeDb([
      producto({ id: "p1", precio: dec("2990"), participaEnSorteo: true }),
      producto({ id: "p2", precio: dec("4500"), participaEnSorteo: false }),
    ]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [
          { productId: "p1", cantidad: 2 }, // 2990 × 2 = 5980
          { productId: "p2", cantidad: 3 }, // 4500 × 3 = 13500
        ],
      },
    });

    // total = 5980 + 13500 = 19480, exacto.
    expect((getOrden()!.total as Prisma.Decimal).toFixed(2)).toBe("19480.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "19480" }),
    );
    expect(res.total).toBe("19480");

    // Cada línea conserva su precio UNITARIO + cantidad + snapshot del flag.
    const items = (getOrden()!.items as { create: Array<Record<string, unknown>> })
      .create;
    const porProducto = new Map(items.map((it) => [it.productId, it]));
    expect(porProducto.get("p1")).toMatchObject({ cantidad: 2, participaEnSorteo: true });
    expect((porProducto.get("p1")!.precio as Prisma.Decimal).toFixed(2)).toBe("2990.00");
    expect(porProducto.get("p2")).toMatchObject({ cantidad: 3, participaEnSorteo: false });
  });

  // checkout.iniciar.003 — validación del input: cantidad < 1 / no entera ⇒ rechazo; productId duplicado ⇒ rechazo
  it("rechaza cantidad < 1, cantidad no entera y productId duplicado a nivel de schema", async () => {
    const cid = "claaaaaaaaaaaaaaaaaaaaaaaa"; // cuid válido para el test
    const cid2 = "clbbbbbbbbbbbbbbbbbbbbbbbb";
    const base = { email: "fan@example.cl" };

    // cantidad 0 ⇒ rechazo (min 1).
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [{ productId: cid, cantidad: 0 }],
      }).success,
    ).toBe(false);
    // cantidad no entera ⇒ rechazo.
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [{ productId: cid, cantidad: 1.5 }],
      }).success,
    ).toBe(false);
    // productId duplicado ⇒ rechazo (refine).
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [
          { productId: cid, cantidad: 1 },
          { productId: cid, cantidad: 2 },
        ],
      }).success,
    ).toBe(false);
    // Dos productos distintos con cantidades válidas ⇒ OK.
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [
          { productId: cid, cantidad: 1 },
          { productId: cid2, cantidad: 5 },
        ],
      }).success,
    ).toBe(true);
  });

  // checkout.iniciar.004a — AISLAMIENTO: un producto de OTRA Tienda ⇒ NOT_FOUND (sin llamar a Flow)
  it("rechaza con NOT_FOUND un producto que pertenece a otra Tienda (aislamiento cross-tenant)", async () => {
    const { db } = fakeDb([
      producto({ id: "pB", tenantId: TENANT_B, precio: dec("9999") }),
    ]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: { email: "fan@example.cl", items: [{ productId: "pB", cantidad: 1 }] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.004b — producto inactivo del tenant ⇒ INACTIVE (sin llamar a Flow)
  it("rechaza con INACTIVE un producto inactivo del tenant (sin llamar a Flow)", async () => {
    const { db } = fakeDb([producto({ id: "p1", activo: false })]);
    const { flow, crearPago } = flowFake();
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: { email: "fan@example.cl", items: [{ productId: "p1", cantidad: 1 }] },
      }),
    ).rejects.toMatchObject({ code: "INACTIVE" });
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.004c — producto inexistente ⇒ NOT_FOUND (sin llamar a Flow)
  it("rechaza con NOT_FOUND un producto inexistente (sin llamar a Flow)", async () => {
    const { db } = fakeDb([]);
    const { flow, crearPago } = flowFake();
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "clnoexistenoexistenoexiste", cantidad: 1 }],
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(crearPago).not.toHaveBeenCalled();
  });
});
