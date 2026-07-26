import { type PrismaClient } from "@prisma/client";

import { resolverTipoArchivo } from "~/lib/archivos/tiposArchivo";
import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type CrearUrlSubidaArchivoInput } from "~/server/domain/panel/schemas";
import {
  generarRefArchivo,
  keyDeArchivoProducto,
  sanearNombreArchivo,
  type StorageService,
} from "~/server/services/storage";

/**
 * Use case del panel (productos-tipos-digitales F02, D1/D7/D9): genera una URL prefirmada PUT para
 * que el Organizador suba **un archivo de su producto** directo a R2 (los bytes no pasan por
 * nuestro server) y deja la fila `ProductFile` creada en estado PENDIENTE.
 *
 * Generaliza a `crearUrlSubidaPdf` (F03 de entrega-storage-r2) sin duplicar el pipeline (I5): mismo
 * presigned PUT, mismo bucket privado, mismo patrón "presign + confirmación server-side". Lo que
 * cambia es que el tipo ya no es fijo y que el archivo es una FILA, no una columna.
 *
 * Reglas duras:
 * - **I1 (tenancy)**: el `tenantId` sale del `acceso` resuelto server-side; el producto se carga
 *   scopeado por él. `productId` inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible.
 * - **I4 (allowlist cerrada)**: el `contentType` se resuelve contra `resolverTipoArchivo` ANTES de
 *   firmar y ANTES de persistir nada. Fuera de la allowlist ⇒ `INVALID`, cero efectos. El Zod del
 *   input ya restringe el set; esto es defensa en profundidad (y normaliza los alias del navegador).
 * - **D9 (el cliente no elige nada del destino)**: la key la computa el server; su extensión sale
 *   del MIME validado y el `nombreArchivo` visible se sanea con esa misma extensión. El cliente
 *   solo aporta un nombre para mostrar y el id de SU producto.
 *
 * La fila nace con `confirmadoAt: null` ⇒ **no es entregable**: no cuenta para el gate de
 * publicación, no entra al pool de un sobre y no se puede descargar. Si el PUT nunca ocurre queda
 * una fila huérfana inocua (el GC de huérfanos es out of scope del plan).
 */
export async function crearUrlSubidaArchivo({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearUrlSubidaArchivoInput;
  storage: Pick<StorageService, "presignarSubida">;
}): Promise<{ url: string; fileId: string; contentType: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // Allowlist ANTES de tocar la DB: un tipo no permitido no deja ni rastro.
  const tipo = resolverTipoArchivo(input.contentType);
  if (!tipo) {
    throw new DomainError(
      "INVALID",
      "Ese tipo de archivo no está permitido. Puedes subir PDF, EPUB, imágenes (PNG/JPG/WebP), audio (MP3/M4A/WAV) o ZIP.",
    );
  }

  const producto = await db.product.findFirst({
    where: { id: input.productId, tenantId },
    select: { id: true, fuenteId: true },
  });
  if (!producto) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  // V-I1d — un PACK no tiene archivos propios: entrega los de su fuente. Este es el único choke
  // point que hace falta y no medio: la fila `ProductFile` nace acá, en el PRESIGN (F01), así que
  // bloqueando la URL prefirmada `confirmarArchivoProducto` no tiene después qué confirmar.
  // Sin este guard, un pack podría acumular archivos que nadie entrega nunca (la entrega se resuelve
  // por la fuente) y que además contarían en la cuota de storage del tenant.
  if (producto.fuenteId !== null) {
    throw new DomainError(
      "INVALID",
      "Este producto entrega los archivos de otro, así que no lleva archivos propios. " +
        "Súbelos en el producto del que salen.",
    );
  }

  const key = keyDeArchivoProducto({
    tenantId,
    productId: producto.id,
    ref: generarRefArchivo(),
    contentType: tipo.contentType,
  });

  const fila = await db.productFile.create({
    data: {
      tenantId,
      productId: producto.id,
      key,
      contentType: tipo.contentType,
      tipo: tipo.tipo,
      nombreArchivo: sanearNombreArchivo(input.nombreArchivo, tipo.contentType),
      // `bytes` y `confirmadoAt` los escribe la confirmación, con datos REALES del bucket.
    },
    select: { id: true },
  });

  const url = await storage.presignarSubida({
    key,
    contentType: tipo.contentType,
  });

  // Se devuelve el `contentType` CANÓNICO: el cliente debe mandar exactamente ese header en el PUT
  // (es el que va firmado). Si el navegador reportó un alias —`application/x-zip-compressed`— y el
  // cliente reusara el suyo, R2 rechazaría la firma.
  return { url, fileId: fila.id, contentType: tipo.contentType };
}
