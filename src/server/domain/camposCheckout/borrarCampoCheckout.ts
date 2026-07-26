import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { type BorrarCampoCheckoutInput } from "~/server/domain/camposCheckout/schemas";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case del panel (F02/D5): BORRA la definición de un Campo de checkout. Hard delete de verdad,
 * no un soft delete — y es seguro precisamente porque las `CheckoutFieldResponse` no dependen de la
 * definición para tener sentido: son snapshots AUTOCONTENIDOS (clave + etiqueta + tipo + valor) y
 * sobreviven con `fieldId → null` por el `onDelete: SetNull` (fijado DB-backed en
 * `checkout.schema.002`). El Organizador sigue viendo esas respuestas en sus ventas (F06) y en su
 * CSV (F07) después de borrar el campo. Por eso NO hay confirmación de "vas a perder datos": no se
 * pierde ninguno.
 *
 * `deleteMany` (no `delete`) para que el `tenantId` entre en el WHERE: con `delete` por id habría
 * que confiar en un `findFirst` previo, y acá el scope viaja en la MISMA sentencia (I1).
 * Campo ajeno o inexistente ⇒ NOT_FOUND, indistinguibles.
 */
export async function borrarCampoCheckout({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: BorrarCampoCheckoutInput;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const { count } = await db.checkoutField.deleteMany({
    where: { id: input.campoId, tenantId },
  });
  if (count === 0) {
    throw new DomainError("NOT_FOUND", "El campo no existe en tu Tienda.");
  }

  return { id: input.campoId };
}
