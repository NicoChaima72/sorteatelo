import { type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";

/**
 * Resuelve el **Pagador** de una Tienda con plan vivo y exige que sea quien está pidiendo (F10/D12).
 * Lo comparten las dos mitades de «Cambiar tarjeta» (`iniciarCambioDeTarjeta` y
 * `confirmarCambioDeTarjeta`): la segunda repite el guard a propósito, porque entre el redirect a
 * Flow y la vuelta pasa un viaje entero y el estado pudo cambiar.
 *
 * **Por qué el medio de pago no es de cualquier membresía**: una Tienda admite varias
 * `TenantMembership`, pero el customer de Flow y la tarjeta son de UNA persona (D1). Si otra
 * membresía pudiera registrar su tarjeta sobre ese customer, le empezarían a cobrar a alguien que
 * nunca eligió pagar —y los comprobantes seguirían yendo al correo del Pagador, así que ni se
 * enteraría—. El día que exista «transferir la titularidad» (puerta abierta del plan) será una
 * acción explícita con su propia confirmación, no un efecto lateral de cambiar una tarjeta.
 */

export interface PagadorDeLaTienda {
  suscripcionId: string;
  pagadorId: string;
  flowCustomerId: string;
}

export async function exigirPagadorDeLaTienda({
  db,
  tenantId,
  userId,
}: {
  db: Pick<PrismaClient, "platformSubscription">;
  tenantId: string;
  /** Quién está pidiendo el cambio: tiene que SER el Pagador. */
  userId: string;
}): Promise<PagadorDeLaTienda> {
  const suscripcion = await db.platformSubscription.findUnique({
    where: { tenantId },
    select: {
      id: true,
      estado: true,
      pagador: { select: { id: true, userId: true, flowCustomerId: true } },
    },
  });

  if (!suscripcion || !esActiva(suscripcion.estado)) {
    // Sin plan vivo no hay tarjeta que cambiar: el camino correcto es activar (o re-suscribir), y
    // ese flujo ya registra la tarjeta por su cuenta.
    throw new DomainError(
      "INVALID",
      "Esta tienda no tiene un plan activo. Actívalo y registra tu tarjeta en ese paso.",
    );
  }

  if (suscripcion.pagador.userId !== userId) {
    throw new DomainError(
      "FORBIDDEN",
      "El medio de pago lo administra quien registró la tarjeta de esta tienda.",
    );
  }

  return {
    suscripcionId: suscripcion.id,
    pagadorId: suscripcion.pagador.id,
    flowCustomerId: suscripcion.pagador.flowCustomerId,
  };
}
