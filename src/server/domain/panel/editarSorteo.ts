import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type EditarSorteoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F02/D6): edita un Raffle ACTIVO y NO ejecutado. Solo mutan
 * `nombre`/`premio`/`fechaFin`/`basesUrl` — NUNCA `estado`, `premioImageUrl` (va por el
 * `AssetUploader`) ni los campos de ejecución (I4). Una vez que el sorteo se ejecutó
 * (`ejecutadoAt != null` ⇒ CERRADO) ya no se edita ⇒ `CONFLICT`.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/I2); el `raffleId` del input se valida contra
 * el tenant (ajeno/inexistente ⇒ NOT_FOUND). El gate `!ejecutado` es ATÓMICO dentro de la $tx
 * (`updateMany WHERE ejecutadoAt IS NULL`, espejo de `ejecutarSorteo`): si una ejecución concurrente
 * ganó la carrera entre el read y el update (`count === 0`), rechaza en vez de editar un sorteo ya
 * cerrado. `fechaFin` se valida futura con mensaje humano (mismo criterio que `crearSorteo`).
 */
export async function editarSorteo({
  db,
  acceso,
  input,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: EditarSorteoInput;
  ahora?: Date;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  if (input.fechaFin.getTime() <= ahora.getTime()) {
    throw new DomainError(
      "INVALID",
      "La fecha de cierre debe ser posterior a ahora.",
    );
  }

  const basesUrl = textoOpcionalANull(input.basesUrl);

  return db.$transaction(async (tx) => {
    const raffle = await tx.raffle.findFirst({
      where: { id: input.raffleId, tenantId },
      select: { id: true, ejecutadoAt: true },
    });
    if (!raffle) {
      throw new DomainError("NOT_FOUND", "El sorteo no existe en tu Tienda.");
    }
    if (raffle.ejecutadoAt) {
      throw new DomainError(
        "CONFLICT",
        "El sorteo ya fue ejecutado: no se puede editar.",
      );
    }

    // Guard atómico: solo edita si sigue sin ejecutar (cierra la carrera con `ejecutarSorteo`).
    const { count } = await tx.raffle.updateMany({
      where: { id: input.raffleId, tenantId, ejecutadoAt: null },
      data: {
        nombre: input.nombre,
        premio: input.premio,
        fechaFin: input.fechaFin,
        basesUrl,
      },
    });
    if (count === 0) {
      throw new DomainError(
        "CONFLICT",
        "El sorteo ya fue ejecutado: no se puede editar.",
      );
    }

    return { id: input.raffleId };
  });
}
