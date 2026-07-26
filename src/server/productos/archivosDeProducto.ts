import { type PrismaClient, type ProductFileType } from "@prisma/client";

import {
  CONTENT_TYPE_PDF,
  sanearNombreArchivo,
} from "~/server/services/storage";

/**
 * Lectura tenant-scoped de los **archivos de producto** (`ProductFile`, productos-tipos-digitales
 * F01/D2). Vive suelto en `src/server/` —como `authPolicy.ts`, `tenancy/` o `descargas/`— porque
 * lo consumen varios BORDES que no comparten capa: los use cases del panel, el gate de publicación
 * (`domain/tenants/_publicacion`) y la entrega pública del Comprador (`descargas/`). No es un use
 * case (no recibe `acceso` ni `session`): recibe el `tenantId` YA resuelto server-side por su caller.
 *
 * **Por qué existe como módulo y no como `db.productFile.findMany` suelto en cada caller** (I1,
 * ADR-0005): la firma obliga a DECLARAR un `tenantId`, así que es imposible escribir un lector de
 * archivos que se OLVIDE del filtro sin salirse de este módulo. El `where` incluye `tenantId`
 * AUNQUE `productId` ya sea tenant-bound por FK: defensa en profundidad — un `productId` ajeno
 * devuelve lista VACÍA, indistinguible de "este producto no tiene archivos", sin fugar la
 * existencia del producto de otra Tienda.
 *
 * **Límite explícito de esa garantía**: este módulo NO valida de DÓNDE salió el `tenantId` — nada
 * acá impide que un caller le pase uno que vino del input. Esa mitad del invariante (el input
 * SELECCIONA, jamás AUTORIZA — lección H1 de datawalt-app) vive un nivel arriba, en
 * `tenantProcedure` (subdominio) y `resolverTenantDelPanel` (membresía). Lo que este módulo
 * garantiza es lo otro: que con un `tenantId` ya confiable, el filtro no se pueda omitir.
 */

/**
 * ⚠ La regla de "¿este producto se puede vender/publicar?" NO vive acá: vive en
 * `~/server/productos/productoEntregable.ts`. Hasta F05 este módulo tenía dos expresiones de ella
 * (`whereProductoEntregable`, un `where` de Prisma, y `tieneArchivoEntregable`, un booleano puro).
 * F06 las UNIFICÓ y las movió: desde que existe el SOBRE, la regla compara un AGREGADO contra otro
 * (pool ≥ pack ACTIVO más grande, D4/I7) y eso no se expresa en un `where`. Este módulo se quedó con
 * lo que de verdad es suyo: QUÉ archivos hay y CUÁLES se entregan.
 */

/** Proyección de un archivo listo para entregar. NUNCA se expone `key` al cliente (I2/ADR-0002). */
export interface ArchivoEntregable {
  id: string;
  /** Key del objeto en el bucket R2 PRIVADO. Server-only: jamás viaja al navegador ni al correo. */
  key: string;
  contentType: string;
  tipo: ProductFileType;
  /** Nombre con el que el Comprador recibe el archivo (base del `Content-Disposition`). */
  nombreArchivo: string;
  /** Tamaño real del objeto; `null` = desconocido (filas del backfill de `pdfPath`, D8). */
  bytes: number | null;
}

/**
 * Un archivo tal como se ENTREGA hoy. Es `ArchivoEntregable` más la posibilidad de venir de la
 * columna legacy `Product.pdfPath` (fase EXPANDIR, F01) — de ahí el `id` nullable.
 */
export interface ArchivoParaEntrega extends Omit<ArchivoEntregable, "id"> {
  /** `id` de la fila `ProductFile`, o `null` si sale del `pdfPath` legacy (sin fila propia). */
  id: string | null;
}

type DbArchivos = Pick<PrismaClient, "productFile">;
type DbArchivosYProducto = DbArchivos & Pick<PrismaClient, "product">;

/**
 * Los archivos **CONFIRMADOS** de un producto de ESTA Tienda, en orden estable. Un archivo sin
 * `confirmadoAt` es una subida a medio camino (la fila nace en el presign): no es entregable, no
 * cuenta para el gate de publicación y no entra al pool de un sobre.
 *
 * Orden total y determinista (`createdAt asc, id asc`): lo consume el pool del sobre (F05), donde
 * un orden inestable haría irreproducible cualquier lectura, y el lector del producto estándar,
 * que toma el más reciente cuando —por un reemplazo— hubiera más de uno.
 */
export async function archivosEntregablesDeProducto({
  db,
  tenantId,
  productId,
}: {
  db: DbArchivos;
  tenantId: string;
  productId: string;
}): Promise<ArchivoEntregable[]> {
  const archivos = await db.productFile.findMany({
    // `tenantId` explícito además de `productId` (defensa en profundidad, I1).
    where: { tenantId, productId, confirmadoAt: { not: null } },
    select: {
      id: true,
      key: true,
      contentType: true,
      tipo: true,
      nombreArchivo: true,
      bytes: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return archivos;
}

/**
 * Lo que hay que ENTREGAR hoy de un producto: sus `ProductFile` confirmados **con fallback a la
 * columna legacy `Product.pdfPath`**. Es la única puerta por la que pasa ese fallback (I5: una
 * definición, no una por caller) y la consumen la entrega (`descargas/`), el gate de publicación y
 * el guard de activación del panel.
 *
 * **Por qué el fallback es load-bearing y no paranoia** (fase EXPANDIR, F01): la DB es COMPARTIDA
 * dev = prod (ADR-0015) y el código VIEJO sigue deployado escribiendo `pdfPath` sin crear
 * `ProductFile`. O sea que aparecen filas nuevas en ese estado DESPUÉS de que el backfill corrió.
 * Sin este fallback, un producto que el Organizador subió desde prod dejaría de ser entregable al
 * deployar. Muere cuando muera la columna (plan aparte, nunca este).
 *
 * El fallback SOLO aplica si no hay ningún `ProductFile` confirmado: cuando la tabla ya tiene la
 * verdad, la columna legacy no se mira (evita entregar dos veces el mismo archivo migrado). Y solo
 * puede devolver UN archivo, porque la columna era 1:1 — un sobre (pool de M) nunca pasa por acá.
 */
export async function archivosParaEntrega({
  db,
  tenantId,
  productId,
}: {
  db: DbArchivosYProducto;
  tenantId: string;
  productId: string;
}): Promise<ArchivoParaEntrega[]> {
  const confirmados = await archivosEntregablesDeProducto({
    db,
    tenantId,
    productId,
  });
  if (confirmados.length > 0) return confirmados;

  // Sin filas: puede ser un producto realmente sin archivo, o uno que solo existe en la columna
  // legacy. Scopeado por tenant igual que todo lo demás (I1).
  const producto = await db.product.findFirst({
    where: { id: productId, tenantId },
    select: { pdfPath: true, titulo: true },
  });
  // Llegar acá ya implica `archivosConfirmados === 0`, así que la rama ESTANDAR de
  // `esProductoEntregable` se reduce exactamente a "¿la columna legacy tiene algo?".
  if (producto?.pdfPath == null) return [];

  return [
    {
      id: null, // no hay fila: este archivo vive solo en la columna
      key: producto.pdfPath,
      contentType: CONTENT_TYPE_PDF,
      tipo: "PDF",
      // El nombre se deriva del título, que es exactamente lo que hacía la entrega antes de F01 ⇒
      // el Comprador recibe el archivo con el MISMO nombre que recibía.
      nombreArchivo: sanearNombreArchivo(producto.titulo, CONTENT_TYPE_PDF),
      bytes: null, // la columna nunca guardó el tamaño
    },
  ];
}
