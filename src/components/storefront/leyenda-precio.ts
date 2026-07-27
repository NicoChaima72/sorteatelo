import { clp } from "~/lib/formato";

/**
 * **A qué corresponde el precio unitario de una línea del carrito** (F04).
 *
 * En un pack la "unidad" que se cobra ES EL PACK, así que decir «c/u» a secas dejaría al Comprador
 * sin saber si lleva el de 1 o el de 4 — de ahí que exista esta leyenda. Pero **un pack de 1 no es
 * un pack**: es el producto, y «$3.000 por pack de 1» confunde en vez de aclarar (defecto reportado
 * por el usuario con screenshot).
 *
 * La regla es la MISMA que ya usa la tarjeta del catálogo (`unidadesPorPack > 1`); vive acá para que
 * las tres superficies que muestran el dato —catálogo, drawer y checkout— no puedan volver a
 * decir cosas distintas del mismo producto. `>= 2` y no un truthy suelto: ese truthy es justo el bug.
 *
 * El monto pasa siempre por `clp()` y acepta las dos formas en que llega: el string `Decimal` de
 * `cotizarCarrito` (el vigente, el que manda) y el `number` que el carrito guarda en `localStorage`
 * (el rótulo con el que se pinta mientras la cotización viaja).
 */
export function leyendaPrecioUnitario(
  precio: string | number,
  unidadesPorPack: number | undefined,
): string {
  const esPack = typeof unidadesPorPack === "number" && unidadesPorPack >= 2;
  return `${clp(precio)} ${esPack ? `por pack de ${unidadesPorPack}` : "c/u"}`;
}
