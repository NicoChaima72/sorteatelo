import { type RespuestaDeVenta } from "~/server/domain/panel/listarVentas";

/**
 * Helper PURO del detalle de venta del panel (F06,
 * tasks/26-07-25-checkout-campos-configurables). Vive al lado del componente y no dentro de él
 * (mismo patrón que `respuestas-checkout.ts` en el storefront) para que sea testeable sin renderizar.
 *
 * Nota de import: el `type` de `~/server/...` se borra en compilación — no arrastra código de
 * servidor al bundle (precedente `respuestas-checkout.ts`).
 */

/**
 * El valor de una Respuesta de checkout tal como lo lee el Organizador.
 *
 * La columna `valor` guarda el canónico y NUNCA lo humanizado (Opción A del usuario, F01): así el
 * dato sirve para todo, y cada consumidor decide cómo mostrarlo. Esta función es el consumidor
 * «pantalla»; el CSV (F07) exporta el canónico crudo a propósito, para que se pueda sumar y filtrar
 * en la planilla. Por eso la traducción vive acá y no en el server: si la hiciera el server, las
 * dos superficies quedarían atadas a la misma decisión de presentación.
 *
 * El `tipo` es el CONGELADO en el snapshot, no el de la definición de hoy: una respuesta que se dio
 * cuando el campo era otro se sigue leyendo como se dio (D2/I4).
 */
export function valorDeRespuesta({
  tipo,
  valor,
}: Pick<RespuestaDeVenta, "tipo" | "valor">): string {
  switch (tipo) {
    case "CHECKBOX":
      // D4 — una casilla siempre está respondida, así que las dos ramas son datos reales. Cualquier
      // cosa que no sea el `"true"` canónico es «No»: la función es total y no puede pintar basura.
      return valor === "true" ? "Sí" : "No";

    case "NUMERO":
    case "TEXTO":
    case "TELEFONO":
    case "SELECT":
      // El canónico YA es lo legible y la UI NO lo interpreta. En particular:
      //
      // • El TELÉFONO se congela normalizado (solo dígitos, con el `+` si venía) y acá no se le
      //   inventan espacios ni paréntesis: el server decidió deliberadamente no interpretar la
      //   numeración (sin presunción de país), y la UI no está en mejor posición para adivinarla.
      // • El NUMERO va CRUDO, sin separador de miles (decisión del usuario, F06). Es el mismo
      //   criterio: lo que una Tienda pide de verdad con este tipo son datos IDENTIFICATORIOS
      //   —código postal `8320000`, RUT sin DV `12345678`, un folio—, y es justo por ellos que F05
      //   midió el tope en DÍGITOS en vez de poner un máximo. Agruparlos («8.320.000») los pintaría
      //   como cantidades y le pediría al Organizador que desarme el formato para copiarlos.
      //   Consecuencia asumida: un conteo grande se lee sin agrupar. `num()` sigue siendo para
      //   conteos que el sistema calcula, no para un dato que el Comprador tipeó.
      return valor;
  }
}
