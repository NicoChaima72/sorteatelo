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
} as const;

function mapear(p: {
  id: string;
  titulo: string;
  descripcion: string;
  precio: { toNumber: () => number };
  portadaUrl: string | null;
  participaEnSorteo: boolean;
  createdAt: Date;
}): ProductoCatalogo {
  return {
    id: p.id,
    titulo: p.titulo,
    descripcion: p.descripcion,
    precio: p.precio.toNumber(),
    portadaUrl: p.portadaUrl,
    participaEnSorteo: p.participaEnSorteo,
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
      where: { tenantId, activo: true, id: { in: ids } }, // tenant-scoped (I1); ajeno ⇒ no matchea
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
    where: { tenantId, activo: true },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return productos.map(mapear);
}
