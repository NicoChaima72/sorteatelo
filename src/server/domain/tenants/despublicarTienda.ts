import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case del panel (F08/F03, D6): despublica la Tienda del Organizador — PUBLICADA→CONFIGURACION
 * (reversible: baja el storefront del subdominio sin perder nada; re-publicar re-evalúa el gate).
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1); sin membresía ⇒ `FORBIDDEN` (un
 * Organizador no puede despublicar una Tienda ajena — no hay `tenantId` en el input). La
 * transición es un `updateMany` con guard `WHERE estado = PUBLICADA`: atómico e idempotente por
 * construcción — `count === 0` ⇒ la Tienda no estaba publicada (`CONFLICT`, nada que bajar).
 */
export async function despublicarTienda({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{ estado: "CONFIGURACION"; despublicada: true }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const { count } = await db.tenant.updateMany({
    where: { id: tenantId, estado: "PUBLICADA" },
    data: { estado: "CONFIGURACION" },
  });

  if (count === 0) {
    throw new DomainError("CONFLICT", "Tu tienda no está publicada.");
  }

  return { estado: "CONFIGURACION", despublicada: true };
}
