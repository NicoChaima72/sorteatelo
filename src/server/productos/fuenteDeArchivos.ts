import { type Prisma, type PrismaClient, type ProductMode } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";

/**
 * **De dónde salen los archivos que entrega un producto** — la FUENTE de un pack
 * (productos-tipos-digitales ENMIENDA v2, E14/E15; invariante V-I1).
 *
 * Bajo el modelo v2 un pack ES un producto más: `Product.fuenteId` apunta al producto que TIENE los
 * archivos y `Product.unidadesPorPack` dice cuántos entrega. No hay entidad «colección» nueva: la
 * colección de stickers es el producto `modalidad = SOBRE` de siempre, que bajo v2 no se vende
 * directo ni aparece en el catálogo.
 *
 * Este módulo es el ÚNICO lugar donde se decide si un `fuenteId` que llegó del cliente es admisible.
 * Existe suelto en `src/server/productos/` —como `productoEntregable.ts` y `archivosDeProducto.ts`—
 * porque sus callers previstos no comparten capa: el alta de producto del panel (F11) y la
 * resolución de la entrega en checkout/efectos post-pago (F12).
 *
 * **Las dos reglas que aplica, y por qué ninguna vive en el schema** (Prisma no expresa CHECK ni
 * uniques parciales, y un CHECK a mano sería invisible al `db push` ⇒ prohibido):
 *
 *  1. **Mismo tenant** (I1/ADR-0005). El `fuenteId` viaja del cliente, así que SELECCIONA entre los
 *     productos de la Tienda ya resuelta server-side — jamás autoriza (lección H1 de datawalt-app).
 *  2. **Sin cadenas**: la fuente no puede ser a su vez un pack. Sin esta regla habría que resolver
 *     un grafo para saber qué archivo entregar, y `muestrearPacks` tendría que multiplicar unidades
 *     entre niveles. Un nivel es todo lo que el dominio necesita (E15).
 *
 * Las dos dan el **mismo mensaje**: quien pruebe ids ajenos no puede distinguir "no existe en tu
 * Tienda" de "existe pero es un pack" (neutralidad, mismo criterio que el rechazo de opciones de
 * F07 y que el 404 de la entrega).
 *
 * ⚠ **La regla 2 NO es autosuficiente: depende de que `fuenteId` sea INMUTABLE tras crear** (V-I1c,
 * implementado como en `modalidad` — el input de actualizar no la acepta). "La fuente no es un pack
 * HOY" garantiza profundidad 1 PARA SIEMPRE solo porque nadie puede convertirla en pack después. Si
 * algún día se permitiera editar `fuenteId`, este check deja de alcanzar y hace falta además el
 * guard INVERSO sobre el producto que se edita: `packs: { none: {} }` — "no puedes volver pack a un
 * producto que ya es fuente de otros".
 *
 * **Auto-referencia** (un producto que fuera su propia fuente): imposible por construcción y por eso
 * no hay guard. En el alta el id todavía no existe cuando llega el `fuenteId`, y la inmutabilidad
 * cierra el resto. Un guard acá sugeriría que el caso está contemplado y, en el mundo donde `fuenteId`
 * fuera editable, taparía el síntoma chico dejando abierto el grande (el `packs: { none: {} }`).
 */

/** Lo que un caller necesita saber de la fuente ya validada. */
export interface FuenteResuelta {
  id: string;
  /**
   * Modalidad de la FUENTE, que es la que decide cómo se entrega el pack (V-I7): `SOBRE` ⇒
   * asignación aleatoria del pool; `ESTANDAR` ⇒ N copias derivadas en presentación. La `modalidad`
   * del pack mismo no significa nada.
   */
  modalidad: ProductMode;
}

type DbProductos = Pick<PrismaClient, "product">;

/**
 * `where` de los productos de ESTA Tienda que pueden ser FUENTE de un pack: los que entregan lo
 * suyo (`fuenteId = null`).
 *
 * Contrato del seam, en términos de SUBCONJUNTO y no de igualdad: el listado del selector del panel
 * puede ser MÁS estricto que esto (F11 le suma "que tenga archivos confirmados", porque ofrecer una
 * fuente vacía no ayuda a nadie); lo que NO puede es ofrecer algo que caiga fuera de este `where`.
 * La dirección importa — `listado ⊆ aceptado` deja al Organizador sin opciones inútiles, mientras
 * que la inversa le mostraría en el desplegable cosas que el submit rechaza.
 *
 * **`activo` NO está acá a propósito, y es load-bearing** (E17): "no quiero vender la unidad" se
 * resuelve DESPUBLICANDO ese producto, sin flag nuevo. O sea que un libro con `activo: false` tiene
 * que seguir siendo fuente válida de su pack, que sí está a la venta. Agregar `activo: true` acá
 * rompería exactamente ese caso.
 */
export function whereFuenteElegible(tenantId: string) {
  // `satisfies` y no un objeto suelto: TS no aplica excess-property-check a lo que entra por spread,
  // así que sin esto un typo (`tenatId`) compilaría y borraría el filtro de tenant EN SILENCIO.
  return { tenantId, fuenteId: null } satisfies Prisma.ProductWhereInput;
}

/**
 * Valida que `fuenteId` sea una fuente admisible de ESTA Tienda y la resuelve.
 *
 * `tenantId` lo pone el caller ya resuelto server-side (membresía o subdominio); este módulo no
 * valida de dónde salió — esa mitad vive en `resolverTenantDelPanel`/`tenantProcedure`. Lo que sí
 * garantiza es que con un `tenantId` confiable el filtro no se pueda omitir.
 */
export async function resolverFuenteDePack({
  db,
  tenantId,
  fuenteId,
}: {
  db: DbProductos;
  tenantId: string;
  fuenteId: string;
}): Promise<FuenteResuelta> {
  const fuente = await db.product.findFirst({
    // El `where` lleva las DOS condiciones duras (tenant + no-es-un-pack) para que ninguna se pueda
    // olvidar en un `if` posterior: lo que no cumple, no vuelve.
    where: { id: fuenteId, ...whereFuenteElegible(tenantId) },
    select: { id: true, modalidad: true },
  });

  if (!fuente) {
    throw new DomainError("INVALID", MENSAJE_FUENTE_INVALIDA);
  }

  return fuente;
}

/**
 * Lo mínimo que hay que haber leído de un producto para saber de dónde salen sus archivos. Se pide
 * como forma estructural (y no como `Product`) para que cada caller seleccione EXACTAMENTE estas
 * tres columnas y ni una más: la entrega no necesita ver el resto de la fila.
 */
export interface ProductoConFuente {
  modalidad: ProductMode;
  fuente: { modalidad: ProductMode } | null;
}

/**
 * Lo mismo + el `fuenteId`, que solo hace falta cuando además de saber CÓMO se entrega hay que ir a
 * buscar los archivos. La página de entrega no lo necesita (ya recibe los archivos resueltos), y
 * pedírselo la obligaría a seleccionar una columna que no usa.
 */
export interface ProductoConFuenteId extends ProductoConFuente {
  fuenteId: string | null;
}

/**
 * **De qué producto salen los archivos de esta línea, y si eso es un pool** (E15/V-I7).
 *
 * Un PACK no tiene archivos propios: entrega los de su FUENTE. Un producto normal —y una colección
 * comprada antes de la enmienda— entrega los suyos. Devuelve también la MODALIDAD del origen porque
 * es lo único que decide si hay sorteo: solo un origen `SOBRE` (un pool) se muestrea; con origen
 * `ESTANDAR` las N unidades son copias del mismo archivo, derivadas en presentación, que NO generan
 * filas (V-I2).
 *
 * **Vive acá, en una sola función, porque la respuesta tiene que ser LA MISMA en tres lugares** que
 * antes la re-derivaban cada uno por su cuenta con un ternario equivalente y un comentario pidiendo
 * que no divergieran:
 *
 *  - `aplicarEfectosPostPago` — qué se sortea al pagar.
 *  - `archivosDelGrant` — qué se puede descargar después.
 *  - `getEntregaDeOrden` — qué se le muestra al Comprador.
 *
 * Si los tres discrepan, el Comprador ve archivos que el endpoint le niega o —peor— el endpoint le
 * entrega archivos que no le tocaron. Un contrato sostenido por comentarios («tiene que dar lo
 * mismo que la otra») aguanta hasta el primer cambio apurado; siendo literalmente la misma línea,
 * no hay nada que sincronizar. Lo levantó el `backend-reviewer` al cerrar F11–F13.
 *
 * Es PURA a propósito: no toca `db`. Los tres callers ya traen el producto leído con su fuente, y
 * meter una query acá volvería a introducir la asimetría (uno consultaría, otro no).
 *
 * ⚠ Se ramifica por `fuente` y NUNCA por `producto.modalidad` cuando hay pack: en un pack esa
 * columna no significa nada (V-I7 — un pack se persiste SIEMPRE `ESTANDAR`).
 */
export function origenDeArchivos(
  productId: string,
  producto: ProductoConFuenteId,
): { productId: string; modalidad: ProductMode } {
  return producto.fuente !== null
    ? { productId: producto.fuenteId!, modalidad: producto.fuente.modalidad }
    : { productId, modalidad: producto.modalidad };
}

/**
 * `true` sii lo que entrega esta línea sale AL AZAR de un pool.
 *
 * Es la mitad de `origenDeArchivos` que responde «¿hay sorteo?» sin necesitar saber de QUÉ producto
 * salen los archivos. Comparte la regla de ramificación con ella —el mismo `fuente ?? propio`— para
 * que no exista un tercer lugar donde decidir qué modalidad manda.
 */
export function entregaAlAzar(producto: ProductoConFuente): boolean {
  return (producto.fuente ?? producto).modalidad === "SOBRE";
}

/**
 * Un solo mensaje para los tres rechazos (ajena / cadena / sí misma). Tuteo y dice qué hacer
 * (design.md §8), sin revelar si el id existe en otra Tienda.
 */
const MENSAJE_FUENTE_INVALIDA =
  "El producto del que quieres sacar los archivos no está disponible. " +
  "Elige uno de tu catálogo que tenga sus propios archivos.";
