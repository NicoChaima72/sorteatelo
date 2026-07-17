import { randomBytes } from "node:crypto";

import { DomainError } from "~/server/domain/errors";
import { type EfectosPostPago } from "~/server/domain/pago/efectosPostPago";

/**
 * Efectos post-pago per-tenant (F02). Materializa los dos efectos de negocio de una
 * venta pagada, DENTRO de la misma `prisma.$transaction` que la transición
 * `PENDIENTE → PAGADO` (recibe el `tx` transaccional) y SOLO en esa transición (el
 * núcleo del webhook lo invoca una sola vez — I2):
 *
 *  1. **Entitlement** (`DownloadGrant`, ADR-0002): un grant por `OrderItem`/producto
 *     (D2), con un `token` opaco crypto-random inadivinable (nunca logueado — I4) y
 *     `expiresAt` (S3: 30 días desde la confirmación). Idempotente por
 *     `@@unique([orderId, productId])`.
 *  2. **Participación** (`RaffleEntry`, CONTEXT § Participación): una entry por Orden
 *     (D3) en el `Raffle` ACTIVO **de la Tienda de la orden** (lookup scoped al
 *     `tenantId` derivado de la orden cargada vía `tx` — server-side, nunca input, I1),
 *     con `email` snapshot de `Order.email` (I5). Idempotente por
 *     `@@unique([raffleId, orderId])`.
 *
 * Reglas duras:
 * - **I1 (tenancy)**: el `tenantId` que se escribe en grants/entry y el que scopea el
 *   lookup del raffle salen de la ORDEN cargada por `tx`, jamás de un parámetro.
 * - **I3 (la venta es lo primario)**: sin `Raffle` ACTIVO en la Tienda de la orden, se
 *   crean igual los grants y se OMITE la entry sin lanzar (log inocuo). Un problema del
 *   sorteo NUNCA revierte ni falla una orden pagada.
 * - **Idempotencia**: `createMany({ skipDuplicates: true })` se apoya en los `@@unique`
 *   para que una segunda invocación deje exactamente N grants + 1 entry (sin duplicar).
 *
 * Cumple el contrato `EfectosPostPago` tal cual (`{ tx, orderId }`), no toca
 * env/res/Flow, y se cabla desde el borde (wrapper del webhook), reemplazando
 * `noopEfectosPostPago` sin tocar el núcleo del webhook ni el contrato (I6).
 */

/** Ventana de validez del derecho de descarga (S3; política final en F03). */
const GRANT_TTL_DIAS = 30;

/** Token opaco crypto-random (autoridad intrínseca del grant; D5/I4). Nunca se loguea. */
function generarTokenGrant(): string {
  return randomBytes(32).toString("base64url");
}

export const aplicarEfectosPostPago: EfectosPostPago = async ({ tx, orderId }) => {
  // Carga la orden por `tx` (misma transacción). De acá — no de un parámetro — salen el
  // `tenantId` (I1), el `email` (snapshot, I5) y los productos de sus ítems.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      items: { select: { productId: true } },
    },
  });

  if (!order) {
    // No debería ocurrir: el núcleo confirma la orden antes de invocar el hook. Si pasa,
    // es una violación de integridad (no un "problema del sorteo") ⇒ revertir la
    // transacción es lo correcto.
    throw new DomainError(
      "NOT_FOUND",
      `Orden ${orderId} inexistente al aplicar efectos post-pago`,
    );
  }

  // 1) Entitlement: un DownloadGrant por ítem/producto (D2), con el tenantId de la orden.
  //    Idempotente por @@unique([orderId, productId]) + skipDuplicates.
  const expiresAt = new Date(
    Date.now() + GRANT_TTL_DIAS * 24 * 60 * 60 * 1000,
  );
  await tx.downloadGrant.createMany({
    data: order.items.map((item) => ({
      tenantId: order.tenantId,
      orderId: order.id,
      productId: item.productId,
      token: generarTokenGrant(),
      expiresAt,
    })),
    skipDuplicates: true,
  });

  // 2) Participación: el Raffle ACTIVO de la Tienda de la orden (scoped al tenantId
  //    derivado server-side, I1). `orderBy` determinista para que, si por error de
  //    sembrado hubiera más de un ACTIVO (S5), la elección sea estable y reproducible —
  //    NUNCA se lanza por esto (I3: la venta no se compromete por el sorteo).
  const raffleActivo = await tx.raffle.findFirst({
    where: { tenantId: order.tenantId, estado: "ACTIVO" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!raffleActivo) {
    // D4/I3: sin sorteo ACTIVO en ESTA Tienda se omite la entry sin fallar. Log inocuo
    // (sin email ni token — I4): tenantId y orderId no son secretos.
    console.info(
      `[efectos-post-pago] Orden ${order.id} (tenant ${order.tenantId}): ` +
        `sin Raffle ACTIVO en la Tienda; se omite la RaffleEntry (la venta no se compromete).`,
    );
    return;
  }

  // Una RaffleEntry por Orden (D3), email snapshot (I5). Idempotente por
  // @@unique([raffleId, orderId]) + skipDuplicates.
  await tx.raffleEntry.createMany({
    data: [
      {
        tenantId: order.tenantId,
        raffleId: raffleActivo.id,
        orderId: order.id,
        email: order.email,
      },
    ],
    skipDuplicates: true,
  });
};
