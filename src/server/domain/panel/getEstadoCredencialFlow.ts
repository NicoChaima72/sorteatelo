import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";

/**
 * Use case del panel (F04): estado LEÍBLE de la CredencialFlow de la Tienda. NUNCA devuelve
 * secretos — ni en claro ni cifrados (I3/ADR-0006): expone solo `{ configurada, sandbox,
 * updatedAt }` (el `select` ni siquiera trae las columnas cifradas). El `tenantId` sale de
 * `acceso` (server-side); sin membresía ⇒ `FORBIDDEN`.
 */
export async function getEstadoCredencialFlow({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{
  configurada: boolean;
  sandbox: boolean | null;
  updatedAt: Date | null;
}> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const cred = await db.flowCredential.findUnique({
    where: { tenantId },
    select: { sandbox: true, updatedAt: true }, // JAMÁS apiKeyCifrada/secretKeyCifrada
  });

  return {
    configurada: cred !== null,
    sandbox: cred?.sandbox ?? null,
    updatedAt: cred?.updatedAt ?? null,
  };
}
