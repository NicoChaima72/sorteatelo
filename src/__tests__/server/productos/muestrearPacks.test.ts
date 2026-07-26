import { describe, expect, it } from "vitest";

import { muestrearPacks } from "~/server/productos/muestrearPacks";

/**
 * Tests del SAMPLER del sobre sorpresa (productos-tipos-digitales F08, D4/D12): qué archivos del
 * pool le tocan a una compra.
 *
 * Es una función PURA con el azar inyectado, y por eso se puede testear de verdad. Con el RNG real
 * adentro, "no hay repetidos en el pack" es un test que **puede pasar por suerte** con un pool
 * grande y un sampler roto — que es exactamente el bug más fácil de escribir acá y el único que el
 * Comprador NOTA ("me tocaron 4 y dos son iguales"). Con el azar inyectado se puede forzar el peor
 * caso: un RNG que SIEMPRE devuelve el mismo índice.
 *
 * La red final igual está en Postgres (`@@unique([orderItemId, packOrdinal, productFileId])`,
 * `sobre.schema.004`): estos tests cubren que el sampler no dependa de esa red para ser correcto.
 */

const POOL = ["f1", "f2", "f3", "f4", "f5"];

/** RNG determinista: devuelve la secuencia dada (módulo el rango pedido) para fijar la muestra. */
function rngSecuencia(valores: number[]) {
  let i = 0;
  return (max: number) => {
    const v = valores[i % valores.length]!;
    i += 1;
    return v % max;
  };
}

describe("productos/muestrearPacks (sampler del sobre, puro)", () => {
  // productos.muestra.001 — la forma: una coordenada por unidad de cada pack, sin huecos
  it("devuelve exactamente unidadesPorPack × cantidad coordenadas, completas y sin huecos", () => {
    const muestra = muestrearPacks({
      pool: POOL,
      unidadesPorPack: 3,
      cantidad: 2,
      aleatorio: rngSecuencia([0]),
    });

    expect(muestra).toHaveLength(6);
    // Las coordenadas son EXACTAMENTE el producto cartesiano pack × unidad: si faltara una, el
    // Comprador recibiría menos archivos de los que pagó.
    expect(
      muestra.map((a) => `${a.packOrdinal}-${a.unidadOrdinal}`).sort(),
    ).toEqual(["0-0", "0-1", "0-2", "1-0", "1-1", "1-2"]);
  });

  // productos.muestra.002 — D4: sin repetidos DENTRO del pack, aun con el peor RNG posible
  it("nunca repite un archivo dentro del mismo pack, ni con un RNG que siempre devuelve el mismo índice", () => {
    // Un RNG constante es el peor caso: un sampler ingenuo ("elegí un índice al azar N veces")
    // devolvería el MISMO archivo las 4 veces.
    const muestra = muestrearPacks({
      pool: POOL,
      unidadesPorPack: 4,
      cantidad: 1,
      aleatorio: () => 0,
    });

    const archivos = muestra.map((a) => a.productFileId);
    expect(new Set(archivos).size).toBe(4);
  });

  // productos.muestra.003 — D4: entre packs distintos SÍ puede repetirse (cada pack samplea el
  // pool COMPLETO, independiente — es digital, no hay stock que se agote)
  it("puede repetir el mismo archivo entre packs distintos", () => {
    // Pool de UN archivo y dos packs de 1: la única muestra posible repite entre packs. Si el
    // sampler tratara el pool como stock que se consume, el segundo pack se quedaría sin nada.
    const muestra = muestrearPacks({
      pool: ["unico"],
      unidadesPorPack: 1,
      cantidad: 2,
      aleatorio: () => 0,
    });

    expect(muestra).toHaveLength(2);
    expect(muestra.map((a) => a.productFileId)).toEqual(["unico", "unico"]);
    expect(muestra.map((a) => a.packOrdinal)).toEqual([0, 1]);
  });

  // productos.muestra.004 — pool == unidades ⇒ el pack se lleva TODO el pool (una permutación)
  it("con el pool justo, cada pack se lleva todos los archivos exactamente una vez", () => {
    const muestra = muestrearPacks({
      pool: ["a", "b", "c"],
      unidadesPorPack: 3,
      cantidad: 2,
      aleatorio: rngSecuencia([2, 1, 0, 1, 0, 2]),
    });

    for (const packOrdinal of [0, 1]) {
      const delPack = muestra
        .filter((a) => a.packOrdinal === packOrdinal)
        .map((a) => a.productFileId);
      expect([...delPack].sort()).toEqual(["a", "b", "c"]);
    }
  });

  // productos.muestra.005 — el azar se USA: dos RNG distintos dan muestras distintas (si no, el
  // "sorteo" sería un orden fijo y el primer archivo del pool le tocaría siempre a todo el mundo)
  it("la muestra depende del azar y no es un orden fijo del pool", () => {
    const conRng = (valores: number[]) =>
      muestrearPacks({
        pool: POOL,
        unidadesPorPack: 2,
        cantidad: 1,
        aleatorio: rngSecuencia(valores),
      }).map((a) => a.productFileId);

    expect(conRng([0, 0])).not.toEqual(conRng([4, 3]));
  });

  // productos.muestra.006 — el pool corto NO se completa con repetidos: se devuelve lo que alcanza
  // (la decisión de qué hacer con eso es del caller, F08)
  it("con el pool más corto que el pack devuelve solo lo que alcanza, sin repetir dentro del pack", () => {
    const muestra = muestrearPacks({
      pool: ["a", "b"],
      unidadesPorPack: 4,
      cantidad: 1,
      aleatorio: () => 0,
    });

    expect(muestra).toHaveLength(2);
    expect(new Set(muestra.map((a) => a.productFileId)).size).toBe(2);
    // Los ordinales siguen siendo 0..n-1 contiguos: nunca se inventa una coordenada vacía.
    expect(muestra.map((a) => a.unidadOrdinal)).toEqual([0, 1]);
  });
});
