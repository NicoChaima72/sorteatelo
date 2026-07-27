import { describe, expect, it } from "vitest";

import {
  MAX_CANTIDAD_POR_ITEM,
  rehidratarCarrito,
  type ItemCarrito,
} from "~/components/storefront/carrito";

/**
 * Tests de la **rehidratación del carrito** desde `localStorage` (ADR-0004: el carrito del Comprador
 * es estado de cliente, sin modelo `Cart` ni sesión).
 *
 * Lo que se prueba acá no es "parsear JSON": es que **un carrito guardado por una versión anterior
 * del sitio siga funcionando**. El `localStorage` de un Comprador es un formato versionado sin
 * migración — cada campo nuevo (`cantidad` en ADR-0012, `portadaUrl` en F03) llega a navegadores que
 * tienen guardado el formato viejo, y la única alternativa a tolerarlo es vaciarle el carrito a
 * alguien que estaba por comprar.
 */

const guardado = (items: unknown) => JSON.stringify(items);

describe("components/storefront/carrito — rehidratación desde localStorage", () => {
  // carrito.rehidratar.001 (F03) — el carrito NUEVO conserva portada y unidades del pack
  it("conserva la portada y las unidades por pack que guardó la tarjeta del catálogo", () => {
    const items = rehidratarCarrito(
      guardado([
        {
          id: "p1",
          titulo: "Pack 4 stickers",
          precio: 10000,
          cantidad: 2,
          unidadesPorPack: 4,
          portadaUrl: "https://cdn.example/portada.png",
        },
      ]),
    );

    expect(items).toEqual<ItemCarrito[]>([
      {
        id: "p1",
        titulo: "Pack 4 stickers",
        precio: 10000,
        cantidad: 2,
        unidadesPorPack: 4,
        portadaUrl: "https://cdn.example/portada.png",
      },
    ]);
  });

  /*
    carrito.rehidratar.002 (F03) — el carrito VIEJO, sin las claves que no existían, no se rompe.

    Es el caso que de verdad importa: alguien que agregó productos ANTES de este deploy tiene
    guardado `{id, titulo, precio}` a secas (o con `cantidad` pero sin `portadaUrl`). Tiene que
    seguir siendo un carrito válido — la cantidad ausente vale 1 y la portada ausente simplemente no
    está (la UI degrada al gradiente de marca, y además la cotización trae la portada vigente del
    server, que es la que termina ganando).
  */
  it("un carrito guardado por la versión anterior rehidrata con defaults honestos", () => {
    const items = rehidratarCarrito(
      guardado([
        { id: "viejisimo", titulo: "El libro", precio: 3000 }, // pre-ADR-0012: ni cantidad
        { id: "viejo", titulo: "Otro", precio: 5000, cantidad: 3 }, // pre-F03: sin portada
      ]),
    );

    expect(items).toEqual<ItemCarrito[]>([
      { id: "viejisimo", titulo: "El libro", precio: 3000, cantidad: 1, unidadesPorPack: undefined, portadaUrl: undefined },
      { id: "viejo", titulo: "Otro", precio: 5000, cantidad: 3, unidadesPorPack: undefined, portadaUrl: undefined },
    ]);
  });

  // carrito.rehidratar.003 — basura de cualquier forma ⇒ carrito vacío, nunca una excepción
  it("tolera JSON corrupto, formas inesperadas e ítems incompletos", () => {
    expect(rehidratarCarrito(null)).toEqual([]);
    expect(rehidratarCarrito("")).toEqual([]);
    expect(rehidratarCarrito("{no es json")).toEqual([]);
    expect(rehidratarCarrito(guardado({ id: "no soy un array" }))).toEqual([]);
    // Ítems a los que les falta algo obligatorio (o con el tipo cambiado) se descartan uno a uno,
    // sin llevarse puestos a los sanos.
    expect(
      rehidratarCarrito(
        guardado([
          { titulo: "sin id", precio: 1 },
          { id: "sinPrecio", titulo: "x" },
          { id: "precioString", titulo: "x", precio: "3000" },
          { id: "sano", titulo: "Sano", precio: 1000, cantidad: 2 },
        ]),
      ).map((i) => i.id),
    ).toEqual(["sano"]);
  });

  /*
    carrito.rehidratar.004 — la cantidad se clampea al MISMO tope que el server (I4).

    El `localStorage` es editable a mano desde la consola del navegador. El clamp de acá no es la
    defensa (esa es el `max` de Zod en `checkout/schemas.ts`), pero sin él la UI mostraría un carrito
    de 9999 unidades que el checkout rechaza recién al apretar «Ir a pagar».
  */
  it("clampea la cantidad a [1, MAX_CANTIDAD_POR_ITEM] aunque el localStorage diga otra cosa", () => {
    const items = rehidratarCarrito(
      guardado([
        { id: "muchos", titulo: "x", precio: 1000, cantidad: 9999 },
        { id: "cero", titulo: "x", precio: 1000, cantidad: 0 },
        { id: "negativo", titulo: "x", precio: 1000, cantidad: -4 },
        { id: "fraccion", titulo: "x", precio: 1000, cantidad: 2.7 },
      ]),
    );

    expect(items.map((i) => [i.id, i.cantidad])).toEqual([
      ["muchos", MAX_CANTIDAD_POR_ITEM],
      ["cero", 1],
      ["negativo", 1],
      ["fraccion", 2],
    ]);
  });
});
