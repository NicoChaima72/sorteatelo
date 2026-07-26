import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bloquesDeNumerosDelSorteo,
  formatearNumerosDelSorteo,
} from "~/lib/numerosDelSorteo";
import {
  claveConfirmacionCompra,
  claveRecordatorio,
  claveResultado,
} from "~/server/domain/correo/ledgerCorreos";

/**
 * Presentación de los Números del sorteo (ADR-0024 §6 / D8): al Comprador y al Organizador se les
 * habla en RANGOS («tus números son 1043–1092»), no en listas de cientos de enteros. El separador
 * es un GUION MEDIO (–, U+2013), no un hyphen.
 *
 * Es una función PURA de presentación: la comparten el panel y —cuando F03 se desbloquee— los
 * correos, para que el comprador lea exactamente lo mismo en los dos lados.
 */

describe("lib/numerosDelSorteo — formatearNumerosDelSorteo", () => {
  // numeros.formato.001 — el caso de la promesa de la landing: un bloque contiguo es UN rango
  it("un bloque contiguo se muestra como rango con guion medio", () => {
    expect(formatearNumerosDelSorteo([1043, 1044, 1045], null)).toBe("1043–1045");
  });

  // numeros.formato.002 — un solo ticket no es un rango
  it("un solo número se muestra tal cual, sin rango", () => {
    expect(formatearNumerosDelSorteo([7], null)).toBe("7");
  });

  // numeros.formato.003 — dos números consecutivos: rango, no lista (1–2 es más corto que 1, 2)
  it("dos consecutivos se muestran como rango", () => {
    expect(formatearNumerosDelSorteo([1, 2], null)).toBe("1–2");
  });

  // numeros.formato.004 — compras separadas ⇒ varios bloques: rangos y sueltos conviven
  it("bloques no contiguos se listan separados por coma, mezclando rangos y sueltos", () => {
    expect(formatearNumerosDelSorteo([3, 7, 8, 9, 15], null)).toBe("3, 7–9, 15");
  });

  // numeros.formato.005 — la entrada puede venir desordenada o con repetidos (varias órdenes
  //                       agrupadas por correo): se normaliza antes de plegar
  it("normaliza entrada desordenada y con repetidos antes de plegar los rangos", () => {
    expect(formatearNumerosDelSorteo([9, 3, 8, 7, 3], null)).toBe("3, 7–9");
  });

  // numeros.formato.006 — sin tickets ⇒ cadena vacía (el llamador decide el empty state)
  it("sin números devuelve cadena vacía", () => {
    expect(formatearNumerosDelSorteo([], null)).toBe("");
  });

  // numeros.formato.007 — los BLOQUES sueltos (F07/D10): el correo dibuja un boleto por bloque, así
  // que necesita la lista y no el string pegado. Se prueba que las dos salidas son la MISMA
  // operación — si se separan, el correo y el panel empiezan a contar distinto.
  it("expone los bloques sueltos y el string pegado sale de ellos", () => {
    expect(bloquesDeNumerosDelSorteo([3, 7, 8, 9, 15], null)).toEqual([
      "3",
      "7–9",
      "15",
    ]);
    expect(bloquesDeNumerosDelSorteo([], null)).toEqual([]);
    for (const caso of [[1, 2, 3], [5], [10, 12, 13], []]) {
      expect(bloquesDeNumerosDelSorteo(caso, null).join(", ")).toBe(
        formatearNumerosDelSorteo(caso, null),
      );
    }
  });

  // numeros.formato.008 — F08/D12: el prefijo va por BLOQUE, no a cada extremo del rango. Es la
  // regla que hace legible «ARMY-1043–1092»; repetirlo en el extremo daría «ARMY-1043–ARMY-1092»,
  // que se lee como dos boletos distintos. El «-» lo pone el FORMATEADOR: en la columna se guarda
  // `ARMY` desnudo (I12).
  it("con prefijo lo antepone a cada bloque y nunca al extremo del rango", () => {
    expect(formatearNumerosDelSorteo([3, 7, 8, 9], "ARMY")).toBe(
      "ARMY-3, ARMY-7–9",
    );
    expect(formatearNumerosDelSorteo([1043, 1044, 1045], "ARMY")).toBe(
      "ARMY-1043–1045",
    );
    expect(bloquesDeNumerosDelSorteo([3, 7, 8, 9], "ARMY")).toEqual([
      "ARMY-3",
      "ARMY-7–9",
    ]);
  });
});

/**
 * **I12 — el prefijo es PRESENTACIÓN, jamás dato** (F08/D12, sobre el seam de ADR-0024 §6).
 *
 * Es el invariante caro de la feature y el que ningún test de comportamiento alcanza: nada rompe
 * HOY si mañana alguien guarda `ARMY-1043` en `RaffleEntry.numero` o mete el prefijo en una clave
 * del ledger. Rompería DESPUÉS, y en el peor lugar posible — un cambio de prefijo se volvería una
 * migración de datos sobre números ya comunicados (promesa pública inmutable, ADR-0024 §4), y una
 * clave del ledger que dependa del prefijo cambia de identidad al editarlo ⇒ correo DUPLICADO al
 * mismo Comprador (I2).
 *
 * Por eso el guard es ESTRUCTURAL: se lee el código de los caminos de ESCRITURA y se exige que ni
 * conozcan el prefijo. Un guard de comportamiento no serviría acá: probaría el código de hoy, no la
 * regla.
 */
describe("lib/numerosDelSorteo — I12: el prefijo no toca el dato ni las claves del ledger", () => {
  const leer = (relativo: string) =>
    readFileSync(resolve(process.cwd(), relativo), "utf8");

  /** Los dos ÚNICOS caminos que emiten Números, más el arrastre y el ganador y las claves. */
  const EMISORES_DE_NUMEROS = [
    "src/server/domain/pago/aplicarEfectosPostPago.ts", // asigna el rango al confirmar el pago
    "src/server/domain/panel/crearSorteo.ts", // renumera el arrastre D13
  ];

  // numeros.formato.009 — ningún camino que ESCRIBE Números (asignación post-pago, arrastre al
  // crear un sorteo, ejecución del ganador) ni el productor de claves del ledger puede siquiera
  // nombrar el prefijo: no importan el formateador ni leen la columna.
  it("los caminos de escritura de Números y de claves del ledger no conocen el prefijo", () => {
    const escritores = [
      ...EMISORES_DE_NUMEROS,
      "src/server/domain/panel/ejecutarSorteo.ts", // congela el `ganadorNumero`
      "src/server/domain/correo/ledgerCorreos.ts", // arma las claves de idempotencia
    ];
    for (const archivo of escritores) {
      const fuente = leer(archivo);
      expect(fuente, `${archivo} no debe leer el prefijo`).not.toContain(
        "prefijoTicket",
      );
      expect(fuente, `${archivo} no debe formatear Números`).not.toContain(
        "numerosDelSorteo",
      );
    }
  });

  // numeros.formato.011 — la lista de arriba es una GREPLIST, y una greplist envejece en silencio:
  // un emisor NUEVO de Números en un archivo nuevo no estaría cubierto y nadie se enteraría (lo
  // marcó el `backend-reviewer` de F08). Así que se DESCUBRE quién crea `RaffleEntry` en todo
  // `src/server` y se exige que sean exactamente los conocidos. Un tercer emisor pone esto rojo y
  // obliga a auditarlo contra I12 antes de seguir.
  it("no hay más emisores de Números que los conocidos (la greplist no envejece sola)", () => {
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(resolve(process.cwd(), dir), {
        withFileTypes: true,
      })) {
        const ruta = `${dir}/${entrada.name}`;
        if (entrada.isDirectory()) recorrer(ruta);
        else if (entrada.name.endsWith(".ts")) archivos.push(ruta);
      }
    };
    recorrer("src/server");

    // `createMany` es la única puerta por la que nace una `RaffleEntry` (y por lo tanto un Número).
    const emisores = archivos.filter((f) =>
      leer(f).includes("raffleEntry.createMany"),
    );
    expect(emisores.sort()).toEqual([...EMISORES_DE_NUMEROS].sort());
  });

  // numeros.formato.010 — la otra mitad, por comportamiento: las claves del ledger se derivan de
  // ids y del email normalizado, así que son ESTABLES ante cualquier prefijo. Si un día alguien las
  // arma con texto de presentación, esto se pone rojo.
  it("las claves del ledger no contienen texto de presentación", () => {
    expect(claveConfirmacionCompra({ orderId: "ord_1" })).toBe("ord_1");
    expect(claveResultado({ raffleId: "raf_1", email: "Ana@X.cl" })).toBe(
      "raf_1:ana@x.cl",
    );
    expect(
      claveRecordatorio({ raffleId: "raf_1", offsetHoras: 48, email: "a@x.cl" }),
    ).toBe("raf_1:48:a@x.cl");
  });
});
