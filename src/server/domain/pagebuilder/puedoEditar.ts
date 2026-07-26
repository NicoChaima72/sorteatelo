import { type PrismaClient } from "@prisma/client";

/**
 * ¿Puede el usuario logueado EDITAR esta Tienda? (F09/D11, ADR-0019). El poder de editar sale SIEMPRE
 * de la capa de datos (I7) y de UNA sola fuente: una `TenantMembership` para (usuario, tienda). La
 * cookie wildcard es IDENTIDAD, no autorización — este use case es la autorización.
 *
 * **No hay god-mode.** Hasta el retiro del rol Operador de plataforma
 * (`tasks/26-07-25-plataforma-retiro-operador.md` F03/D6) existía un early-return por flag de rol que
 * dejaba editar cualquier tienda sin membresía. Editar una tienda es tener membresía en ella, punto:
 * un bypass por env/email/flag no puede reintroducirse sin cambiar esta firma.
 *
 * Tenancy (I1): recibe `tenantId` YA resuelto server-side (del host, en el procedure) y `userId` de
 * la sesión — NUNCA un `tenantId` del input del cliente.
 */
export async function puedoEditar({
  db,
  tenantId,
  userId,
}: {
  db: Pick<PrismaClient, "tenantMembership">;
  tenantId: string;
  userId: string;
}): Promise<{ puedeEditar: boolean }> {
  const membresia = await db.tenantMembership.findFirst({
    where: { tenantId, userId }, // server-side (I1); jamás input del cliente
    select: { id: true },
  });
  return { puedeEditar: membresia !== null };
}
