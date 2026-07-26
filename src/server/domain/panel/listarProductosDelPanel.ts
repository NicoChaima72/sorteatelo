import { type PrismaClient, type ProductFileType, type ProductMode } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { esProductoEntregable } from "~/server/productos/productoEntregable";

/**
 * Use case del panel (F05): lista los productos de la Tienda del Organizador — TODOS,
 * incluidos los inactivos (a diferencia del catálogo del storefront, que filtra
 * `activo: true`). El `tenantId` se resuelve SERVER-SIDE desde `acceso` (membresía / flag
 * membresía), nunca del input (I1/ADR-0005). Sin membresía ⇒ `FORBIDDEN` (fail-closed).
 *
 * El `precio` se devuelve como string entero CLP (display-only): el monto autoritativo es
 * `Product.precio` (Decimal); acá se cruza solo en el borde de presentación (nunca aritmética).
 *
 * Desde productos-tipos-digitales F02 devuelve los **archivos** del producto en vez del `pdfPath`
 * crudo: la columna dejó de ser la fuente de verdad y el panel tiene que poder mostrar el tipo de
 * cada archivo y, en un sobre, el pool completo. `archivos` incluye SOLO los confirmados
 * (entregables) y **nunca la `key`** del bucket — eso es server-only (I2/ADR-0002): el panel no
 * necesita la key para nada y exponerla sería filtrar la ruta del objeto privado al navegador.
 */
export async function listarProductosDelPanel({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<
  Array<{
    id: string;
    titulo: string;
    descripcion: string;
    precio: string;
    activo: boolean;
    participaEnSorteo: boolean; // ADR-0012/D1 — el form del panel lo hidrata
    portadaUrl: string | null;
    modalidad: ProductMode; // ESTANDAR | SOBRE (F01/D2). SOBRE ⟺ es una COLECCIÓN (V-I7)
    /** Archivos CONFIRMADOS (entregables). Sin `key`: la ruta del objeto privado no sale del server. */
    archivos: Array<{
      id: string;
      tipo: ProductFileType;
      nombreArchivo: string;
      bytes: number | null;
    }>;
    /**
     * Si este producto es un **pack** (ENMIENDA v2, E13/E15): de qué producto salen sus archivos y
     * cuántos entrega. `null` ⇒ entrega los suyos, o sea es un producto normal o una colección.
     *
     * Se devuelve el `titulo` de la fuente y no solo su id porque el panel lo PINTA («Entrega 4
     * archivos de: El libro»), y resolverlo en el cliente contra la lista obligaría a que la fuente
     * esté en la misma página del listado.
     */
    fuente: {
      id: string;
      titulo: string;
      /** Manda la modalidad de la FUENTE, no la del pack (V-I7): decide si la entrega es al azar. */
      modalidad: ProductMode;
    } | null;
    /** Cuántas unidades del contenido de la fuente entrega. Siempre 1 si no es un pack. */
    unidadesPorPack: number;
    /**
     * Cuántos packs A LA VENTA entregan el contenido de ESTE producto. El panel lo usa para explicar
     * el rol de una colección («2 packs venden esta colección») y para que el badge de un producto
     * despublicado que igual se vende vía packs no diga simplemente «Borrador».
     */
    packsActivos: number;
    /**
     * `true` sii este producto puede ser elegido como FUENTE de un pack nuevo: entrega lo suyo (no
     * es a su vez un pack — `whereFuenteElegible`) **y** ya tiene algún archivo.
     *
     * Se computa SERVER-SIDE y viaja como dato para que el desplegable del panel no tenga que
     * re-derivar quién es fuente válida: si el cliente lo dedujera por su cuenta y la regla del
     * server cambiara, el Organizador vería opciones que el submit rechaza. Es más estricto que
     * `whereFuenteElegible` a propósito (le suma «con archivos»), y esa es la dirección segura:
     * `listado ⊆ aceptado`.
     */
    puedeSerFuente: boolean;
    /**
     * `true` si el producto tiene algo que entregar HOY, contando el `pdfPath` legacy de la fase
     * EXPANDIR (F01). Es lo que el panel usa para el badge y para saber si se puede activar — no
     * `archivos.length > 0`, que dejaría fuera a los productos que prod-viejo subió sin fila.
     * Para un PACK la pregunta se responde mirando su FUENTE (E15/E17): la MISMA regla del gate de
     * publicación y del guard de activación, importada y no re-escrita (I5).
     */
    tieneArchivo: boolean;
    createdAt: Date;
  }>
> {
  const tenantId = resolverTenantDelPanel(acceso);

  const productos = await db.product.findMany({
    where: { tenantId },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      precio: true,
      activo: true,
      participaEnSorteo: true,
      portadaUrl: true,
      modalidad: true,
      pdfPath: true, // solo para computar `tieneArchivo`; NO se devuelve al cliente
      unidadesPorPack: true,
      files: {
        where: { confirmadoAt: { not: null } },
        select: { id: true, tipo: true, nombreArchivo: true, bytes: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      // La FUENTE de un pack (E15). Se traen los datos de ENTREGA de la fuente (`_count` + `pdfPath`)
      // además del título porque son los que decide `esProductoEntregable` — sin ellos habría que
      // pagar una query por pack para saber si se puede activar.
      fuente: {
        select: {
          id: true,
          titulo: true,
          modalidad: true,
          pdfPath: true,
          _count: { select: { files: { where: { confirmadoAt: { not: null } } } } },
        },
      },
      // Cuántos packs A LA VENTA entregan el contenido de este producto: es lo que hace legible en la
      // lista el rol de una colección, que de otro modo se vería como un producto que no se vende.
      _count: { select: { packs: { where: { activo: true } } } },
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return productos.map(({ pdfPath, files, precio, fuente, _count, ...p }) => {
    // "Tiene archivos PROPIOS": la mitad de la regla que mira solo a este producto, sin su fuente.
    // Es lo que hace elegible a una fuente y, para un producto sin fuente, coincide con `tieneArchivo`.
    const tieneArchivoPropio = files.length > 0 || pdfPath !== null;
    return {
      ...p,
      precio: precio.toFixed(0), // CLP entero, string (nunca number en el server)
      archivos: files,
      // Solo lo que el panel PINTA: el resto de la fuente (`pdfPath`, `_count`) es server-only y
      // alimenta la regla de abajo. Nunca sale una `key` (I2).
      fuente:
        fuente === null
          ? null
          : { id: fuente.id, titulo: fuente.titulo, modalidad: fuente.modalidad },
      packsActivos: _count.packs,
      puedeSerFuente: fuente === null && tieneArchivoPropio,
      // La regla de "entregable" vive en UN solo lugar (I5): acá se le pasan los datos que ya
      // vinieron en batch con el `select`, sin pagar una query por producto.
      tieneArchivo: esProductoEntregable({
        modalidad: p.modalidad,
        archivosConfirmados: files.length,
        pdfPathLegacy: pdfPath,
        unidadesPorPack: p.unidadesPorPack,
        fuente:
          fuente === null
            ? null
            : {
                modalidad: fuente.modalidad,
                archivosConfirmados: fuente._count.files,
                pdfPathLegacy: fuente.pdfPath,
              },
      }),
    };
  });
}
