import { type ConfirmarPagoFn } from "~/server/pago/webhookFlow";

/**
 * Cómo se despacha la tarea del correo (F03/I3). El borde inyecta el `waitUntil` de
 * `@vercel/functions`, que mantiene viva la función serverless hasta que la promesa resuelve SIN
 * que el webhook la espere; en tests se inyecta un recolector para poder afirmar que el ack salió
 * antes que el correo.
 */
export type ProgramarTarea = (tarea: Promise<unknown>) => void;

/**
 * Default: se despacha sin esperar. `void` + `catch` es deliberado — una promesa rechazada y sin
 * manejar tumba el proceso en Node. El error real ya lo loguea quien envía; esto es la red por si
 * el callback rompe de una forma que no previó.
 */
const enSegundoPlano: ProgramarTarea = (tarea) => {
  void tarea.catch(() => undefined);
};

/**
 * Decorator POST-COMMIT del correo de confirmación de compra (F04/D1/D2, extendido en F03).
 * Envuelve un `ConfirmarPagoFn` (el use case `confirmarPagoDeOrden`) y, DESPUÉS de que resolvió (la
 * `$transaction` de confirmación ya commiteó y los tokens de los grants existen de verdad),
 * PROGRAMA el envío del correo — SOLO en la transición real a PAGADO y una sola vez.
 *
 * **Programa, ya no espera** (F03/I3): el ack a Flow no puede colgar de la latencia de Resend. El
 * adapter tiene 8 s de timeout y Flow reintenta los webhooks lentos, así que esperar el correo
 * convertía una caída del proveedor en reintentos de pago. El despacho concreto lo decide el borde
 * (`waitUntil`); acá solo se declara el seam.
 *
 * Por qué un decorator en el borde y no dentro del use case (I5):
 * - El núcleo `webhookFlow.ts`, `confirmarPagoDeOrden` y el contrato `EfectosPostPago` quedan
 *   INTACTOS. La política "solo en la transición, una vez" ya la resuelve el resultado del use case
 *   (`{ yaProcesado, transicion }`), así que el decorator solo la lee.
 *
 * Invariantes:
 * - **I1 (la venta es lo primario)**: el envío no puede tocar la respuesta del webhook. Antes eso
 *   se lograba con un `try/catch` alrededor del `await`; ahora, además, el envío ni siquiera está
 *   en el camino de la respuesta. La orden queda PAGADA, los grants creados, y el `ConfirmarPagoFn`
 *   devuelve su resultado (⇒ 200) pase lo que pase con el correo. Las redes ante un fallo son el
 *   cron del ledger (reintenta solo) y el reenvío manual del panel.
 * - **I2 (una vez)**: programa SOLO cuando `transicion === "PAGADO" && !yaProcesado`. Los replays
 *   idempotentes del webhook (`yaProcesado`) y las transiciones a FALLIDO no programan nada. Es la
 *   primera línea contra el duplicado; la definitiva es el claim del ledger.
 * - **I3 (secretos/tokens/email fuera de logs)**: quien envía loguea el `orderId` (no es secreto) y
 *   el error del adapter (status, nunca la API key) — jamás el token del grant ni el email del
 *   Comprador. Acá solo queda la red por si el callback rompe ANTES de su propio `try`.
 */
export function conCorreoPostPago(
  confirmarPago: ConfirmarPagoFn,
  enviarCorreoDescarga: (orderId: string) => Promise<unknown>,
  programar: ProgramarTarea = enSegundoPlano,
): ConfirmarPagoFn {
  return async (input) => {
    const resultado = await confirmarPago(input);

    if (resultado.transicion === "PAGADO" && !resultado.yaProcesado) {
      // El callback se INVOCA acá (sincrónicamente) y su promesa se entrega a `programar`. Si
      // rompiera de forma síncrona —antes de devolver la promesa— se llevaría puesto el ack, que es
      // justo lo que I1 prohíbe; por eso la invocación también va protegida.
      try {
        programar(enviarCorreoDescarga(input.commerceOrder));
      } catch (e) {
        const detalle = e instanceof Error ? e.message : "error desconocido";
        console.error(
          `[correo-post-pago] No se pudo programar el correo de confirmación de la orden ` +
            `${input.commerceOrder}: ${detalle}. La venta quedó confirmada; el cron reintenta.`,
        );
      }
    }

    return resultado;
  };
}
