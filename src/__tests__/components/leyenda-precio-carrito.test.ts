import { describe, expect, it } from "vitest";

import { leyendaPrecioUnitario } from "~/components/storefront/leyenda-precio";

/**
 * Tests de la leyenda de precio unitario del carrito (F04).
 *
 * El defecto que cierra: un libro suelto mostraba «$3.000 **por pack de 1**». Un pack de 1 no es un
 * pack — es el producto. La tarjeta del catálogo ya usaba el criterio correcto
 * (`unidadesPorPack > 1`) y el drawer/checkout usaban un truthy suelto, así que las tres superficies
 * decían cosas distintas del mismo dato. Acá vive UNA definición y la importan las tres.
 */

describe("components/storefront/leyendaPrecioUnitario (F04)", () => {
  // carrito.leyenda.001 — un producto normal dice «c/u», nunca «por pack de 1»
  it("un producto que entrega 1 unidad dice «c/u»", () => {
    expect(leyendaPrecioUnitario("3000", 1)).toBe("$3.000 c/u");
    expect(leyendaPrecioUnitario("3000", undefined)).toBe("$3.000 c/u");
    // Un `unidadesPorPack` de 0 o negativo no existe en la DB, pero si llegara del localStorage
    // editado a mano tampoco puede producir «por pack de 0».
    expect(leyendaPrecioUnitario("3000", 0)).toBe("$3.000 c/u");
  });

  // carrito.leyenda.002 — un pack de verdad (N ≥ 2) nombra su tamaño
  it("un pack de 2 o más nombra cuántas unidades entrega", () => {
    expect(leyendaPrecioUnitario("10000", 4)).toBe("$10.000 por pack de 4");
    expect(leyendaPrecioUnitario("6000", 2)).toBe("$6.000 por pack de 2");
  });

  /*
    carrito.leyenda.003 — el monto SIEMPRE pasa por `clp()`.

    Acepta el string `Decimal` del server (lo que devuelve `cotizarCarrito`) y el `number` que el
    carrito guarda en localStorage, y los formatea igual: sin esto, el drawer mostraría el total con
    separador de miles y las líneas sin él, que es exactamente el tipo de detalle que hace dudar de
    un precio.
  */
  it("formatea CLP igual venga string del server o number del localStorage", () => {
    expect(leyendaPrecioUnitario("1234567", 1)).toBe(leyendaPrecioUnitario(1234567, 1));
    expect(leyendaPrecioUnitario(1234567, 1)).toContain("1.234.567");
  });
});
