import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type EditarSorteoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F02/D6): edita un Raffle ACTIVO y NO ejecutado. Solo mutan
 * `nombre`/`premio`/`fechaFin` — NUNCA `estado`, los ASSETS (`premioImageUrl` por el `AssetUploader`,
 * `basesPdfUrl` por la subida de bases, admin-bases-pdf F02/D2) ni los campos de ejecución (I4).
 * REEMPLAZAR las bases del sorteo no pasa por acá: es re-subir el PDF sobre la MISMA key. Una vez que el sorteo se ejecutó
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
  const tenantId = resolverTenantDelPanel(acceso);

  if (input.fechaFin.getTime() <= ahora.getTime()) {
    throw new DomainError(
      "INVALID",
      "La fecha de cierre debe ser posterior a ahora.",
    );
  }

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
