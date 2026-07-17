import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { type GuardarCredencialFlowInput } from "~/server/domain/panel/schemas";
import { cifrar } from "~/server/services/cifrado";

/**
 * Use case del panel (F04): carga las credenciales Flow del Organizador (BYO-Flow,
 * ADR-0006). Las keys entran WRITE-ONLY: se cifran acá con el seam existente (`cifrar`) y
 * se **upsertean** en la `FlowCredential` de la Tienda (pisa la previa — mismo patrón que
 * el seed). El `tenantId` sale de `acceso` (server-side); sin membresía ⇒ `FORBIDDEN`.
 *
 * I3/ADR-0006: la respuesta NUNCA contiene secretos — ni en claro ni cifrados. La `clave`
 * AES-256 entra INYECTADA desde el borde (el router la lee de env con `claveDeCifradoDeEnv`,
 * fail-fast si falta), para mantener el use case testeable sin env.
 */
export async function guardarCredencialFlow({
  db,
  acceso,
  input,
  clave,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: GuardarCredencialFlowInput;
  clave: Buffer;
}): Promise<{ configurada: true; sandbox: boolean; updatedAt: Date }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const datos = {
    apiKeyCifrada: cifrar(input.apiKey, clave),
    secretKeyCifrada: cifrar(input.secretKey, clave),
    sandbox: input.sandbox,
  };

  const cred = await db.flowCredential.upsert({
    where: { tenantId },
    create: { tenantId, ...datos },
    update: datos,
    select: { sandbox: true, updatedAt: true },
  });

  return { configurada: true, sandbox: cred.sandbox, updatedAt: cred.updatedAt };
}
