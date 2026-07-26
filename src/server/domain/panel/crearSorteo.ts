import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type CrearSorteoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F01): crea el sorteo de la Tienda, que nace ACTIVO ya (D3). Es SECUENCIAL —
 * a lo sumo UN Raffle ACTIVO por Tienda a la vez (S5); crear con uno ya activo se RECHAZA (hay que
 * ejecutarlo/cerrarlo primero). El invariante 1-ACTIVO es de use case (NO constraint de DB): la
 * única defensa es el guard ATÓMICO dentro de la $transaction — recontar el ACTIVO y crear en la
 * MISMA tx, para que el chequeo no quede obsoleto entre el check y el insert (mismo criterio que la
 * carrera D8 de `crearTienda` y el guard de `ejecutarSorteo`, D2/I3).
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/I2/ADR-0005); el `tenantId` JAMÁS del input.
 * `fechaInicio = ahora` (inyectable para testear sin reloj, D3); `fechaFin` se valida futura con un
 * mensaje humano (no solo Zod). Los ASSETS del sorteo NO van acá y este use case NO escribe sus
 * columnas: la imagen del premio y el **PDF de bases** (admin-bases-pdf F02/D2) se suben TRAS crear,
 * porque su key es per-raffle y necesita el id — y sus columnas las escribe solo la confirmación
 * server-side tras `headObject` (I2/I6). El sorteo nace VÁLIDO sin bases: el gate de publicación las
 * exige recién al publicar con un sorteo ACTIVO (F03/ADR-0008).
 *
 * ARRASTRE de participantes (D13): si `importarDesdeRaffleId` viene, DENTRO de la $tx se verifica
 * que el raffle origen sea del MISMO tenant (fail-closed ⇒ NOT_FOUND), se leen sus `RaffleEntry` y
 * se replican en el raffle NUEVO reagrupando por `orderId` y re-ordinalando `0..K-1` por orden (el
 * `@@unique([raffleId, orderId, ordinal])` es per-raffle ⇒ copiar los mismos `orderId` al raffle
 * nuevo es válido). Preserva el conteo de tickets por comprador. Las compras nuevas siguen sumando
 * al ACTIVO por `aplicarEfectosPostPago` (no se toca).
 */
export async function crearSorteo({
  db,
  acceso,
  input,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearSorteoInput;
  ahora?: Date;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // Validación de fecha (pura, previa a la tx): fechaFin > ahora, con mensaje humano.
  if (input.fechaFin.getTime() <= ahora.getTime()) {
    throw new DomainError(
      "INVALID",
      "La fecha de cierre debe ser posterior a ahora.",
    );
  }

  return db.$transaction(async (tx) => {
    // Guard atómico 1-ACTIVO (D2/I3): recontar el ACTIVO del tenant DENTRO de la tx.
    const activo = await tx.raffle.findFirst({
      where: { tenantId, estado: "ACTIVO" },
      select: { id: true },
    });
    if (activo) {
      throw new DomainError(
        "CONFLICT",
        "Ya tienes un sorteo activo. Ejecútalo o ciérralo antes de crear otro.",
      );
    }

    // Arrastre (D13): validar el raffle origen (mismo tenant) ANTES de crear + leer sus entries.
    let entriesOrigen: Array<{ orderId: string; email: string }> = [];
    if (input.importarDesdeRaffleId) {
      const origen = await tx.raffle.findFirst({
        where: { id: input.importarDesdeRaffleId, tenantId },
        select: { id: true },
      });
      if (!origen) {
        throw new DomainError(
          "NOT_FOUND",
          "El sorteo del que quieres importar participantes no existe en tu Tienda.",
        );
      }
      entriesOrigen = await tx.raffleEntry.findMany({
        where: { raffleId: input.importarDesdeRaffleId, tenantId },
        select: { orderId: true, email: true },
      });
    }

    const raffle = await tx.raffle.create({
      data: {
        tenantId,
        nombre: input.nombre,
        premio: input.premio,
        estado: "ACTIVO",
        fechaInicio: ahora,
        fechaFin: input.fechaFin,
      },
      select: { id: true },
    });

    // Copia de tickets: reagrupa por `orderId` y re-ordinala 0..K-1 por orden (unique per-raffle).
    if (entriesOrigen.length > 0) {
      const porOrden = new Map<string, Array<{ orderId: string; email: string }>>();
      for (const e of entriesOrigen) {
        const acc = porOrden.get(e.orderId);
        if (acc) acc.push(e);
        else porOrden.set(e.orderId, [e]);
      }
      const nuevas = [...porOrden.values()].flatMap((grupo) =>
        grupo.map((e, i) => ({
          tenantId,
          raffleId: raffle.id,
          orderId: e.orderId,
          email: e.email,
          ordinal: i,
        })),
      );
      await tx.raffleEntry.createMany({ data: nuevas });
    }

    return { id: raffle.id };
  });
}
