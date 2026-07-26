import { type PrismaClient } from "@prisma/client";

import {
  formatearPeso,
  LIMITE_BYTES_ARCHIVO_PRODUCTO,
} from "~/lib/archivos/tiposArchivo";
import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type ConfirmarArchivoProductoInput } from "~/server/domain/panel/schemas";
import { type StorageService } from "~/server/services/storage";

/**
 * Use case del panel (productos-tipos-digitales F02, D7/D9): confirma que un archivo de producto
 * quedó subido a R2 y lo marca como **entregable**. Es el ÚNICO lugar que escribe `confirmadoAt` y
 * `bytes` — con datos REALES del bucket, no con lo que declaró el cliente.
 *
 * Generaliza a `confirmarPdfProducto` (I5: mismo pipeline, no uno paralelo). Reglas duras:
 *
 * - **I1 (tenancy)**: el `tenantId` sale del `acceso`; la fila se carga scopeada por él. Un
 *   `fileId` inexistente O de OTRA Tienda ⇒ `NOT_FOUND` indistinguible, sin consultar el storage.
 * - **Verificación real (D7)**: `statObject` trae existencia + TAMAÑO. Sin objeto ⇒ `INVALID` (el
 *   PUT no ocurrió). Con más de 20 MB ⇒ `INVALID` con el peso en el mensaje y **la fila NO se
 *   confirma**: el presigned PUT no puede imponer tamaño de forma confiable, así que el corte real
 *   vive acá. El objeto queda en el bucket sin fila entregable que lo referencie (inocuo).
 * - **Invariante ESTANDAR = 1 archivo** (no expresable en el schema — Prisma no tiene uniques
 *   parciales; mismo criterio que "1 Raffle ACTIVO por tenant", S5): si el producto es ESTANDAR,
 *   confirmar un archivo nuevo BORRA los confirmados anteriores en la misma `$transaction`. Es la
 *   traducción del viejo "reemplazar el PDF = overwrite de la misma key": con keys por archivo, un
 *   reemplazo dejaría dos filas y el producto entregaría el archivo equivocado. En un SOBRE no se
 *   borra nada: ahí varios archivos confirmados SON el pool (F05).
 *
 * No auto-activa el producto (S3): activarlo sigue siendo acción explícita del Organizador.
 */
export async function confirmarArchivoProducto({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ConfirmarArchivoProductoInput;
  storage: Pick<StorageService, "statObject">;
}): Promise<{ confirmado: true; fileId: string; bytes: number }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const archivo = await db.productFile.findFirst({
    where: { id: input.fileId, tenantId },
    select: { id: true, key: true, productId: true, contentType: true },
  });
  if (!archivo) {
    throw new DomainError("NOT_FOUND", "Ese archivo no existe en tu Tienda.");
  }

  const objeto = await storage.statObject(archivo.key);
  if (!objeto) {
    throw new DomainError(
      "INVALID",
      "No encontramos el archivo subido. Vuelve a intentar la subida.",
    );
  }

  // Re-validación del TIPO contra lo que el bucket realmente almacenó (D9: "rechazo antes de
  // presignar + re-validación en confirmación"). Hoy la firma del presigned PUT ya obliga al
  // cliente a mandar el content-type exacto que se firmó, así que esto es defensa en profundidad:
  // si algún día el objeto llegara por otra vía, la fila no puede quedar diciendo que es un PDF
  // cuando el bucket tiene otra cosa. Un `contentType` ausente NO se rechaza: R2 puede no
  // reportarlo, y eso no es evidencia de que el tipo sea incorrecto.
  if (
    objeto.contentType !== undefined &&
    objeto.contentType !== archivo.contentType
  ) {
    throw new DomainError(
      "INVALID",
      "El archivo subido no coincide con el tipo que se autorizó. Vuelve a intentar la subida.",
    );
  }

  if (objeto.bytes > LIMITE_BYTES_ARCHIVO_PRODUCTO) {
    throw new DomainError(
      "INVALID",
      `El archivo pesa ${formatearPeso(objeto.bytes)} y el máximo es ` +
        `${formatearPeso(LIMITE_BYTES_ARCHIVO_PRODUCTO)} por archivo. ` +
        `Súbelo comprimido o en menor calidad.`,
    );
  }

  const producto = await db.product.findFirst({
    where: { id: archivo.productId, tenantId },
    select: { id: true, modalidad: true },
  });
  if (!producto) {
    // La FK lo hace imposible; si pasa es una violación de integridad, no una condición esperada.
    throw new DomainError("NOT_FOUND", "El producto de ese archivo no existe en tu Tienda.");
  }

  await db.$transaction(async (tx) => {
    if (producto.modalidad === "ESTANDAR") {
      // Reemplazo: fuera los confirmados anteriores de ESTE producto (nunca los de otro, nunca los
      // de otra Tienda — el `where` lleva las tres condiciones). Los pendientes se dejan estar:
      // pueden ser subidas en curso de otra pestaña, y no son entregables igual.
      const anteriores = await tx.productFile.findMany({
        where: {
          tenantId,
          productId: producto.id,
          confirmadoAt: { not: null },
          id: { not: archivo.id },
        },
        select: { id: true },
      });
      if (anteriores.length > 0) {
        await tx.productFile.deleteMany({
          // El `where` repite `tenantId`/`productId` aunque los ids ya salgan del findMany
          // scopeado: cada ESCRITURA lleva su propio scoping explícito (mismo criterio que los
          // `updateMany where { id, tenantId }` del resto del panel). Un borrado que confía en el
          // filtro de otra query es exactamente el tipo de cosa que se rompe en el refactor
          // siguiente.
          where: {
            id: { in: anteriores.map((a) => a.id) },
            tenantId,
            productId: producto.id,
          },
        });
      }
    }

    await tx.productFile.update({
      where: { id: archivo.id },
      data: { bytes: objeto.bytes, confirmadoAt: new Date() },
    });
  });

  return { confirmado: true, fileId: archivo.id, bytes: objeto.bytes };
}
