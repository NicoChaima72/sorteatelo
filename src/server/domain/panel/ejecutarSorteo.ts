import { randomInt } from "crypto";

import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type EjecutarSorteoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05 interna): ejecuta el sorteo de la Tienda de forma AUDITABLE e
 * IDEMPOTENTE (ADR-0008). Elige un ganador al azar (uniforme) entre las participaciones,
 * registra quién (email del ejecutor, snapshot) y cuándo (`ejecutadoAt`), y transiciona el
 * Raffle ACTIVO→CERRADO. MVP: UN ganador, criterio random uniforme (implícito).
 *
 * Idempotencia "una sola vez" en dos capas: (1) chequeo temprano `ejecutadoAt != null` ⇒
 * devuelve el ganador ya guardado sin re-sortear; (2) guard atómico `updateMany WHERE
 * ejecutadoAt IS NULL` dentro de la $transaction ⇒ si una ejecución concurrente ganó la
 * carrera (`count === 0`), re-lee y devuelve el ganador autoritativo. Scopeado por el
 * `tenantId` resuelto server-side (I1); raffle ajeno/inexistente ⇒ NOT_FOUND; 0
 * participantes ⇒ INVALID. `ahora`/`elegirIndice` se inyectan para testear sin reloj/azar.
 */
export async function ejecutarSorteo({
  db,
  acceso,
  input,
  ahora = new Date(),
  elegirIndice = (n) => randomInt(n),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: EjecutarSorteoInput;
  ahora?: Date;
  elegirIndice?: (n: number) => number;
}): Promise<{
  ganadorEmail: string;
  ejecutadoAt: Date;
  ejecutadoPor: string | null;
  yaEjecutado: boolean;
}> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });
  const ejecutadoPor = acceso.email ?? acceso.userId;

  return db.$transaction(async (tx) => {
    const raffle = await tx.raffle.findFirst({
      where: { id: input.raffleId, tenantId },
      select: {
        id: true,
        ejecutadoAt: true,
        ganadorEmail: true,
        ejecutadoPor: true,
      },
    });
    if (!raffle) {
      throw new DomainError("NOT_FOUND", "El sorteo no existe en tu Tienda.");
    }

    // Ya ejecutado: idempotente — devuelve el ganador guardado, no re-sortea.
    if (raffle.ejecutadoAt) {
      return {
        ganadorEmail: raffle.ganadorEmail!,
        ejecutadoAt: raffle.ejecutadoAt,
        ejecutadoPor: raffle.ejecutadoPor,
        yaEjecutado: true,
      };
    }

    const participaciones = await tx.raffleEntry.findMany({
      where: { raffleId: input.raffleId, tenantId },
      select: { email: true },
    });
    if (participaciones.length === 0) {
      throw new DomainError(
        "INVALID",
        "El sorteo no tiene participantes: no se puede ejecutar.",
      );
    }

    const ganadorEmail =
      participaciones[elegirIndice(participaciones.length)]!.email;

    // Guard atómico: solo marca si sigue sin ejecutar (evita doble sorteo bajo carrera).
    const { count } = await tx.raffle.updateMany({
      where: { id: input.raffleId, tenantId, ejecutadoAt: null },
      data: {
        ganadorEmail,
        ejecutadoAt: ahora,
        ejecutadoPor,
        estado: "CERRADO",
      },
    });

    if (count === 0) {
      // Una ejecución concurrente ganó la carrera: el ganador autoritativo es el guardado.
      const actual = await tx.raffle.findFirstOrThrow({
        where: { id: input.raffleId, tenantId },
        select: { ganadorEmail: true, ejecutadoAt: true, ejecutadoPor: true },
      });
      return {
        ganadorEmail: actual.ganadorEmail!,
        ejecutadoAt: actual.ejecutadoAt!,
        ejecutadoPor: actual.ejecutadoPor,
        yaEjecutado: true,
      };
    }

    return { ganadorEmail, ejecutadoAt: ahora, ejecutadoPor, yaEjecutado: false };
  });
}
