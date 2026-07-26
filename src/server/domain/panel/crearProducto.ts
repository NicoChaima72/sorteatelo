import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { type CrearProductoInput } from "~/server/domain/panel/schemas";
import { resolverFuenteDePack } from "~/server/productos/fuenteDeArchivos";

/**
 * Use case del panel (F05, actualizado por F03/D4 y plantilla-rica): crea un producto en la Tienda
 * del Organizador. El `tenantId` sale del `acceso` resuelto server-side, NUNCA del input
 * (I1/ADR-0005): un producto no puede crearse "para otra Tienda" desde el cliente. El precio
 * se persiste como `Decimal` (I4).
 *
 * Nace **sin archivo**, **sin portada** (`portadaUrl: null`) y **como borrador** (`activo: false`) —
 * fail-closed: sin nada que entregar no hay venta (I7). La subida real del archivo la hacen
 * `crearUrlSubidaArchivo` + `confirmarArchivoProducto` (productos-tipos-digitales F02, tipo-agnósticas
 * — reemplazaron a las `*Pdf`); la de la PORTADA (asset público, plantilla-rica D4/I6) la hacen
 * `crearUrlSubidaImagen` + `confirmarImagenSubida`. El cliente ya no manda `pdfPath` ni `portadaUrl`
 * (murieron los seams de texto, I6). `pdfPath: null` se sigue escribiendo explícito: la columna vive
 * durante la fase EXPANDIR (F01) y nadie más que el backfill la escribe.
 *
 * Lo único que el Organizador declara sobre la FORMA del producto es la `modalidad` (F06/D2): el
 * TIPO de archivo lo deriva el server del MIME validado (D9). Una COLECCIÓN (`SOBRE`) nace vacía y
 * se llena después con sus archivos.
 *
 * **Packs (ENMIENDA v2, E13/E15)**: si viene `fuenteId`, el producto que nace es un PACK — entrega
 * `unidadesPorPack` del contenido de OTRO producto en vez de archivos propios. No hay superficie
 * nueva ni ceremonia: es el mismo alta de siempre con dos campos más.
 */
export async function crearProducto({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearProductoInput;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // ¿Es un pack? La fuente se valida ANTES de crear nada: mismo tenant y que no sea a su vez un pack
  // (V-I1). Un `fuenteId` ajeno/inexistente/encadenado ⇒ `INVALID` sin dejar rastro.
  const esPack = input.fuenteId !== null;
  if (esPack) {
    await resolverFuenteDePack({ db, tenantId, fuenteId: input.fuenteId! });
  }

  const producto = await db.product.create({
    data: {
      tenantId,
      titulo: input.titulo,
      descripcion: input.descripcion,
      precio: new Prisma.Decimal(input.precio), // CLP entero ⇒ Decimal (I4)
      pdfPath: null, // PDF pendiente; lo escribe solo confirmarPdfProducto (I6)
      // portadaUrl NO se setea acá: la escribe solo confirmarImagenSubida (asset público, D4/I6).
      participaEnSorteo: input.participaEnSorteo, // opt-in al sorteo (ADR-0012/D1)
      // Modalidad (F05/F06, D2): se fija acá y no se edita (ver `crearProductoInput`). Una COLECCIÓN
      // nace vacía y se llena con sus archivos; un producto normal, con su archivo único.
      //
      // ⚠ V-I7: un PACK se persiste SIEMPRE con `ESTANDAR`, ignorando lo que haya mandado el cliente.
      // En un pack la modalidad no significa nada (la entrega la decide la de su FUENTE) y guardarlo
      // como SOBRE lo auto-escondería del catálogo, que excluye `modalidad = SOBRE` (F13). O sea que
      // un pack marcado SOBRE sería un producto invisible e invendible, sin ningún error a la vista.
      modalidad: esPack ? "ESTANDAR" : input.modalidad,
      fuenteId: input.fuenteId,
      // Derivado, NO copiado del input: un producto SIN fuente entrega 1 unidad de sí mismo y punto.
      // Si se copiara, un cliente a mano podría mandar `{fuenteId: null, unidadesPorPack: 5}` y ese
      // producto otorgaría 5 tickets × cantidad entregando UN archivo — tickets regalados a alguien
      // que ya pagó. El `@default(1)` de la columna protege a las filas históricas, no a este writer.
      unidadesPorPack: esPack ? input.unidadesPorPack : 1,
      activo: false, // fail-closed: sin archivo entregable no hay venta (I7)
    },
    select: { id: true },
  });

  return { id: producto.id };
}
