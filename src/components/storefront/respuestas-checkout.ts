import { type CampoDelCheckout } from "~/server/domain/camposCheckout/camposActivos";

/**
 * Helpers PUROS del form dinámico del checkout (F04,
 * tasks/26-07-25-checkout-campos-configurables). Viven al lado del componente y no dentro de él
 * (patrón `url-tienda.ts` del panel) para que sean testeables sin renderizar.
 *
 * Son el ESPEJO de cliente, no la verdad: la validación que decide si una Orden nace es la del
 * server, recontada contra la definición vigente dentro de la `$tx` (I3/F05). Acá solo evitamos
 * que el Comprador viaje hasta Flow para enterarse de que le faltó un campo.
 *
 * Nota de import: el `type` de `~/server/...` se borra en compilación (mismo patrón que
 * `MutacionPagina` en los paneles del editor) — no arrastra código de servidor al bundle.
 */

/**
 * Valor de una respuesta EN EL FORM (no en la DB). Es la unión de lo que devuelven los inputs de
 * Mantine que usa el checkout: `string` (TextInput), `string | number` (NumberInput, que emite `""`
 * cuando está vacío), `boolean` (Checkbox) y `string | null` (Select).
 *
 * El `null` del Select no viene de un botón de limpiar (no usamos `clearable`) sino de la
 * DESELECCIÓN: `allowDeselect` es `true` por defecto en Mantine 7, así que volver a hacer clic sobre
 * la opción ya elegida emite `null`. Es gratis de provocar y por eso hay que contemplarlo.
 *
 * El valor CANÓNICO de la DB —siempre `string`— lo produce el server al congelar el snapshot
 * (F01/D2), nunca el cliente.
 */
export type ValorRespuesta = string | number | boolean | null;

/**
 * Valores del form del checkout. El correo vive FUERA de `respuestas` a propósito (I2/ADR-0004):
 * no es un Campo de checkout, es la identidad del Comprador y viaja en su propio campo del input
 * (`Order.email`). Meterlo en el mismo diccionario invitaría a tratarlo como uno más.
 */
export interface ValoresCheckout {
  email: string;
  /**
   * Consentimiento de recordatorios del sorteo (F05/D5). Vive FUERA de `respuestas` a propósito:
   * es de PLATAFORMA, no un [[Campo de checkout]] que el Organizador pueda editar, desactivar o
   * volver obligatorio. Arranca `false` siempre — la casilla premarcada está prohibida.
   */
  aceptaRecordatorios: boolean;
  /** Indexado por `clave` del campo — la misma llave con la que se congela el snapshot (D2). */
  respuestas: Record<string, ValorRespuesta>;
}

/**
 * Estado inicial del form para los campos de la Tienda.
 *
 * La única regla real acá es D4: un CHECKBOX arranca en `defaultMarcado` porque su respuesta
 * SIEMPRE existe (es un dato booleano, no algo que pueda "faltar"); el Comprador que no lo toca
 * igual está respondiendo. Los demás tipos arrancan vacíos (`""`, que es también el vacío que
 * espera `NumberInput`).
 *
 * Sin campos ⇒ `{}` ⇒ el form queda exactamente como el de hoy (I9).
 */
export function valoresInicialesDeCampos(
  campos: CampoDelCheckout[],
): Record<string, ValorRespuesta> {
  const valores: Record<string, ValorRespuesta> = {};
  for (const campo of campos) {
    valores[campo.clave] =
      campo.tipo === "CHECKBOX" ? campo.defaultMarcado : "";
  }
  return valores;
}

/**
 * Errores del espejo de cliente, indexados por `clave` (la forma que espera el `validate` de
 * `@mantine/form` para el sub-objeto `respuestas`). Solo chequea lo que el Comprador puede
 * arreglar SIN adivinar: que respondió lo obligatorio. Los rechazos por TIPO (SELECT fuera de
 * opciones, NUMERO no entero, TEXTO largo) los pone el server contra la definición vigente (I3)
 * — replicarlos acá sería mantener dos verdades.
 */
export function erroresDeCampos(
  campos: CampoDelCheckout[],
  valores: Record<string, ValorRespuesta>,
): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const campo of campos) {
    if (!campo.obligatorio) continue;
    if (estaVacia(valores[campo.clave])) {
      // Mismo verbo que el mensaje del server para el mismo fracaso (`validarRespuestas.ts`): el
      // Comprador no tiene por qué leer dos redacciones de lo mismo según quién lo haya detectado.
      errores[campo.clave] = "Completa este dato para continuar.";
    }
  }
  return errores;
}

/**
 * Una respuesta "vacía" es la que el Comprador no dio: ausente, `null` (Select limpiado) o texto en
 * blanco. `false` y `0` NO son vacíos — son respuestas (campos.form.003).
 */
function estaVacia(valor: ValorRespuesta | undefined): boolean {
  return (
    valor === undefined ||
    valor === null ||
    (typeof valor === "string" && valor.trim() === "")
  );
}

/**
 * Los valores del form, en la forma que viaja al server: una lista `{clave, valor}` (F05).
 *
 * Manda TODO lo que el form tenga, sin filtrar los vacíos: qué cuenta como respuesta lo decide el
 * server contra la definición vigente (I3). Un `false` de CHECKBOX es una respuesta (D4) y un texto
 * vacío el server lo lee como "sin responder" — si el cliente filtrara, estaría opinando sobre algo
 * que no le toca, y un CHECKBOX desmarcado sería lo primero en desaparecer.
 */
export function respuestasParaEnviar(
  valores: Record<string, ValorRespuesta>,
): Array<{ clave: string; valor: ValorRespuesta }> {
  return Object.entries(valores).map(([clave, valor]) => ({ clave, valor }));
}
