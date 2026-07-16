import { Prisma, type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { type EfectosPostPago } from "~/server/domain/pago/efectosPostPago";

/**
 * Use case de dominio: aplica el resultado de una confirmación de pago
 * (ya obtenido server-side contra Flow por el borde) a la Orden y su Pago.
 *
 * Reglas duras (ADR-0001, I2/I3 del roadmap):
 * - La transición `pendiente → pagado | fallido` ocurre UNA sola vez por pago
 *   (idempotente): si la orden ya salió de PENDIENTE, es un replay → no-op.
 * - Todo ocurre dentro de una `prisma.$transaction`: la transición de estado,
 *   la persistencia de la comisión/fee cruda de Flow, y el punto de extensión
 *   post-pago (que en F01 es no-op).
 * - El hook post-pago se invoca SOLO en la transición a PAGADO, dentro de la
 *   MISMA transacción; si la transacción se revierte, sus efectos se revierten.
 */
export type ResultadoConfirmacion = "PAGADO" | "FALLIDO";
export type TransicionPago = ResultadoConfirmacion | "NINGUNA";

export interface ConfirmarPagoInput {
  /** Identificador de comercio que enviamos a Flow = `Order.id`. */
  commerceOrder: string;
  resultado: ResultadoConfirmacion;
  /** Comisión CRUDA que devuelve Flow en getStatus (sin computar neto/IVA). */
  fee?: string;
  flowOrder?: number;
}

export async function confirmarPagoDeOrden({
  db,
  input,
  aplicarEfectosPostPago,
}: {
  db: PrismaClient;
  input: ConfirmarPagoInput;
  aplicarEfectosPostPago: EfectosPostPago;
}): Promise<{ yaProcesado: boolean; transicion: TransicionPago }> {
  return db.$transaction(async (tx) => {
    // Idempotencia ATÓMICA (I2): la transición se hace con un UPDATE condicional
    // por estado. Solo la PRIMERA llegada matchea (`estado = PENDIENTE`) y avanza;
    // una réplica concurrente queda bloqueada en el row lock y, al re-evaluar el
    // WHERE contra el estado ya commiteado (Read Committed), matchea 0 filas →
    // replay sin efecto. Evita el check-then-act no atómico que re-ejecutaría el
    // hook post-pago ante webhooks verdaderamente simultáneos.
    const marcada = await tx.order.updateMany({
      where: { id: input.commerceOrder, estado: "PENDIENTE" },
      data: { estado: input.resultado },
    });

    if (marcada.count === 0) {
      // O la orden no existe, o ya salió de PENDIENTE (pago ya procesado).
      const existe = await tx.order.findUnique({
        where: { id: input.commerceOrder },
        select: { id: true },
      });
      if (!existe) {
        throw new DomainError(
          "NOT_FOUND",
          `Orden ${input.commerceOrder} inexistente`,
        );
      }
      return { yaProcesado: true, transicion: "NINGUNA" };
    }

    // Ganamos la transición: persistimos el estado del Pago + la comisión cruda
    // de Flow (sin computar neto/IVA).
    await tx.payment.update({
      where: { orderId: input.commerceOrder },
      data: {
        estado: input.resultado,
        ...(input.fee !== undefined
          ? { fee: new Prisma.Decimal(input.fee) }
          : {}),
        ...(input.flowOrder !== undefined
          ? { flowOrder: input.flowOrder }
          : {}),
      },
    });

    // Punto de extensión post-pago (contrato F02): UNA vez, dentro de esta
    // transacción, SOLO en la transición a PAGADO. En F01 es no-op.
    if (input.resultado === "PAGADO") {
      await aplicarEfectosPostPago({ tx, orderId: input.commerceOrder });
    }

    return { yaProcesado: false, transicion: input.resultado };
  });
}
