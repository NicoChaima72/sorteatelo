import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { enviarCorreoDescargaDeOrden } from "~/server/domain/correo/enviarCorreoDescargaDeOrden";
import { DomainError } from "~/server/domain/errors";
import {
  GRANT_TTL_DIAS,
  generarTokenGrant,
} from "~/server/domain/pago/aplicarEfectosPostPago";
import { type CorreoService } from "~/server/services/correo";

/**
 * Use case del panel (F04/D9): reenvía el correo de descarga de una orden PAGADA de la Tienda del
 * Organizador, REGENERANDO antes los grants EXPIRADOS (token + `expiresAt` nuevos, TTL de 30 días)
 * para que los enlaces del correo vuelvan a funcionar. Los grants vigentes se conservan tal cual.
 *
 * Reglas duras:
 * - **I4 (tenancy, lección H1)**: la Tienda se resuelve con `resolverTenantAutorizado` (membresía /
 *   flag Operador, server-side) — JAMÁS del input. La orden se carga scopeada por ese `tenantId`:
 *   una orden de OTRA Tienda es indistinguible de inexistente ⇒ `NOT_FOUND` (fail-closed).
 * - **Solo órdenes PAGADAS**: reenviar una orden no-PAGADA ⇒ `INVALID`, sin envío ni mutación.
 * - **Regeneración transaccional**: la re-escritura de los grants expirados va DENTRO de una
 *   `$transaction`; el envío del correo va DESPUÉS del commit (D1 — los tokens ya existen).
 * - **I3 (secretos/tokens)**: un fallo del envío se loguea con el `orderId` (no secreto) y el mensaje
 *   del error del adapter (status, nunca la API key), sin token ni email; se re-propaga para que el
 *   panel muestre el error.
 *
 * `ahora`/`generarToken` se inyectan para testear la expiración y los tokens sin reloj/azar reales.
 */
export async function reenviarCorreoDescargaDeOrden({
  db,
  acceso,
  correo,
  baseUrl,
  input,
  ahora = new Date(),
  generarToken = generarTokenGrant,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  correo: CorreoService;
  baseUrl: string;
  input: { orderId: string };
  ahora?: Date;
  generarToken?: () => string;
}): Promise<{ reenviado: true; id: string; grantsRegenerados: number }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  // 1) Validación + regeneración de grants expirados, atómica.
  const grantsRegenerados = await db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, tenantId },
      select: {
        estado: true,
        downloadGrants: { select: { id: true, expiresAt: true } },
      },
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

    const nuevaExpiracion = new Date(
      ahora.getTime() + GRANT_TTL_DIAS * 24 * 60 * 60 * 1000,
    );
    let regenerados = 0;
    for (const g of order.downloadGrants) {
      // Solo los EXPIRADOS: token nuevo + expiresAt nuevo. Los vigentes se conservan (su
      // token/expiración no cambian) para no invalidar enlaces que el Comprador aún puede usar.
      if (g.expiresAt.getTime() <= ahora.getTime()) {
        await tx.downloadGrant.update({
          where: { id: g.id },
          data: { token: generarToken(), expiresAt: nuevaExpiracion },
        });
        regenerados++;
      }
    }
    return regenerados;
  });

  // 2) Post-commit (D1): los tokens (nuevos o vigentes) ya existen; reenviar el mismo correo
  //    (mismos invariantes de contenido que F02 — un correo, todos los enlaces, disclaimer).
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

  return { reenviado: true, id: resultado.id, grantsRegenerados };
}
