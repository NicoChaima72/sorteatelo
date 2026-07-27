import { type PrismaClient } from "@prisma/client";

/**
 * Resolver de RENDER del catálogo de una sección del page builder (F05, ADR-0016/0017). Traduce las
 * REFERENCIAS del documento (`modo` + `productoIds`) a los productos reales, SIEMPRE tenant-scoped
 * server-side (I1): el `tenantId` sale del contexto (subdominio), jamás del input. Es el simétrico
 * SILENCIOSO de `validarReferencias` (que en la mutación rechaza lo ajeno con NOT_FOUND): acá, en el
 * render, lo ajeno/inactivo se DESCARTA sin error (degradación elegante, D6).
 *
 * - `modo:'todos'` ⇒ todo el catálogo activo (equivalente a `listarProductos`).
 * - `modo:'seleccion'` ⇒ solo los `productoIds` que existen, están activos y son del tenant, EN EL
 *   ORDEN del documento; los ajenos/inactivos/inexistentes desaparecen (no error, no dato stale).
 *
 * El `precio` se devuelve como entero (CLP display-only, `Intl.NumberFormat`): NO se hace aritmética
 * con él — el monto autoritativo es `Product.precio` (Decimal) que congela iniciarCheckout (I2/I4).
 */
export interface ProductoCatalogo {
  id: string;
  titulo: string;
  descripcion: string;
  precio: number;
  portadaUrl: string | null;
  participaEnSorteo: boolean;
  /** Badge derivado (Tanda 2 F13): `true` sii `createdAt` < 30 días. Read-only; sin campo en el schema. */
  esNuevo: boolean;
  /**
   * Cuántas unidades entrega UNA unidad de este producto (ENMIENDA v2, E13/E18). `1` en un producto
   * normal; `4` en un «Pack 4 stickers». La tarjeta lo usa para un detalle derivado menor («entrega
   * 4») — NO es un precio y no participa de ninguna aritmética de plata (V-I5).
   */
  unidadesPorPack: number;
  /**
   * `true` sii lo que entrega este producto sale AL AZAR de una colección (su fuente es un SOBRE).
   * Es lo único que la tarjeta necesita saber del origen: el contenido del pool jamás se expone
   * (D10/V-I6), ni siquiera cuántos archivos tiene.
   */
  entregaAlAzar: boolean;
}

/** Ventana del badge "Nuevo" del catálogo (Tanda 2 F13). Derivado de `createdAt`, no persistido. */
const DIAS_NUEVO = 30;
const MS_NUEVO = DIAS_NUEVO * 24 * 60 * 60 * 1000;

const SELECT = {
  id: true,
  titulo: true,
  descripcion: true,
  precio: true,
  portadaUrl: true,
  participaEnSorteo: true,
  createdAt: true,
  unidadesPorPack: true,
  // De la FUENTE solo su MODALIDAD: alcanza para decir «al azar» y no filtra nada del pool (V-I6).
  fuente: { select: { modalidad: true } },
} as const;

/**
 * Una COLECCIÓN (`modalidad SOBRE`) NUNCA aparece en el catálogo (E15/E18): existe para que sus
 * packs referencien su pool, no se vende directo y el checkout la rechaza. Sacarla acá es lo que
 * evita la tarjeta fantasma con el precio de referencia que no se cobra en ninguna parte.
 *
 * Basta `modalidad` como discriminante gracias a V-I7 (un pack se persiste SIEMPRE ESTANDAR), así
 * que la condición es UNA y no `modalidad SOBRE AND fuenteId IS NULL`. Es el MISMO criterio que
 * `seVendeDirecto`, expresado como `where` porque acá sí se puede delegar a Postgres.
 */
const NO_ES_COLECCION = { modalidad: { not: "SOBRE" } } as const;

function mapear(p: {
  id: string;
  titulo: string;
  descripcion: string;
  precio: { toNumber: () => number };
  portadaUrl: string | null;
  participaEnSorteo: boolean;
  createdAt: Date;
  unidadesPorPack: number;
  fuente: { modalidad: "ESTANDAR" | "SOBRE" } | null;
}): ProductoCatalogo {
  return {
    id: p.id,
    titulo: p.titulo,
    descripcion: p.descripcion,
    precio: p.precio.toNumber(),
    portadaUrl: p.portadaUrl,
    participaEnSorteo: p.participaEnSorteo,
    unidadesPorPack: p.unidadesPorPack,
    entregaAlAzar: p.fuente?.modalidad === "SOBRE",
    // Derivado server-side (el catálogo se consume por tRPC/cliente ⇒ sin mismatch SSR): "Nuevo" si el
    // producto se creó hace menos de DIAS_NUEVO. Solo lectura sobre `createdAt`; no toca el schema Prisma.
    esNuevo: Date.now() - p.createdAt.getTime() < MS_NUEVO,
  };
}

export async function resolverCatalogo({
  db,
  tenantId,
  modo,
  productoIds,
}: {
  db: Pick<PrismaClient, "product">;
  tenantId: string;
  modo: "todos" | "seleccion";
  productoIds?: string[];
}): Promise<ProductoCatalogo[]> {
  if (modo === "seleccion") {
    const ids = productoIds ?? [];
    if (ids.length === 0) return [];
    const productos = await db.product.findMany({
      // tenant-scoped (I1); ajeno ⇒ no matchea. Una colección elegida a mano en el editor tampoco
      // aparece: se descarta en silencio, igual que lo inactivo (D6).
      where: { tenantId, activo: true, ...NO_ES_COLECCION, id: { in: ids } },
      select: SELECT,
    });
    // Respeta el orden del documento; descarta en silencio lo ajeno/inactivo/inexistente (no volvió).
    const porId = new Map(productos.map((p) => [p.id, p]));
    return ids
      .map((id) => porId.get(id))
      .filter((p): p is (typeof productos)[number] => p !== undefined)
      .map(mapear);
  }

  const productos = await db.product.findMany({
    where: { tenantId, activo: true, ...NO_ES_COLECCION },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return productos.map(mapear);
}
