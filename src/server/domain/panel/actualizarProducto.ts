import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type ActualizarProductoInput } from "~/server/domain/panel/schemas";
import {
  datosEntregableDeFila,
  motivoNoEntregable,
  SELECCION_PRODUCTO_ENTREGABLE,
} from "~/server/productos/productoEntregable";

/**
 * Use case del panel (F05, actualizado por F03/D4): edita un producto de la Tienda del
 * Organizador (incluye activar/desactivar vía `activo`). El scoping vive en el `where` del
 * `updateMany` (`{ id, tenantId }` con el `tenantId` resuelto server-side): un `id` de OTRA
 * Tienda matchea 0 filas ⇒ `NOT_FOUND` — el aislamiento cross-tenant es indistinguible de
 * "no existe", sin fuga de existencia (I1/ADR-0005). El precio se persiste como `Decimal`
 * (I4). Ya NO recibe `pdfPath` del input (murió el seam de texto de F05, I6): el archivo lo
 * escribe únicamente el flujo `crearUrlSubidaArchivo` + `confirmarArchivoProducto` (F02).
 *
 * Tampoco recibe `portadaUrl` (plantilla-rica D4/I6): la portada es un asset del bucket público
 * que escribe SOLO `confirmarImagenSubida`; editar el producto preserva la portada existente.
 *
 * Guard fail-closed (I7): no se puede **activar** (`activo: true`) un producto SIN archivo
 * entregable ⇒ `INVALID`. Desde productos-tipos-digitales F02 "entregable" lo decide
 * `archivosParaEntrega` (≥1 `ProductFile` confirmado, o el `pdfPath` legacy de la fase EXPANDIR),
 * no la columna a secas: el código nuevo ya no escribe `pdfPath`, así que mirar solo la columna
 * dejaría inactivable para siempre a todo producto subido de acá en adelante. Se verifica scopeado
 * por tenant ANTES del update; si no existe en la Tienda ⇒ `NOT_FOUND` (mismo criterio de neutralidad).
 *
 * Desactivar (`activo: false`) hace que el catálogo del storefront —que filtra
 * `activo: true`— deje de listar el producto (las ventas ya hechas se conservan).
 */
export async function actualizarProducto({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ActualizarProductoInput;
}): Promise<{ actualizado: true }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // Guard de activación (I7): activar exige que el producto sea ENTREGABLE. Desde F02 eso ya no es
  // `pdfPath != null` sino "≥1 ProductFile confirmado, o el pdfPath legacy"; y desde F06 un SOBRE
  // además exige pool ≥ pack ACTIVO más grande (D4/I7) — sin eso, el sobre se pondría a la venta y
  // la asignación aleatoria fallaría DESPUÉS de que el Comprador pagó. La regla es la MISMA que la
  // del gate de publicación, importada y no re-escrita (I5), y el mensaje viene con ella para que la
  // razón no se desincronice de la condición.
  // Todo scopeado por tenant: un id de otra Tienda no matchea ⇒ NOT_FOUND (indistinguible de
  // inexistente). Una sola query resuelve existencia + entregabilidad.
  // Una sola lectura resuelve las DOS cosas que hacen falta: si es un pack (para saber si
  // `unidadesPorPack` aplica) y, cuando se está activando, si es entregable. `fuenteId` se lee
  // SIEMPRE porque el invariante «sin fuente ⇒ 1 unidad» tiene que valer también al desactivar.
  const fila = await db.product.findFirst({
    where: { id: input.id, tenantId },
    select: { fuenteId: true, ...SELECCION_PRODUCTO_ENTREGABLE },
  });
  if (!fila) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  if (input.activo) {
    // El gate se evalúa con las unidades que se están GUARDANDO, no con las que había: subir un pack
    // de 4 a 6 con un pool de 5 tiene que rechazarse en el mismo submit que lo intenta, no quedar
    // guardado y explotar después contra el `@@unique([orderItemId, packOrdinal, productFileId])`
    // con el Comprador ya cobrado.
    const datos = datosEntregableDeFila(fila);
    const motivo = motivoNoEntregable({
      ...datos,
      unidadesPorPack:
        fila.fuenteId !== null ? input.unidadesPorPack : datos.unidadesPorPack,
    });
    if (motivo !== null) {
      throw new DomainError("INVALID", motivo);
    }
  }

  const { count } = await db.product.updateMany({
    where: { id: input.id, tenantId },
    data: {
      titulo: input.titulo,
      descripcion: input.descripcion,
      precio: new Prisma.Decimal(input.precio),
      // portadaUrl NO se toca acá (D4/I6): la escribe solo confirmarImagenSubida. Editar el
      // producto preserva su portada actual; una portada nueva la sobrescribe la subida.
      participaEnSorteo: input.participaEnSorteo, // opt-in al sorteo (ADR-0012/D1)
      activo: input.activo,
      // DERIVADO del estado real del producto, no copiado del input (E15/V-I1): solo un PACK tiene
      // unidades que signifiquen algo. Para cualquier otro producto se re-escribe 1, que es un hecho
      // verdadero — así un cliente a mano no puede dejar un producto normal otorgando N tickets por
      // un solo archivo. `fuenteId` no se toca: es inmutable y por eso ni siquiera está en el input.
      unidadesPorPack: fila.fuenteId !== null ? input.unidadesPorPack : 1,
    },
  });

  if (count === 0) {
    throw new DomainError("NOT_FOUND", "El producto no existe en tu Tienda.");
  }

  return { actualizado: true };
}
