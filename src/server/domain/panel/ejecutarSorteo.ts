import { randomInt } from "crypto";

import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type EjecutarSorteoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F05 interna): ejecuta el sorteo de la Tienda de forma AUDITABLE e
 * IDEMPOTENTE (ADR-0008). Elige un ganador al azar (uniforme) entre las participaciones,
 * registra quién (email del ejecutor, snapshot) y cuándo (`ejecutadoAt`), y transiciona el
 * Raffle ACTIVO→CERRADO. UN ganador, criterio random uniforme (implícito).
 *
 * Lo que gana es un **TICKET**, no un correo: junto al `ganadorEmail` se registra el
 * **[[Número del sorteo]] ganador** (`ganadorNumero`, ADR-0024 §5), para que «salió el 1057» sea un
 * hecho auditable y comunicable en vez de una deducción. Los dos snapshots se escriben en el MISMO
 * `updateMany` del guard atómico — la tupla auditable (`ganadorEmail`, `ganadorNumero`,
 * `ejecutadoAt`, `ejecutadoPor`) no se parte. Sorteos ejecutados ANTES de ADR-0024 devuelven
 * `ganadorNumero: null` (histórico irreconstruible; el backfill NO lo inventa).
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
  /**
   * Número del sorteo del TICKET ganador (ADR-0024 §5). `null` solo en sorteos ejecutados ANTES de
   * ADR-0024 (histórico irreconstruible: se sabe el correo, no cuál de sus tickets ganó).
   */
  ganadorNumero: number | null;
  ejecutadoAt: Date;
  ejecutadoPor: string | null;
  yaEjecutado: boolean;
}> {
  const tenantId = resolverTenantDelPanel(acceso);
  const ejecutadoPor = acceso.email ?? acceso.userId;

  return db.$transaction(async (tx) => {
    const raffle = await tx.raffle.findFirst({
      where: { id: input.raffleId, tenantId },
      select: {
        id: true,
        ejecutadoAt: true,
        ganadorEmail: true,
        ganadorNumero: true,
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
        ganadorNumero: raffle.ganadorNumero,
        ejecutadoAt: raffle.ejecutadoAt,
        ejecutadoPor: raffle.ejecutadoPor,
        yaEjecutado: true,
      };
    }

    // El sorteo es entre TICKETS (ADR-0012): cada fila es una chance. Se lee también su Número del
    // sorteo porque lo que gana es un TICKET CONCRETO, no "un correo" — dos tickets del mismo
    // comprador son dos filas distintas con números distintos (ADR-0024 §5).
    const participaciones = await tx.raffleEntry.findMany({
      where: { raffleId: input.raffleId, tenantId },
      select: { email: true, numero: true },
    });
    if (participaciones.length === 0) {
      throw new DomainError(
        "INVALID",
        "El sorteo no tiene participantes: no se puede ejecutar.",
      );
    }

    const ganadora = participaciones[elegirIndice(participaciones.length)]!;
    const ganadorEmail = ganadora.email;
    const ganadorNumero = ganadora.numero;

    // Guard atómico: solo marca si sigue sin ejecutar (evita doble sorteo bajo carrera). Los dos
    // snapshots del ganador (correo + Número) se escriben acá JUNTOS: la tupla auditable no se parte.
    const { count } = await tx.raffle.updateMany({
      where: { id: input.raffleId, tenantId, ejecutadoAt: null },
      data: {
        ganadorEmail,
        ganadorNumero,
        ejecutadoAt: ahora,
        ejecutadoPor,
        estado: "CERRADO",
      },
    });

    if (count === 0) {
      // Una ejecución concurrente ganó la carrera: el ganador autoritativo es el guardado.
      const actual = await tx.raffle.findFirstOrThrow({
        where: { id: input.raffleId, tenantId },
        select: {
          ganadorEmail: true,
          ganadorNumero: true,
          ejecutadoAt: true,
          ejecutadoPor: true,
        },
      });
      return {
        ganadorEmail: actual.ganadorEmail!,
        ganadorNumero: actual.ganadorNumero,
        ejecutadoAt: actual.ejecutadoAt!,
        ejecutadoPor: actual.ejecutadoPor,
        yaEjecutado: true,
      };
    }

    return {
      ganadorEmail,
      ganadorNumero,
      ejecutadoAt: ahora,
      ejecutadoPor,
      yaEjecutado: false,
    };
  });
}
