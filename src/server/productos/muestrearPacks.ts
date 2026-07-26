import { randomInt } from "node:crypto";

/**
 * El **sorteo del sobre**: qué archivos del pool le tocan a una compra
 * (productos-tipos-digitales F08, D4/D12).
 *
 * Función PURA con el azar INYECTADO. Que el azar sea un parámetro no es ceremonia de testing: es
 * lo único que permite forzar el peor caso (un RNG que siempre devuelve el mismo índice) y
 * demostrar que "sin repetidos dentro del pack" lo garantiza el ALGORITMO. Con el RNG adentro, ese
 * test puede pasar por suerte con un pool grande y un sampler roto — y es justo el bug que el
 * Comprador nota ("me tocaron 4 y dos son iguales").
 *
 * Las dos reglas de D4, que no son la misma:
 * - **Dentro de un pack, sin repetir**: se muestrea SIN REEMPLAZO (Fisher-Yates parcial sobre una
 *   copia del pool). Postgres lo respalda con `@@unique([orderItemId, packOrdinal, productFileId])`,
 *   pero acá no se depende de esa red: violarla ABORTA la `$tx` de una orden ya pagada.
 * - **Entre packs, puede repetir**: cada pack vuelve a muestrear el pool COMPLETO. El pool no es
 *   stock que se agote — es digital, y el pack de al lado no compite por los mismos archivos.
 *
 * Si el pool es más corto que el pack, devuelve SOLO lo que alcanza (nunca completa con repetidos:
 * eso rompería la regla que sí es dura). Qué hacer con esa muestra corta lo decide el caller: acá
 * no se sabe si eso es "imposible por el gate del checkout" o "una orden que hay que cumplir igual".
 */

export interface CoordenadaDeAsignacion {
  /** Cuál de los packs de la línea (0..cantidad-1). */
  packOrdinal: number;
  /** Qué unidad dentro de ESE pack (0..unidadesPorPack-1). */
  unidadOrdinal: number;
  productFileId: string;
}

/**
 * Entero aleatorio en `[0, max)` con el CSPRNG del sistema (D12: la asignación es plata del
 * Comprador, no un `Math.random`). `randomInt` de `node:crypto` es uniforme y sin sesgo de módulo.
 */
function aleatorioCriptografico(max: number): number {
  return randomInt(max);
}

export function muestrearPacks({
  pool,
  unidadesPorPack,
  cantidad,
  aleatorio = aleatorioCriptografico,
}: {
  /** Ids de los `ProductFile` CONFIRMADOS del producto. El caller garantiza que son de ESE producto. */
  pool: string[];
  unidadesPorPack: number;
  cantidad: number;
  /** Devuelve un entero en `[0, max)`. Inyectable solo para tests; en producción es el CSPRNG. */
  aleatorio?: (max: number) => number;
}): CoordenadaDeAsignacion[] {
  const coordenadas: CoordenadaDeAsignacion[] = [];
  const porPack = Math.min(unidadesPorPack, pool.length);

  for (let packOrdinal = 0; packOrdinal < cantidad; packOrdinal += 1) {
    // Copia FRESCA del pool por pack: es lo que hace que los packs sean independientes entre sí.
    const restantes = [...pool];
    for (let unidadOrdinal = 0; unidadOrdinal < porPack; unidadOrdinal += 1) {
      // Fisher-Yates parcial: se elige un índice de lo que queda y se SACA de la bolsa, así el
      // mismo archivo no puede volver a salir en este pack por más que el RNG insista.
      const i = aleatorio(restantes.length);
      const [elegido] = restantes.splice(i, 1);
      coordenadas.push({
        packOrdinal,
        unidadOrdinal,
        productFileId: elegido!,
      });
    }
  }

  return coordenadas;
}
