import { CheckoutFieldType, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { normalizarPorTipo } from "~/server/domain/camposCheckout/_normalizar";
import { type EditarCampoCheckoutInput } from "~/server/domain/camposCheckout/schemas";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case del panel (F02/D5): edita lo COSMÉTICO de un Campo de checkout — etiqueta, placeholder,
 * ayuda, obligatoriedad, opciones y default. `clave` y `tipo` NO se editan nunca: no están en el
 * input (ver `schemas.ts`), así que no hay guard que escribir. Cambiar de tipo se hace
 * desactivando/borrando y creando un campo nuevo.
 *
 * El efecto es SOLO HACIA ADELANTE (I4): renombrar la etiqueta no reescribe la historia, porque las
 * `CheckoutFieldResponse` ya guardadas tienen su propia copia congelada de la etiqueta que el
 * Comprador LEYÓ al responder. Por eso editar es libre y no hay que preguntar nada.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1); un campo ajeno o inexistente ⇒ NOT_FOUND
 * (indistinguibles a propósito: no delata qué campos tiene otra Tienda).
 */
export async function editarCampoCheckout({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: EditarCampoCheckoutInput;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  return db.$transaction(async (tx) => {
    // El `tipo` no viaja en el input (es inmutable) ⇒ hay que leer el VIGENTE para poder validar y
    // normalizar lo que depende de él. Dentro de la tx: entre el read y el update nadie lo cambia.
    const campo = await tx.checkoutField.findFirst({
      where: { id: input.campoId, tenantId },
      select: { id: true, tipo: true },
    });
    if (!campo) {
      throw new DomainError("NOT_FOUND", "El campo no existe en tu Tienda.");
    }

    // Único rechazo que no puede vivir en Zod (necesita el tipo vigente): un SELECT sin opciones
    // queda imposible de responder, y si además es obligatorio bloquearía TODA compra de la Tienda.
    if (
      campo.tipo === CheckoutFieldType.SELECT &&
      input.opciones.length === 0
    ) {
      throw new DomainError(
        "INVALID",
        "Un campo de lista necesita al menos una opción.",
      );
    }

    const { count } = await tx.checkoutField.updateMany({
      where: { id: input.campoId, tenantId },
      data: {
        etiqueta: input.etiqueta,
        placeholder: input.placeholder,
        textoAyuda: input.textoAyuda,
        ...normalizarPorTipo({ ...input, tipo: campo.tipo }),
      },
    });
    if (count === 0) {
      throw new DomainError("NOT_FOUND", "El campo no existe en tu Tienda.");
    }

    return { id: input.campoId };
  });
}
