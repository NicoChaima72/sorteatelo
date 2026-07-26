import {
  type CheckoutFieldType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { type ListarVentasInput } from "~/server/domain/panel/schemas";

/** Filas por página del listado de ventas (backend-conventions § Paginación por cursor). */
const PAGE_SIZE = 15;

/**
 * Orden TOTAL de las colecciones del detalle de una venta (F06). Ninguna de las dos tablas tiene
 * columna de orden propia, y las filas de una misma compra se insertan en una sola sentencia ⇒
 * comparten `createdAt` al milisegundo. Sin el desempate por `id`, Postgres podría devolverlas
 * barajadas entre refetches y el Organizador vería el detalle reordenándose solo.
 *
 * En la práctica reproduce el orden del form: las respuestas se congelan recorriendo las
 * DEFINICIONES en su `posicion` (`validarRespuestasDeCheckout`), y el `id` cuid desempata en ese
 * mismo orden de inserción. Eso es una consecuencia agradable, no el contrato: el contrato es que
 * el orden sea estable.
 *
 * Tipado como la INTERSECCIÓN de los dos `OrderBy` generados, en vez de un tipo estructural escrito
 * a mano: una sola constante para las dos tablas es lo que garantiza que el detalle no se ordene de
 * dos maneras, y la intersección hace que renombrar cualquiera de las dos columnas en CUALQUIERA de
 * los dos modelos rompa la compilación acá. Un `{ createdAt?: "asc" }` a mano compilaría feliz
 * contra un schema que ya no tiene esa columna.
 */
const ORDEN_DEL_DETALLE: Prisma.OrderItemOrderByWithRelationInput[] &
  Prisma.CheckoutFieldResponseOrderByWithRelationInput[] = [
  { createdAt: "asc" },
  { id: "asc" },
];

/**
 * Selección de UNA venta con su detalle. Compartida por las dos superficies que leen ventas —el
 * listado paginado del panel (F06) y el export CSV (F07)— para que no puedan divergir en QUÉ se lee
 * de una venta. Mismo criterio que `SELECCION_CAMPO_DEL_CHECKOUT` en `camposCheckout`: cuando dos
 * puertas leen el mismo dato, el `select` es una constante y no dos literales parecidos.
 *
 * Del snapshot se lee lo congelado, sin `fieldId`: quien mira una venta mira lo que pasó, no la
 * definición de hoy (D2/I4).
 */
export const SELECCION_DE_VENTA = {
  id: true,
  email: true,
  estado: true,
  total: true,
  createdAt: true,
  items: {
    orderBy: ORDEN_DEL_DETALLE,
    select: {
      cantidad: true,
      precio: true,
      product: { select: { titulo: true } },
    },
  },
  checkoutResponses: {
    orderBy: ORDEN_DEL_DETALLE,
    select: { clave: true, etiqueta: true, tipo: true, valor: true },
  },
  payment: { select: { fee: true, estado: true } },
} satisfies Prisma.OrderSelect;

/** Una línea de la compra, con el precio UNITARIO congelado al comprar (I4/ADR-0012). */
export interface ItemDeVenta {
  titulo: string;
  cantidad: number;
  /** Precio unitario como string `Decimal`; la UI formatea con Intl y NUNCA multiplica. */
  precio: string;
}

/**
 * Una Respuesta de checkout del snapshot de la orden (D2/F06). Se lee lo CONGELADO —la `etiqueta`
 * que el Comprador leyó y el `tipo` con el que respondió—, jamás la definición viva: renombrar o
 * borrar un Campo no reescribe la historia (I4/D5).
 *
 * El `valor` viaja CANÓNICO (`"true"`/`"false"`, entero base 10, la opción exacta). Humanizarlo es
 * cosa de cada consumidor: la UI muestra «Sí», el CSV exporta lo que se pueda sumar.
 */
export interface RespuestaDeVenta {
  clave: string;
  etiqueta: string;
  tipo: CheckoutFieldType;
  valor: string;
}

/**
 * Fila cruda de `SELECCION_DE_VENTA`. Se deriva del `select` (no se escribe a mano) para que
 * agregarle una columna a la selección obligue a contemplarla acá.
 */
type FilaDeVenta = Prisma.OrderGetPayload<{
  select: typeof SELECCION_DE_VENTA;
}>;

export interface VentaDelPanel {
  id: string;
  email: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  /** Montos como string `Decimal` (nunca `number` en el server); UI formatea con Intl. */
  total: string;
  /** Comisión de Flow (cruda, del getStatus). null si la orden no está pagada. */
  comision: string | null;
  /** Neto al vendedor = total − comisión (Decimal). null si no está pagada. */
  neto: string | null;
  items: ItemDeVenta[];
  /** Vacía en las órdenes previas a la feature y en las Tiendas sin campos (I9). */
  respuestas: RespuestaDeVenta[];
  createdAt: Date;
}

/**
 * Fila de DB → venta del panel. Acá vive la única aritmética de dinero de la lectura de ventas
 * (`neto = total − fee`, con `Decimal`, I4/I8) y el cruce a string; el cliente formatea y NUNCA
 * multiplica. Compartida con el export CSV (F07) por la misma razón que `SELECCION_DE_VENTA`: el
 * archivo exporta EXACTAMENTE las filas que el panel lista (D9), no una segunda versión de ellas.
 */
export function aVentaDelPanel(o: FilaDeVenta): VentaDelPanel {
  const pagada = o.estado === "PAGADO";
  const fee = pagada ? (o.payment?.fee ?? null) : null;
  return {
    id: o.id,
    email: o.email,
    estado: o.estado,
    total: o.total.toFixed(0),
    comision: fee ? fee.toFixed(0) : null,
    neto: fee ? o.total.minus(fee).toFixed(0) : null,
    items: o.items.map((it) => ({
      titulo: it.product.titulo,
      cantidad: it.cantidad,
      precio: it.precio.toFixed(0),
    })),
    respuestas: o.checkoutResponses,
    createdAt: o.createdAt,
  };
}

/**
 * Use case del panel (F03 del roadmap SaaS, `tasks/26-07-16-saas-roadmap.md`): lista las ventas
 * (órdenes) de la Tienda del Organizador, paginadas por cursor. El `tenantId` se resuelve
 * SERVER-SIDE desde `acceso` (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`.
 *
 * Orden total estable `[createdAt desc, id desc]` (el `id` cuid desempata para que el cursor
 * no repita/saltee en los empates de fecha). El neto = `total − Payment.fee` se calcula con
 * `Decimal` server-side (I4) y viaja como string; nunca aritmética con `number`.
 *
 * Cada fila trae además su DETALLE (F06 de `tasks/26-07-25-checkout-campos-configurables.md`): los
 * ítems con cantidad + precio unitario congelado, y las
 * Respuestas de checkout del snapshot. Van EAGER y no en una query aparte por venta a propósito:
 * son ≤10 respuestas por orden sobre una página de 15, el detalle abre sin spinner, y —lo que
 * decide— no aparece una segunda superficie que haya que volver a scopear por tenant (I1/I7). Todo
 * cuelga de la Order ya filtrada.
 */
export async function listarVentas({
  db,
  acceso,
  input,
  pageSize = PAGE_SIZE,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ListarVentasInput;
  pageSize?: number;
}): Promise<{ items: VentaDelPanel[]; nextCursor: string | null }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const rows = await db.order.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    // Las Respuestas cuelgan de una Order que el `where` de arriba ya filtró por tenant: el
    // aislamiento del dato más sensible de la feature (PII del Comprador, I7) es por CONSTRUCCIÓN,
    // no una condición extra que se pueda olvidar.
    select: SELECCION_DE_VENTA,
  });

  let nextCursor: string | null = null;
  if (rows.length > pageSize) {
    rows.pop(); // descarta la fila extra
    nextCursor = rows[rows.length - 1]!.id;
  }

  return { items: rows.map(aVentaDelPanel), nextCursor };
}
