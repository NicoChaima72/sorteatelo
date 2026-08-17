import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { enviarCorreoDescargaDeOrden } from "~/server/domain/correo/enviarCorreoDescargaDeOrden";
import { DomainError } from "~/server/domain/errors";
import { type CorreoService } from "~/server/services/correo";

/**
 * Use case del panel (F04/D9): reenvía el correo de descarga de una orden PAGADA de la Tienda del
 * Organizador. **No escribe nada**: manda de nuevo el mismo correo, con los tokens que la orden ya
 * tenía.
 *
 * Hasta F01 de `entrega-postpago-retorno-y-reacceso` este use case REGENERABA (token + `expiresAt`
 * nuevos) todo grant vencido, dentro de una `$transaction`. Eso existía porque los grants morían a
 * los 30 días y el reenvío era la única forma de revivirlos. Con el acceso permanente (D2) esa
 * muleta no solo sobra: sería peligrosa. El único `expiresAt` no-null que puede quedar en una fila
 * es una **revocación** deliberada, así que regenerar convertiría el botón «Reenviar correo» del
 * panel en una puerta trasera para DESREVOCAR — sin que el Organizador lo sepa y sin dejar rastro.
 * Reenviar es mandar de nuevo lo mismo, no devolver un derecho.
 *
 * Reglas duras:
 * - **I4 (tenancy, lección H1)**: la Tienda se resuelve con `resolverTenantDelPanel` (host + membresía,
 *   server-side) — JAMÁS del input. La orden se carga scopeada por ese `tenantId`:
 *   una orden de OTRA Tienda es indistinguible de inexistente ⇒ `NOT_FOUND` (fail-closed).
 * - **Solo órdenes PAGADAS**: reenviar una orden no-PAGADA ⇒ `INVALID`, sin envío ni mutación.
 * - **Sin `$transaction`**: al desaparecer la única escritura, la validación es una lectura sola y
 *   envolverla en una transacción no compraría nada.
 * - **I3 (secretos/tokens)**: un fallo del envío se loguea con el `orderId` (no secreto) y el mensaje
 *   del error del adapter (status, nunca la API key), sin token ni email; se re-propaga para que el
 *   panel muestre el error.
 */
export async function reenviarCorreoDescargaDeOrden({
  db,
  acceso,
  correo,
  baseUrl,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  /** Dependencia estrecha: el reenvío manda UN correo (ver `enviarCorreoDescargaDeOrden`). */
  correo: Pick<CorreoService, "enviarCorreo">;
  baseUrl: string;
  input: { orderId: string };
}): Promise<{ reenviado: true; id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // 1) Validación (lectura sola): la orden existe EN ESTA Tienda y está PAGADA.
  const order = await db.order.findFirst({
    where: { id: input.orderId, tenantId },
    select: { estado: true },
  });

  if (!order) {
    // Inexistente O de otra Tienda: indistinguible (fail-closed, I4).
    throw new DomainError("NOT_FOUND", "La orden no existe en tu Tienda.");
  }
  if (order.estado !== "PAGADO") {
    throw new DomainError(
      "INVALID",
      "Solo puedes reenviar el correo de una orden pagada.",
    );
  }

  // 2) Reenvío del mismo correo (mismos invariantes de contenido que F02 — un correo, todos los
  //    enlaces, disclaimer). Los tokens son los que la orden ya tenía: acá no se emite ninguno.
  let resultado: { id: string };
  try {
    resultado = await enviarCorreoDescargaDeOrden({
      db,
      correo,
      orderId: input.orderId,
      baseUrl,
    });
  } catch (e) {
    // Log sin secretos (I3) y re-propaga: el panel muestra el error (a diferencia del envío
    // post-pago, acá el reenvío ES la acción — el usuario espera saber si falló).
    const detalle = e instanceof Error ? e.message : "error desconocido";
    console.error(
      `[correo-reenvio] No se pudo reenviar el correo de la orden ${input.orderId}: ${detalle}.`,
    );
    throw e;
  }

  return { reenviado: true, id: resultado.id };
}
