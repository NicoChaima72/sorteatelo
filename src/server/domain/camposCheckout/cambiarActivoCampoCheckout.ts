import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { MAX_CAMPOS_ACTIVOS } from "~/server/domain/camposCheckout/reglas";
import { type CambiarActivoCampoCheckoutInput } from "~/server/domain/camposCheckout/schemas";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case del panel (F02/D5): saca un Campo de checkout del checkout (`activo = false`) o lo
 * devuelve. Es REVERSIBLE y no pierde nada — ni la definición ni las respuestas ya guardadas.
 *
 * Las dos direcciones van en UN use case (y no en un `desactivar`/`reactivar` como
 * `publicarTienda`/`despublicarTienda`) porque acá no son dos transiciones con semánticas
 * distintas: es el mismo Switch de una fila de configuración. La asimetría real —solo ACTIVAR
 * consume cupo— se expresa como una rama de tres líneas, no como dos archivos.
 *
 * Al ACTIVAR se reconta el límite de 10 (D6/I6) DENTRO de la `$tx`, igual que al crear: desactivar
 * siempre libera lugar, así que la dirección contraria no necesita guard.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1); campo ajeno o inexistente ⇒ NOT_FOUND.
 */
export async function cambiarActivoCampoCheckout({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CambiarActivoCampoCheckoutInput;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  return db.$transaction(async (tx) => {
    const campo = await tx.checkoutField.findFirst({
      where: { id: input.campoId, tenantId },
      select: { id: true, activo: true },
    });
    if (!campo) {
      throw new DomainError("NOT_FOUND", "El campo no existe en tu Tienda.");
    }

    // Solo activar consume cupo, y solo si el campo NO estaba ya activo (reactivar algo activo es
    // un no-op idempotente que no debería chocar contra el tope).
    if (input.activo && !campo.activo) {
      const activos = await tx.checkoutField.count({
        where: { tenantId, activo: true },
      });
      if (activos >= MAX_CAMPOS_ACTIVOS) {
        throw new DomainError(
          "CONFLICT",
          `Ya tienes ${MAX_CAMPOS_ACTIVOS} campos activos en tu checkout. Desactiva uno antes de reactivar este.`,
        );
      }
    }

    const { count } = await tx.checkoutField.updateMany({
      where: { id: input.campoId, tenantId },
      data: { activo: input.activo },
    });
    if (count === 0) {
      throw new DomainError("NOT_FOUND", "El campo no existe en tu Tienda.");
    }

    return { id: input.campoId };
  });
}
