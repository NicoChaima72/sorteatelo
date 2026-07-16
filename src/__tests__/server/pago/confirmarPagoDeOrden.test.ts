import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
import { type EfectosPostPago } from "~/server/domain/pago/efectosPostPago";

/**
 * Tests del use case `confirmarPagoDeOrden` con un `db` FAKE (sin DB). Modelan el control
 * de flujo de la confirmación: transición condicional por estado (una sola vez),
 * idempotencia (replay ⇒ yaProcesado, hook no re-ejecutado), FALLIDO, NOT_FOUND, y que el
 * hook post-pago vive DENTRO de la transacción (si lanza, el rollback del fake revierte).
 *
 * NOTA: la atomicidad DB-level bajo carrera concurrente real (dos webhooks simultáneos
 * compitiendo por el UPDATE condicional) NO la prueba un fake — eso lo valida el
 * feature-tester con la DB real / el E2E de F01. Acá se prueba la LÓGICA del use case.
 */

type EstadoOrden = "PENDIENTE" | "PAGADO" | "FALLIDO";

/** `db` fake con un solo Order/Payment y $transaction que revierte si el callback lanza. */
function fakeDb(orderId: string, existe = true) {
  const state = { orden: "PENDIENTE" as EstadoOrden };
  const payment = {
    estado: "PENDIENTE" as EstadoOrden,
    fee: undefined as unknown,
    flowOrder: undefined as unknown,
  };

  const tx = {
    order: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; estado: EstadoOrden };
        data: { estado: EstadoOrden };
      }) => {
        if (where.id === orderId && existe && state.orden === where.estado) {
          state.orden = data.estado;
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === orderId && existe ? { id: orderId } : null,
    },
    payment: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(payment, data);
        return {};
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapOrden = state.orden;
      const snapPayment = { ...payment };
      try {
        return await fn(tx);
      } catch (e) {
        // Rollback: revierte lo mutado dentro de la transacción.
        state.orden = snapOrden;
        Object.assign(payment, snapPayment);
        throw e;
      }
    },
  } as unknown as PrismaClient;

  return { db, state, payment };
}

describe("domain/pago/confirmarPagoDeOrden (fake db)", () => {
  // confirmar.001 — pendiente→pagado una vez, persiste fee/flowOrder, hook invocado una vez
  it("avanza pendiente→pagado una vez, persiste la comisión y invoca el hook post-pago", async () => {
    const { db, state, payment } = fakeDb("order-1");
    const hook = vi.fn<EfectosPostPago>(async () => undefined);

    const r = await confirmarPagoDeOrden({
      db,
      input: { commerceOrder: "order-1", resultado: "PAGADO", fee: "103", flowOrder: 991 },
      aplicarEfectosPostPago: hook,
    });

    expect(r).toEqual({ yaProcesado: false, transicion: "PAGADO" });
    expect(state.orden).toBe("PAGADO");
    expect(payment.estado).toBe("PAGADO");
    expect((payment.fee as { toFixed: (n: number) => string }).toFixed(2)).toBe("103.00");
    expect(payment.flowOrder).toBe(991);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0]![0]).toMatchObject({ orderId: "order-1" });
    expect(hook.mock.calls[0]![0].tx).toBeDefined();
  });

  // confirmar.002 — idempotencia: segunda confirmación no re-ejecuta transición ni hook
  it("es idempotente: una segunda confirmación no re-ejecuta la transición ni el hook", async () => {
    const { db, state } = fakeDb("order-1");
    const hook = vi.fn<EfectosPostPago>(async () => undefined);

    const primera = await confirmarPagoDeOrden({
      db,
      input: { commerceOrder: "order-1", resultado: "PAGADO", fee: "103" },
      aplicarEfectosPostPago: hook,
    });
    const segunda = await confirmarPagoDeOrden({
      db,
      input: { commerceOrder: "order-1", resultado: "PAGADO", fee: "103" },
      aplicarEfectosPostPago: hook,
    });

    expect(primera.yaProcesado).toBe(false);
    expect(segunda).toEqual({ yaProcesado: true, transicion: "NINGUNA" });
    expect(hook).toHaveBeenCalledTimes(1); // NO se re-ejecuta el efecto post-pago
    expect(state.orden).toBe("PAGADO");
  });

  // confirmar.003 — pendiente→fallido, NO invoca el hook
  it("marca pendiente→fallido y NO invoca el hook post-pago", async () => {
    const { db, state, payment } = fakeDb("order-1");
    const hook = vi.fn<EfectosPostPago>(async () => undefined);

    const r = await confirmarPagoDeOrden({
      db,
      input: { commerceOrder: "order-1", resultado: "FALLIDO" },
      aplicarEfectosPostPago: hook,
    });

    expect(r.transicion).toBe("FALLIDO");
    expect(hook).not.toHaveBeenCalled();
    expect(state.orden).toBe("FALLIDO");
    expect(payment.estado).toBe("FALLIDO");
  });

  // confirmar.004 — orden inexistente ⇒ NOT_FOUND
  it("lanza NOT_FOUND si la orden no existe", async () => {
    const { db } = fakeDb("order-1", false); // no existe
    const hook = vi.fn<EfectosPostPago>(async () => undefined);

    await expect(
      confirmarPagoDeOrden({
        db,
        input: { commerceOrder: "order-1", resultado: "PAGADO" },
        aplicarEfectosPostPago: hook,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(hook).not.toHaveBeenCalled();
  });

  // confirmar.005 — el hook vive en la MISMA transacción: si lanza, la transición revierte
  it("revierte la transición si el hook post-pago lanza (el hook corre dentro de la transacción)", async () => {
    const { db, state, payment } = fakeDb("order-1");
    const hookExplota: EfectosPostPago = async () => {
      throw new Error("boom en efectos post-pago");
    };

    await expect(
      confirmarPagoDeOrden({
        db,
        input: { commerceOrder: "order-1", resultado: "PAGADO" },
        aplicarEfectosPostPago: hookExplota,
      }),
    ).rejects.toThrow(/boom/);

    // El rollback de la transacción revirtió la transición: sigue PENDIENTE.
    expect(state.orden).toBe("PENDIENTE");
    expect(payment.estado).toBe("PENDIENTE");
  });
});
