import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { resolverKeyBasesDeSorteo } from "~/server/domain/panel/_basesSorteo";
import { type CrearUrlSubidaBasesInput } from "~/server/domain/panel/schemas";
import { type StoragePublicoService } from "~/server/services/storagePublico";

/**
 * Use case del panel (admin-bases-pdf F01, D1/D2, ADR-0008/0013): genera una URL prefirmada PUT para
 * que el Organizador suba el **PDF de bases** de SU sorteo directamente al bucket PÚBLICO de R2 (los
 * bytes no pasan por el server). Espeja `crearUrlSubidaImagen`, con dos diferencias:
 *
 * - el Content-Type firmado es `application/pdf` — la ÚNICA excepción de la allowlist del bucket
 *   público (I1: ahí jamás va un PDF de PRODUCTO, que sigue en el bucket privado gated por
 *   `Entitlement`, ADR-0002/0009);
 * - el destino es único (`bases` de un Raffle), así que no hay unión discriminada de destinos.
 *
 * - **I1/I2 (tenancy)**: el `tenantId` sale del `acceso` resuelto server-side; el Raffle se carga
 *   scopeado por él ⇒ sorteo inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible y NO presigna.
 * - **I6 (el cliente nunca elige la key)**: la computa el server (`keyBasesSorteo`). El input solo
 *   trae el `raffleId` + el Content-Type.
 *
 * El `storage` público se inyecta (cableado desde env en el borde del router); el dominio no
 * instancia el S3Client ni lee env (I5).
 */
export async function crearUrlSubidaBases({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearUrlSubidaBasesInput;
  storage: Pick<StoragePublicoService, "presignarSubidaBases">;
}): Promise<{ url: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const key = await resolverKeyBasesDeSorteo({
    db,
    tenantId,
    raffleId: input.raffleId,
  });
  const url = await storage.presignarSubidaBases({
    key,
    contentType: input.contentType,
  });
  return { url };
}
