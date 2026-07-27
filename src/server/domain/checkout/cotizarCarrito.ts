import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Use case de dominio: **cotiza el carrito del Comprador** (display-only).
 *
 * Existe para que el drawer del carrito y el resumen del checkout puedan MOSTRAR el total sin que el
 * cliente sume ni multiplique un peso (I2 / CLAUDE.md § Regla de oro). El carrito vive en el
 * `localStorage` del navegador (ADR-0004) y guarda un `precio` que es solo un rótulo: acá se releen
 * los precios VIGENTES de la DB y se hace toda la aritmética en `Decimal` server-side, igual que
 * `iniciarCheckout`. Si el Organizador cambió el precio mientras el carrito dormía, manda la DB.
 *
 * `tenantId` viene del contexto (subdominio, I1 / ADR-0005), NUNCA del input: un `productId` de otra
 * Tienda no vuelve del `findMany` y por lo tanto no cotiza. Es el mismo aislamiento por construcción
 * que usa `iniciarCheckout`.
 *
 * **Esto NO es una promesa de cobro y no autoriza nada**: no crea `Order`, no toca Flow, no escribe.
 * El monto que se cobra lo sigue calculando `iniciarCheckout` dentro de su `$transaction`, releyendo
 * las mismas filas — esta query es el espejo de lectura de esa cuenta, no una segunda verdad.
 */
import {
  datosEntregableDeFila,
  esProductoEntregable,
  SELECCION_PRODUCTO_ENTREGABLE,
  seVendeDirecto,
} from "~/server/productos/productoEntregable";

export interface LineaCotizada {
  productId: string;
  titulo: string;
  /** Portada pública del producto (`null` ⇒ la UI degrada al gradiente de marca, design.md §5.2). */
  portadaUrl: string | null;
  /**
   * Precio UNITARIO vigente como string de `Decimal` (CLP entero). Viaja como string y no como
   * `number` a propósito: `clp()` lo consume tal cual y ningún borde queda invitando a sumarlo.
   */
  precioUnitario: string;
  /** La cantidad que se cotizó (eco del input, ya validada por Zod). */
  cantidad: number;
  /** `precioUnitario × cantidad`, calculado en `Decimal` server-side. */
  subtotal: string;
  /** Cuántas unidades entrega UNA unidad; `1` en un producto normal. Display-only. */
  unidadesPorPack: number;
}

export interface CotizacionCarrito {
  /**
   * Las líneas COTIZABLES, en el orden del input. Un ítem que hoy no se puede comprar —inexistente,
   * de otra Tienda, inactivo, una colección o un pack cuyo pool ya no alcanza— **no aparece**: la
   * ausencia ES el reporte (D3), y la UI marca ese ítem como no disponible. No hay lista paralela de
   * descartados justamente para no tener dos fuentes de verdad que se desincronicen.
   */
  lineas: LineaCotizada[];
  /** Σ de los subtotales, en `Decimal` server-side. Solo de lo cotizable. */
  total: string;
}

export async function cotizarCarrito({
  db,
  tenantId,
  items,
}: {
  db: Pick<PrismaClient, "product">;
  tenantId: string;
  items: Array<{ productId: string; cantidad: number }>;
}): Promise<CotizacionCarrito> {
  const productos = await db.product.findMany({
    // Scoping por tenant (I1): un `productId` ajeno no matchea y desaparece de la cotización, que es
    // exactamente lo que le pasa en `iniciarCheckout` (ahí como `NOT_FOUND`).
    where: { tenantId, id: { in: items.map((i) => i.productId) } },
    select: {
      id: true,
      titulo: true,
      precio: true,
      activo: true,
      portadaUrl: true,
      // La MISMA selección que usa el checkout para decidir si una línea se puede vender (I5): la
      // modalidad, las unidades del pack y la fuente con su pool. Cotizar con una regla más laxa que
      // la del cobro mostraría un total que incluye algo que el checkout va a rechazar.
      ...SELECCION_PRODUCTO_ENTREGABLE,
    },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  const lineas: LineaCotizada[] = [];
  let total = new Prisma.Decimal(0);

  for (const { productId, cantidad } of items) {
    const producto = porId.get(productId);
    if (!producto) continue; // inexistente o de otra Tienda — indistinguibles a propósito
    if (!producto.activo) continue;
    // Una COLECCIÓN no se compra y un pack sin pool suficiente no se puede entregar: las dos reglas
    // son las de `iniciarCheckout`, importadas y no reescritas.
    if (!seVendeDirecto(producto)) continue;
    if (!esProductoEntregable(datosEntregableDeFila(producto))) continue;

    const subtotal = producto.precio.times(cantidad);
    total = total.plus(subtotal);
    lineas.push({
      productId: producto.id,
      titulo: producto.titulo,
      portadaUrl: producto.portadaUrl,
      precioUnitario: producto.precio.toFixed(0), // CLP: pesos enteros, sin decimales
      cantidad,
      subtotal: subtotal.toFixed(0),
      unidadesPorPack: producto.unidadesPorPack,
    });
  }

  return { lineas, total: total.toFixed(0) };
}
