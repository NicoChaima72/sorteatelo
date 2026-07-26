import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { type ReordenarCamposCheckoutInput } from "~/server/domain/camposCheckout/schemas";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case del panel (F02/D5/D7): fija el orden en que los Campos de checkout se le muestran al
 * Comprador. El cliente manda la lista COMPLETA de ids ya ordenada y el server asigna
 * `posicion = índice`.
 *
 * Reasignar TODAS las posiciones (en vez de un "subir/bajar este") es lo que permite que `posicion`
 * NO tenga unique en la DB (schema F01): no hay swaps temporales que colisionen, y el resultado es
 * idempotente — mandar el mismo orden dos veces deja lo mismo.
 *
 * Se exige que el orden traiga EXACTAMENTE los campos del tenant: una lista parcial dejaría a los
 * omitidos con posiciones viejas que chocan con las nuevas, y el orden final dependería del
 * desempate por `createdAt` — o sea, el Organizador vería un orden que no es el que arrastró.
 * Reordenar incluye a los INACTIVOS a propósito: siguen teniendo lugar en la lista del panel y lo
 * recuperan tal cual al reactivarse.
 *
 * Todo dentro de una `$transaction` (I1): o queda el orden completo o no queda ninguno.
 */
export async function reordenarCamposCheckout({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ReordenarCamposCheckoutInput;
}): Promise<{ total: number }> {
  const tenantId = resolverTenantDelPanel(acceso);

  return db.$transaction(async (tx) => {
    const propios = await tx.checkoutField.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const idsPropios = new Set(propios.map((c) => c.id));

    // Un id ajeno (o inexistente) invalida TODO: nunca se aplica un orden a medias, y no se delata
    // si el id existe en otra Tienda (I1) — NOT_FOUND es la respuesta para ambos casos.
    for (const id of input.idsEnOrden) {
      if (!idsPropios.has(id)) {
        throw new DomainError("NOT_FOUND", "El campo no existe en tu Tienda.");
      }
    }

    // Repetidos ⇒ el conjunto tendría menos elementos que la lista y quedarían posiciones sin
    // asignar; se chequea con el tamaño del Set (y de paso valida el "completo" de abajo).
    const unicos = new Set(input.idsEnOrden);
    if (unicos.size !== input.idsEnOrden.length || unicos.size !== idsPropios.size) {
      throw new DomainError(
        "INVALID",
        "El nuevo orden debe incluir todos los campos de tu checkout, una sola vez.",
      );
    }

    for (const [posicion, id] of input.idsEnOrden.entries()) {
      await tx.checkoutField.updateMany({
        where: { id, tenantId },
        data: { posicion },
      });
    }

    return { total: input.idsEnOrden.length };
  });
}
