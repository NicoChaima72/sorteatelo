import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { iniciarCheckout } from "~/server/domain/checkout/iniciarCheckout";
import { type FlowService } from "~/server/services/flow";

/**
 * Tests del use case `iniciarCheckout` con un `db` FAKE (sin DB): el foco es la lógica de
 * dominio scopeada por tenant (I1/ADR-0005), no la integración Prisma. Cubren Validaciones
 * F01: creación de Order pendiente + ítems snapshot + total + email + `tenantId`; y el
 * AISLAMIENTO cross-tenant (un producto de otra Tienda ⇒ NOT_FOUND). El service Flow se
 * inyecta fake (no se pega a la API real).
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  precio: Prisma.Decimal;
  activo: boolean;
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

describe("domain/checkout/iniciarCheckout (fake db, tenant-scoped)", () => {
  // checkout.iniciar.001 — crea Order pendiente con ítems snapshot, total, email y tenantId
  it("crea una Order pendiente con ítems snapshot, total = suma, correo y tenantId del contexto", async () => {
    const { db, getOrden, getPaymentUpdate } = fakeDb([
      { id: "p1", tenantId: TENANT_A, titulo: "Producto A", precio: dec("3000"), activo: true },
      { id: "p2", tenantId: TENANT_A, titulo: "Producto B", precio: dec("4500"), activo: true },
    ]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: { email: "fan@example.cl", productIds: ["p1", "p2"] },
    });

    const orden = getOrden()!;
    expect(orden.tenantId).toBe(TENANT_A);
    expect(orden.email).toBe("fan@example.cl");
    expect(orden.estado).toBe("PENDIENTE");
    expect((orden.total as Prisma.Decimal).toFixed(2)).toBe("7500.00"); // 3000 + 4500

    // Ítems con snapshot de precio y tenantId.
    const items = (orden.items as { create: Array<Record<string, unknown>> }).create;
    expect(items).toHaveLength(2);
    const porProducto = new Map(
      items.map((it) => [it.productId, it]),
    );
    expect((porProducto.get("p1")!.precio as Prisma.Decimal).toFixed(2)).toBe("3000.00");
    expect((porProducto.get("p2")!.precio as Prisma.Decimal).toFixed(2)).toBe("4500.00");
    expect(porProducto.get("p1")!.tenantId).toBe(TENANT_A);

    // Payment PENDIENTE con monto = total y tenantId.
    const payment = (orden.payment as { create: Record<string, unknown> }).create;
    expect(payment.estado).toBe("PENDIENTE");
    expect((payment.monto as Prisma.Decimal).toFixed(2)).toBe("7500.00");
    expect(payment.tenantId).toBe(TENANT_A);

    // Cobra en Flow con el total y persiste el token para el webhook.
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({
        commerceOrder: "order-fake-1",
        amount: "7500",
        email: "fan@example.cl",
      }),
    );
    expect(getPaymentUpdate()).toMatchObject({ token: "fake-token", flowOrder: 123 });
    expect(res.redirectUrl).toContain("token=fake-token");
    expect(res.total).toBe("7500");
  });

  // checkout.iniciar.002 — AISLAMIENTO: un producto de OTRA Tienda ⇒ NOT_FOUND (sin llamar a Flow)
  it("rechaza con NOT_FOUND un producto que pertenece a otra Tienda (aislamiento cross-tenant)", async () => {
    // El producto existe... pero en el tenant B. El checkout corre en el tenant A.
    const { db } = fakeDb([
      { id: "pB", tenantId: TENANT_B, titulo: "Producto de otra tienda", precio: dec("9999"), activo: true },
    ]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: { email: "fan@example.cl", productIds: ["pB"] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.003 — producto inexistente ⇒ NOT_FOUND (sin llamar a Flow)
  it("rechaza con NOT_FOUND un producto inexistente (sin llamar a Flow)", async () => {
    const { db } = fakeDb([]);
    const { flow, crearPago } = flowFake();
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: { email: "fan@example.cl", productIds: ["clnoexiste"] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.004 — producto inactivo ⇒ INACTIVE (sin llamar a Flow)
  it("rechaza con INACTIVE un producto inactivo del tenant (sin llamar a Flow)", async () => {
    const { db } = fakeDb([
      { id: "p1", tenantId: TENANT_A, titulo: "Inactivo", precio: dec("3000"), activo: false },
    ]);
    const { flow, crearPago } = flowFake();
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: { email: "fan@example.cl", productIds: ["p1"] },
      }),
    ).rejects.toMatchObject({ code: "INACTIVE" });
    expect(crearPago).not.toHaveBeenCalled();
  });
});
