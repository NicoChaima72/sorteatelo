import { type Prisma } from "@prisma/client";

/**
 * Contrato del punto de extensión "efectos post-pago" (definido por F02 en
 * `tasks/26-07-08-efectos-post-pago.md` § D1).
 *
 * Se invoca UNA sola vez por pago, DENTRO de la misma `prisma.$transaction` que
 * ejecuta la transición `pendiente → pagado`, y SOLO en esa transición (nunca en
 * `fallido`, nunca en idempotent-replay). Recibe el cliente transaccional `tx`
 * (para que sus escrituras vivan en la misma transacción) y el `orderId` de la
 * orden recién confirmada. NO recibe ni toca env/res/cliente Flow.
 *
 * En F01 se cablea con `noopEfectosPostPago`. F02 reemplaza el cableado en el
 * wrapper del webhook (`src/pages/api/webhooks/flow.ts`) por el use case real
 * `aplicarEfectosPostPago` (DownloadGrant + RaffleEntry), SIN reescribir el
 * núcleo del webhook ni este contrato.
 */
export type EfectosPostPago = (args: {
  tx: Prisma.TransactionClient;
  orderId: string;
}) => Promise<void>;

/** Implementación por defecto de F01: no hace nada. */
export const noopEfectosPostPago: EfectosPostPago = async () => {
  // Sin efectos en F01. Ver el contrato arriba.
};
