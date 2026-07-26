import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { TOS_VERSION } from "~/server/tos/tos";

/**
 * Use case del panel (F08/F02, ADR-0008): registra que el Organizador aceptó los Términos de
 * Servicio de la Plataforma. Graba los 3 campos de auditoría JUNTOS sobre la Tienda del acceso:
 * `tosVersion` = versión vigente, `tosAceptadoAt` = ahora, `tosAceptadoPor` = snapshot del email
 * (durable si el `User` se borra, ADR-0004). Es la evidencia que el gate de publicación exige.
 *
 * El `tenantId` sale de `acceso` (server-side, I1); sin membresía ⇒ `FORBIDDEN`. Idempotente:
 * re-aceptar la MISMA versión no falla, solo re-sella el timestamp (write-many, D2). `version` y
 * `ahora` se inyectan (default a la constante / al reloj) para testear sin acoplar a ellos.
 */
export async function aceptarTos({
  db,
  acceso,
  version = TOS_VERSION,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  version?: string;
  ahora?: Date;
}): Promise<{
  aceptada: true;
  version: string;
  aceptadoAt: Date;
  aceptadoPor: string;
}> {
  const tenantId = resolverTenantDelPanel(acceso);
  // "Quién": el email (identidad del Organizador, ADR-0004); userId como respaldo si faltara.
  const aceptadoPor = acceso.email ?? acceso.userId;

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      tosVersion: version,
      tosAceptadoAt: ahora,
      tosAceptadoPor: aceptadoPor,
    },
    select: { id: true },
  });

  return { aceptada: true, version, aceptadoAt: ahora, aceptadoPor };
}
