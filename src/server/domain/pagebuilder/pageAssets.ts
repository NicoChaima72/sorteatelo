import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { DomainError } from "~/server/domain/errors";
import {
  CONTENT_TYPES_IMAGEN,
  keyPaginaAsset,
  type StoragePublicoService,
} from "~/server/services/storagePublico";

/**
 * Ciclo de vida de las imágenes LIBRES del editor de la Página (`PageAsset`, catálogo-v2 F08,
 * ADR-0013/0016): presign → confirm → listar → eliminar, sobre el bucket R2 PÚBLICO. Espeja el patrón
 * `crearUrlSubidaImagen`/`confirmarImagenSubida` del panel, generalizado a imágenes múltiples con id
 * propio.
 *
 * Reglas duras:
 * - **I1 (tenancy)**: el `tenantId` llega YA resuelto server-side (del host, en el procedure gateado por
 *   membresía); jamás del input. Toda query lo scopea; el borrado usa `deleteMany` con `tenantId` en el
 *   `where` (un asset de otra Tienda ⇒ `NOT_FOUND`, no se toca).
 * - **I6 (el cliente nunca elige la key)**: la key la computa el server (`keyPaginaAsset(tenantId, id)`).
 *   El `assetId` lo MINTA el server en el presign (`randomUUID`) para poder fijar la key ANTES de subir.
 * - **Límites D11**: content-type de la allowlist + peso máximo se rechazan ANTES de firmar (el input Zod
 *   los valida); la cuota por tenant se chequea contra el `count` antes de presignar.
 * - **Verificación real**: `confirm` comprueba con `headObject` que el objeto EXISTE antes de persistir
 *   la fila (si el PUT no ocurrió ⇒ `INVALID`, sin fila). Esto también BLINDA cross-tenant: la key usa el
 *   `tenantId` del que confirma, así que confirmar un `assetId` ajeno no encuentra objeto ⇒ `INVALID`.
 *
 * El `storage` público se inyecta (cableado desde env en el borde del router, I5).
 */

/** Peso máximo por imagen (D11): 4 MB. */
export const MAX_BYTES_PAGE_ASSET = 4 * 1024 * 1024;
/** Cuota de imágenes por tenant (D11). */
export const MAX_ASSETS_POR_TENANT = 60;

export const crearUrlSubidaPageAssetInput = z.object({
  contentType: z.enum(CONTENT_TYPES_IMAGEN),
  bytes: z.number().int().positive().max(MAX_BYTES_PAGE_ASSET),
});
export type CrearUrlSubidaPageAssetInput = z.infer<typeof crearUrlSubidaPageAssetInput>;

export const confirmarPageAssetInput = z.object({
  assetId: z.string().uuid(),
  contentType: z.enum(CONTENT_TYPES_IMAGEN),
  bytes: z.number().int().positive().max(MAX_BYTES_PAGE_ASSET),
});
export type ConfirmarPageAssetInput = z.infer<typeof confirmarPageAssetInput>;

export const eliminarPageAssetInput = z.object({ assetId: z.string().uuid() });
export type EliminarPageAssetInput = z.infer<typeof eliminarPageAssetInput>;

/** Vista pública de un asset (para el picker del editor). La URL se recompone de la key (no se persiste). */
export interface PageAssetVista {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  createdAt: Date;
}

type DbAssets = Pick<PrismaClient, "pageAsset">;

/**
 * `crearUrlSubidaPageAsset`: valida allowlist + peso + cuota, MINTA el `assetId`, y presigna un PUT a
 * `<tenantId>/pagina/<assetId>`. Devuelve el `assetId` (para confirmar) + la URL prefirmada (para el PUT
 * directo desde el browser). NO crea fila todavía (la fila nace al confirmar ⇒ la cuota no cuenta subidas
 * abandonadas).
 */
export async function crearUrlSubidaPageAsset({
  db,
  tenantId,
  input,
  storage,
}: {
  db: DbAssets;
  tenantId: string;
  input: CrearUrlSubidaPageAssetInput;
  storage: Pick<StoragePublicoService, "presignarSubidaImagen">;
}): Promise<{ assetId: string; url: string }> {
  const usados = await db.pageAsset.count({ where: { tenantId } });
  if (usados >= MAX_ASSETS_POR_TENANT) {
    throw new DomainError(
      "INVALID",
      `Llegaste al máximo de ${MAX_ASSETS_POR_TENANT} imágenes. Elimina alguna para subir otra.`,
    );
  }
  const assetId = randomUUID();
  const key = keyPaginaAsset(tenantId, assetId);
  const url = await storage.presignarSubidaImagen({ key, contentType: input.contentType });
  return { assetId, url };
}

/**
 * `confirmarPageAsset`: verifica con `headObject` que el objeto quedó subido y persiste el `PageAsset`.
 * Idempotente (confirmar dos veces devuelve la misma fila) y tenant-scoped (findFirst por id+tenantId).
 */
export async function confirmarPageAsset({
  db,
  tenantId,
  input,
  storage,
}: {
  db: DbAssets;
  tenantId: string;
  input: ConfirmarPageAssetInput;
  storage: Pick<StoragePublicoService, "headObject" | "urlPublica">;
}): Promise<PageAssetVista> {
  const key = keyPaginaAsset(tenantId, input.assetId);

  const existe = await storage.headObject(key);
  if (!existe) {
    throw new DomainError(
      "INVALID",
      "No encontramos la imagen subida. Vuelve a intentar la subida.",
    );
  }

  // Idempotencia + tenancy: si ya se confirmó (misma id, mismo tenant), devolvemos la fila existente.
  const existente = await db.pageAsset.findFirst({ where: { id: input.assetId, tenantId } });
  const asset =
    existente ??
    (await db.pageAsset.create({
      data: {
        id: input.assetId,
        tenantId,
        contentType: input.contentType,
        bytes: input.bytes,
      },
    }));

  return {
    id: asset.id,
    url: storage.urlPublica(key),
    contentType: asset.contentType,
    bytes: asset.bytes,
    createdAt: asset.createdAt,
  };
}

/** `listarPageAssets`: los assets del tenant (para el picker), URL recompuesta de la key. */
export async function listarPageAssets({
  db,
  tenantId,
  storage,
}: {
  db: DbAssets;
  tenantId: string;
  storage: Pick<StoragePublicoService, "urlPublica">;
}): Promise<PageAssetVista[]> {
  const assets = await db.pageAsset.findMany({
    where: { tenantId }, // tenant-scoped (I1)
    orderBy: { createdAt: "desc" },
  });
  return assets.map((a) => ({
    id: a.id,
    url: storage.urlPublica(keyPaginaAsset(tenantId, a.id)),
    contentType: a.contentType,
    bytes: a.bytes,
    createdAt: a.createdAt,
  }));
}

/**
 * `eliminarPageAsset`: borra la fila (tenant-scoped) y, best-effort, el objeto R2. Un asset de otra
 * Tienda ⇒ `NOT_FOUND` (no se toca). Borrar NO invalida documentos: una URL que quede colgada degrada
 * (`<ImagenConFallback>`, D11).
 */
export async function eliminarPageAsset({
  db,
  tenantId,
  input,
  storage,
}: {
  db: DbAssets;
  tenantId: string;
  input: EliminarPageAssetInput;
  storage: Pick<StoragePublicoService, "deleteObject">;
}): Promise<{ eliminado: true }> {
  const res = await db.pageAsset.deleteMany({ where: { id: input.assetId, tenantId } }); // I1
  if (res.count === 0) {
    throw new DomainError("NOT_FOUND", "No existe esa imagen en tu tienda.");
  }
  try {
    await storage.deleteObject(keyPaginaAsset(tenantId, input.assetId));
  } catch {
    // El objeto R2 quedó huérfano (GC fuera de alcance, D11). La fila ya no está: es lo importante.
  }
  return { eliminado: true };
}
