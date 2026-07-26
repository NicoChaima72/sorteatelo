import { type PrismaClient, type ProductMode } from "@prisma/client";

/**
 * "¿Este producto se puede VENDER/PUBLICAR hoy?" — la regla de **entregable**
 * (productos-tipos-digitales F03/F06, D4/I7), en UNA definición.
 *
 * Vive en su propio módulo (y no dentro de `archivosDeProducto.ts`) porque dejó de ser una pregunta
 * sobre archivos: desde F05 depende también de la MODALIDAD y del menú de opciones de pack.
 * `archivosDeProducto.ts` sigue siendo "qué archivos hay y cuáles se entregan"; esto es "si el
 * producto está en condiciones de venderse".
 *
 * **Por qué una regla pura + una función de gate, y no un `where` de Prisma** (era lo que había
 * hasta F05, `whereProductoEntregable`): el gate del SOBRE compara un AGREGADO contra otro —
 * `count(archivos confirmados) ≥ max(unidades de las opciones activas)` — y eso no se expresa en un
 * `where` de Prisma. Al partirlo en "el caller carga los datos, la regla decide" (mismo precedente
 * que `evaluarPublicacion`/`DatosGate`) la definición queda UNA sola y la comparten por construcción
 * el checklist de publicación, el gate recomputado dentro de la `$tx` de `publicarTienda`, el badge
 * del panel y el guard de activación. Eso cierra el NIT que el `backend-reviewer` levantó en F03:
 * antes eran tres expresiones de la misma regla sincronizadas por comentario y no por test.
 */

/**
 * Lo que hay que saber de un producto para decidir si es entregable. Acoplado a DATOS, no a Prisma
 * (el caller mapea su fila), para que la regla se pueda testear sin DB y no dependa de la forma del
 * `select` de cada caller.
 */
/** Lo que hay que saber de un producto para decidir si tiene con qué cumplir, por sí solo. */
interface DatosDeEntregaPropia {
  modalidad: ProductMode;
  /** Cuántos `ProductFile` CONFIRMADOS tiene (los pendientes no son entregables ni pool). */
  archivosConfirmados: number;
  /** `Product.pdfPath` (columna legacy de la fase EXPANDIR, F01). */
  pdfPathLegacy: string | null;
}

export interface DatosProductoEntregable extends DatosDeEntregaPropia {
  /**
   * `Product.unidadesPorPack`: cuántas unidades del contenido de la FUENTE entrega una unidad
   * vendida de este producto. `1` en un producto normal (un hecho verdadero, no un relleno).
   */
  unidadesPorPack: number;
  /**
   * La FUENTE de los archivos, si este producto es un **pack** (`Product.fuenteId != null`);
   * `null` si entrega lo suyo. Es lo que decide TODA la rama de abajo.
   */
  fuente: DatosDeEntregaPropia | null;
}

/** `true` sii un producto que entrega LO SUYO tiene al menos un archivo con qué cumplir. */
function tieneArchivoPropio(d: DatosDeEntregaPropia): boolean {
  // El `pdfPathLegacy` es la mitad EXPANDIR de F01: el código viejo deployado sigue escribiendo esa
  // columna contra esta misma DB (ADR-0015), así que ignorarla volvería inentregable a un producto
  // que el Organizador subió desde prod. Para una colección la rama es inocua: la modalidad nació
  // en F01, después del backfill, así que ningún SOBRE puede venir de esa columna.
  return d.archivosConfirmados > 0 || d.pdfPathLegacy !== null;
}

/**
 * `true` sii el producto tiene con qué cumplirle a quien lo reciba.
 *
 * - **Pack** (`fuente != null`): lo que se entrega sale de la FUENTE, y cuánto alcanza depende de
 *   la modalidad de ELLA (V-I7 — la `modalidad` del pack no significa nada):
 *   - fuente **SOBRE**: el pool tiene que cubrir `unidadesPorPack`. Si no lo cubre, armar el pack
 *     obligaría a repetir un archivo dentro del pack — justo lo que D4 prohíbe y lo que el
 *     `@@unique([orderItemId, packOrdinal, productFileId])` haría estallar DESPUÉS de que el
 *     Comprador pagó. Preferimos no vender antes que fallar la entrega.
 *   - fuente **ESTANDAR**: alcanza con UN archivo por más grande que sea el pack. Las N copias se
 *     derivan en presentación y no generan filas (V-I2), así que no hay nada que "alcance" contar.
 * - **Producto normal o colección** (`fuente == null`): ≥1 archivo confirmado o el `pdfPath` legacy.
 *   Para una colección esto es exactamente lo que el panel necesita para el badge: «Sin archivo»
 *   solo si el pool está de verdad vacío (E16). Que una colección no se pueda COMPRAR es otra
 *   pregunta y la responde `seVendeDirecto`.
 */
export function esProductoEntregable(d: DatosProductoEntregable): boolean {
  if (d.fuente !== null) {
    return d.fuente.modalidad === "SOBRE"
      ? d.fuente.archivosConfirmados >= d.unidadesPorPack
      : tieneArchivoPropio(d.fuente);
  }
  return tieneArchivoPropio(d);
}

/**
 * `true` sii este producto se puede **COMPRAR**.
 *
 * Lo único que no se vende directo es una **colección**: el producto `modalidad SOBRE` que existe
 * para que sus packs referencien su pool (E14/E15). No aparece en el catálogo, el checkout la
 * rechaza, y no cuenta para el gate de publicación — una Tienda cuyo único producto activo fuera
 * una colección no tendría nada que comprar.
 *
 * `modalidad === "SOBRE"` alcanza como discriminante gracias a V-I7: un pack se persiste SIEMPRE con
 * `ESTANDAR`, así que bajo v2 `SOBRE` ⟺ «es una colección». Por eso el catálogo de F13 filtra con
 * UNA condición y no con `modalidad SOBRE AND fuenteId IS NULL`. Y si alguna fila violara V-I7, esta
 * regla la trata como colección: fail-closed (no vendible), que es el lado seguro.
 */
export function seVendeDirecto(d: { modalidad: ProductMode }): boolean {
  return d.modalidad !== "SOBRE";
}

/**
 * Mensaje humano de POR QUÉ un producto no es entregable, o `null` si sí lo es. Vive al lado de la
 * regla —y no en el use case— por el mismo motivo que `mensajeRequisitoFaltante` vive al lado de
 * `evaluarPublicacion`: si la razón se redacta lejos de la condición, las dos se desincronizan y el
 * Organizador termina leyendo "sube el archivo" cuando lo que le falta es una opción de pack.
 *
 * Voz: tuteo, sin jerga, y **dice qué hacer** (docs/design.md §8). Los números concretos entran en el
 * mensaje porque "el pool es corto" no es accionable y "tienes 3 archivos y tu pack más grande es de
 * 4" sí.
 */
export function motivoNoEntregable(d: DatosProductoEntregable): string | null {
  if (esProductoEntregable(d)) return null;

  if (d.fuente !== null) {
    if (d.fuente.modalidad === "SOBRE") {
      const n = d.fuente.archivosConfirmados;
      return (
        `Este pack entrega ${d.unidadesPorPack} archivos y la colección de la que salen tiene ` +
        `${n} ${n === 1 ? "archivo" : "archivos"}. Súbele al menos ${d.unidadesPorPack} ` +
        `para poder armar el pack sin repetir.`
      );
    }
    return (
      "El producto del que salen los archivos de este pack todavía no tiene ninguno. " +
      "Súbelo ahí primero y después pon el pack a la venta."
    );
  }
  return "No puedes poner a la venta un producto sin archivo. Sube el archivo primero.";
}

/**
 * `select` de Prisma que trae exactamente los datos de `DatosProductoEntregable`, ni uno más. Se
 * exporta para que los callers no puedan olvidarse un campo — y no es paranoia: una `fuente`
 * faltante volvería INENTREGABLE a todo pack en silencio (`fuente: null` se lee como "entrega lo
 * suyo", y un pack no tiene archivos propios), mientras que un `_count` faltante al menos no compila.
 *
 * Trae la fuente ANIDADA en vez de resolverla con una segunda query: un pack sin su fuente no se
 * puede juzgar, así que separarlas abriría la puerta a evaluar la regla con datos a medias.
 */
export const SELECCION_PRODUCTO_ENTREGABLE = {
  modalidad: true,
  pdfPath: true,
  unidadesPorPack: true,
  _count: { select: { files: { where: { confirmadoAt: { not: null } } } } },
  fuente: {
    select: {
      modalidad: true,
      pdfPath: true,
      _count: { select: { files: { where: { confirmadoAt: { not: null } } } } },
    },
  },
} as const;

/** La forma de una fila (o de su fuente anidada) traída con `SELECCION_PRODUCTO_ENTREGABLE`. */
interface FilaConArchivos {
  modalidad: ProductMode;
  pdfPath: string | null;
  _count: { files: number };
}

/** Una fila de `Product` traída con `SELECCION_PRODUCTO_ENTREGABLE`. */
export interface FilaProductoEntregable extends FilaConArchivos {
  unidadesPorPack: number;
  fuente: FilaConArchivos | null;
}

function datosDeEntregaPropia(fila: FilaConArchivos): DatosDeEntregaPropia {
  return {
    modalidad: fila.modalidad,
    archivosConfirmados: fila._count.files,
    pdfPathLegacy: fila.pdfPath,
  };
}

/** Adapta una fila de Prisma a los datos de la regla. Es el único mapeo, y lo comparten los callers. */
export function datosEntregableDeFila(
  fila: FilaProductoEntregable,
): DatosProductoEntregable {
  return {
    ...datosDeEntregaPropia(fila),
    unidadesPorPack: fila.unidadesPorPack,
    fuente: fila.fuente === null ? null : datosDeEntregaPropia(fila.fuente),
  };
}

/** Solo el `product` de Prisma: sirve tanto al `PrismaClient` como a una `$transaction`. */
type DbProductos = Pick<PrismaClient, "product">;

/**
 * `true` sii la Tienda tiene **≥1 producto activo que se pueda COMPRAR y que tenga con qué cumplir**
 * — el requisito `producto` del gate de publicación (I9/D5).
 *
 * Las dos mitades son necesarias desde la enmienda v2: sin `seVendeDirecto`, una Tienda cuyo único
 * producto activo fuera una COLECCIÓN (`modalidad SOBRE`, que no se vende ni sale en el catálogo)
 * quedaría publicable sin nada que comprar — la vitrina vacía con el gate en verde.
 *
 * Reemplaza al `where` compartido `whereProductoEntregable`: la comparación de agregados (pool de la
 * fuente ≥ unidades del pack) no se puede delegar a Postgres en un `where`, así que se traen los
 * candidatos ACTIVOS (ya filtrados por tenant en la DB) y decide la regla pura.
 *
 * Recibe `db` como interfaz mínima para que `publicarTienda` pueda pasarle su `tx` y recomputar el
 * gate DENTRO de la transacción con exactamente la misma definición que el checklist (I2: la
 * transición a PUBLICADA jamás confía en un `puedePublicar` del cliente).
 *
 * El costo es "una fila por producto activo del tenant" con un `select` mínimo (sin `key`s — I2):
 * son decenas, no millones, y el corte por `tenantId` lo sigue haciendo la DB (I1).
 */
export async function hayProductoEntregable({
  db,
  tenantId,
}: {
  db: DbProductos;
  tenantId: string;
}): Promise<boolean> {
  const candidatos = await db.product.findMany({
    where: { tenantId, activo: true },
    select: SELECCION_PRODUCTO_ENTREGABLE,
  });
  return candidatos.some(
    (fila) =>
      seVendeDirecto(fila) && esProductoEntregable(datosEntregableDeFila(fila)),
  );
}
