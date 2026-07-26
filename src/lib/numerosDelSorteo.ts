/**
 * Presentación de los **Números del sorteo** (CONTEXT § Número del sorteo, ADR-0024 §6 / D8 / D12).
 *
 * Un comprador con 50 tickets tiene 50 enteros, pero lo que se le dice es «tus números son
 * 1043–1092». Los dos writers de producción emiten BLOQUES CONTIGUOS por orden, así que plegar en
 * rangos es la forma natural —y compacta— de mostrarlos. Varias compras del mismo correo dan varios
 * bloques: `3, 7–9, 15`.
 *
 * Función PURA, sin dependencias. Es el **punto ÚNICO de presentación** de los Números: la usan el
 * panel del Organizador (columna Números, `Nº` del ganador, notification de ejecución) y las
 * plantillas de correo al Comprador (F03+), para que los dos lean EXACTAMENTE el mismo texto. Toda
 * superficie futura (verificador público de tickets, retorno post-pago) tiene que pasar por acá.
 *
 * ── El prefijo de ticket (F08/D12, invariante I12) ────────────────────────────────────────────
 * `Tenant.prefijoTicket` es PRESENTACIÓN, jamás dato: `RaffleEntry.numero` sigue siendo un entero
 * puro (ADR-0024), el prefijo no se persiste junto al número ni entra en las claves del ledger de
 * correos. Por eso se aplica acá y solo acá, y por eso el parámetro es OBLIGATORIO en las dos
 * funciones: un `?` opcional dejaría que una superficie nueva se olvidara de pasarlo y mostrara
 * `1043` donde otra muestra `ARMY-1043` — exactamente el desalineamiento que I12 existe para
 * impedir. Quien de verdad no quiere prefijo pasa `null` y lo dice en voz alta.
 */

/** Guion medio (U+2013), no hyphen: es un rango tipográfico, no una resta. */
const GUION_MEDIO = "–";

/** Separador entre bloques. Vive acá porque es parte del formato, no del gusto del llamador. */
const SEPARADOR = ", ";

/**
 * Separador entre el prefijo y el número (`ARMY` + `-` + `1043`). Vive en el FORMATEADOR y no en el
 * dato (D12): la columna guarda `ARMY` desnudo, así que nadie tiene que acordarse de escribir el
 * guion al configurarlo ni hay dos tiendas con `ARMY` y `ARMY-` guardados distinto.
 *
 * Es un hyphen ASCII a propósito, distinto del GUION_MEDIO del rango: son dos signos con dos
 * trabajos (`ARMY-1043–1092` = prefijo + rango) y confundirlos borraría esa distinción.
 */
const SEPARADOR_PREFIJO = "-";

/**
 * Los BLOQUES contiguos ya plegados, uno por elemento (`["3", "7–9", "15"]`, o
 * `["ARMY-3", "ARMY-7–9"]` con prefijo).
 *
 * Existe porque hay un consumidor que necesita los bloques por separado y no el string entero: el
 * correo los dibuja **como boletos** (F07/D10, un boleto por bloque). Antes ese consumidor partía la
 * salida de `formatearNumerosDelSorteo` por `", "`, lo que ataba dos módulos por un separador que
 * ninguno declaraba — si el formato cambiaba, el correo se rompía en silencio. Ahora el plegado
 * tiene UNA definición y las dos presentaciones cuelgan de ella.
 *
 * El prefijo se antepone **por bloque**, nunca a cada extremo del rango: `ARMY-1043–1092` es un
 * boleto con su rango; `ARMY-1043–ARMY-1092` se leería como dos boletos sueltos.
 */
export function bloquesDeNumerosDelSorteo(
  numeros: number[],
  /** `Tenant.prefijoTicket` — `null`/vacío ⇒ salida byte-idéntica a la de antes de F08. */
  prefijo: string | null,
): string[] {
  if (numeros.length === 0) return [];

  const ordenados = [...new Set(numeros)].sort((a, b) => a - b);
  // Vacío tratado como ausente: la columna es `String?` y el borde normaliza "" ⇒ null, pero acá
  // corre dato de DB que existe desde antes y no vale la pena que dependa de eso.
  const marca = prefijo ? `${prefijo}${SEPARADOR_PREFIJO}` : "";

  const bloques: string[] = [];
  let inicio = ordenados[0]!;
  let previo = inicio;

  const cerrarBloque = () => {
    bloques.push(
      inicio === previo
        ? `${marca}${inicio}`
        : `${marca}${inicio}${GUION_MEDIO}${previo}`,
    );
  };

  for (const numero of ordenados.slice(1)) {
    if (numero === previo + 1) {
      previo = numero; // el bloque sigue siendo contiguo
      continue;
    }
    cerrarBloque();
    inicio = numero;
    previo = numero;
  }
  cerrarBloque();

  return bloques;
}

/**
 * Pliega una lista de Números del sorteo en su presentación compacta en rangos.
 * Normaliza la entrada (ordena y deduplica), así que acepta los números tal como salgan de agrupar
 * varias órdenes por correo. Sin números devuelve `""` — el empty state lo decide el llamador.
 */
export function formatearNumerosDelSorteo(
  numeros: number[],
  /** `Tenant.prefijoTicket` — `null`/vacío ⇒ salida byte-idéntica a la de antes de F08. */
  prefijo: string | null,
): string {
  return bloquesDeNumerosDelSorteo(numeros, prefijo).join(SEPARADOR);
}
