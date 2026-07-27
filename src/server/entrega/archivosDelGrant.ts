import { type PrismaClient } from "@prisma/client";

import {
  type ArchivoParaEntrega,
  archivosParaEntrega,
} from "~/server/productos/archivosDeProducto";
import { origenDeArchivos } from "~/server/productos/fuenteDeArchivos";

/**
 * **Qué archivos autoriza un `DownloadGrant`** (productos-tipos-digitales F09, D5/I8).
 *
 * Existe UNA sola definición porque tiene DOS consumidores que no pueden discrepar: el endpoint de
 * descarga (`/api/descargas/<token>`, que sirve UNO) y la página de entrega (que los LISTA). Si
 * cada uno resolviera lo suyo, la página podría mostrar un archivo que el endpoint no entrega — o
 * peor, el endpoint podría entregar uno que no le tocó a esta orden.
 *
 * La rama del SOBRE es la que importa para la seguridad: un grant de un sobre autoriza **solo los
 * archivos ASIGNADOS a esa orden** (F08), NO el pool entero. Sin esta distinción, cualquier
 * comprador de un sticker podría bajarse la colección completa cambiando un id — que es justo lo
 * que la mecánica vende. La consulta parte del `orderId` + `productId` del grant, así que el
 * conjunto autorizado es exactamente el que se sorteó al pagar.
 *
 * (Antes de F09 el endpoint resolvía todo con `archivosParaEntrega`, que para un sobre habría
 * devuelto el pool completo. Estaba anotado en el wrapper como pendiente de esta feature.)
 */

/** Un archivo que el grant autoriza, con su coordenada de pack si vino de un sobre. */
export interface ArchivoDelGrant extends ArchivoParaEntrega {
  /** Cuál de los packs de la línea lo trajo (`null` en un producto estándar). */
  packOrdinal: number | null;
}

type DbEntrega = Pick<
  PrismaClient,
  "productFile" | "product" | "packAssignment"
>;

/**
 * Los archivos que este grant autoriza a descargar, en orden estable.
 *
 * - **ESTANDAR**: lo de siempre — sus `ProductFile` confirmados con fallback al `pdfPath` legacy
 *   (`archivosParaEntrega`, la única puerta de ese fallback, I5).
 * - **SOBRE**: los `ProductFile` ASIGNADOS a la línea de ESTA orden, ordenados por su coordenada
 *   `(packOrdinal, unidadOrdinal)` para que "el pack 2 traía estos 4" se lea igual siempre.
 *
 * Todo scopeado por el `tenantId` **del grant** (server-authored: sale de la fila, nunca del
 * request), igual que ya lo hacía la entrega de F03.
 */
export async function archivosDelGrant({
  db,
  grant,
}: {
  db: DbEntrega;
  grant: { tenantId: string; orderId: string; productId: string };
}): Promise<ArchivoDelGrant[]> {
  const producto = await db.product.findFirst({
    where: { id: grant.productId, tenantId: grant.tenantId },
    // La FUENTE (ENMIENDA v2, E15): un PACK no tiene archivos propios, entrega los de otro producto.
    select: {
      modalidad: true,
      fuenteId: true,
      fuente: { select: { modalidad: true } },
    },
  });

  /*
    De dónde salen los archivos de este grant. Es LA MISMA función que usan los efectos post-pago
    para decidir qué se sortea al pagar (y la página de entrega para decidir qué mostrar): si las
    tres respuestas discreparan, el Comprador vería archivos que el endpoint le niega — o, peor, el
    endpoint le entregaría archivos que no le tocaron.

    El grant sin producto (borrado, o de otra Tienda ⇒ el `findFirst` no lo trajo) cae por la rama
    genérica y `archivosParaEntrega` devuelve vacío: no autoriza nada, que es lo correcto.
  */
  const origen =
    producto === null
      ? { productId: grant.productId, modalidad: null }
      : origenDeArchivos(grant.productId, producto);

  if (origen.modalidad !== "SOBRE") {
    // Producto normal, o PACK de fuente ESTANDAR (el caso libro): lo entregable es el archivo de la
    // fuente. Las N copias del pack NO se materializan acá — se derivan en presentación (V-I2), y
    // por eso esta función devuelve el conjunto de archivos DISTINTOS que el grant autoriza: es lo
    // que el endpoint de descarga usa para decidir si un `?archivo=<id>` está permitido, y ahí una
    // copia repetida no significaría nada.
    const archivos = await archivosParaEntrega({
      db,
      tenantId: grant.tenantId,
      productId: origen.productId,
    });
    return archivos.map((a) => ({ ...a, packOrdinal: null }));
  }

  const asignaciones = await db.packAssignment.findMany({
    where: {
      tenantId: grant.tenantId,
      // El corte por la LÍNEA de esta orden: es lo que limita la descarga a lo que le tocó al
      // Comprador y no al pool entero.
      orderItem: { orderId: grant.orderId, productId: grant.productId },
    },
    orderBy: [{ packOrdinal: "asc" }, { unidadOrdinal: "asc" }],
    select: {
      packOrdinal: true,
      productFile: {
        select: {
          id: true,
          key: true,
          contentType: true,
          tipo: true,
          nombreArchivo: true,
          bytes: true,
        },
      },
    },
  });

  return asignaciones.map((a) => ({ ...a.productFile, packOrdinal: a.packOrdinal }));
}
