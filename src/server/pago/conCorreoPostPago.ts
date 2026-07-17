import { type ConfirmarPagoFn } from "~/server/pago/webhookFlow";

/**
 * Decorator POST-COMMIT del correo de descarga (F04/D1/D2). Envuelve un `ConfirmarPagoFn` (el use
 * case `confirmarPagoDeOrden`) y, DESPUÉS de que resolvió (la `$transaction` de confirmación ya
 * commiteó y los tokens de los grants existen de verdad), dispara el envío del correo — SOLO en la
 * transición real a PAGADO y una sola vez.
 *
 * Por qué un decorator en el borde y no dentro del use case (I5):
 * - El núcleo `webhookFlow.ts`, `confirmarPagoDeOrden` y el contrato `EfectosPostPago` quedan
 *   INTACTOS. La política "solo en la transición, una vez" ya la resuelve el resultado del use case
 *   (`{ yaProcesado, transicion }`), así que el decorator solo la lee.
 *
 * Invariantes:
 * - **I1 (la venta es lo primario)**: el envío va en `try/catch` LOG-AND-CONTINUE. Un fallo de
 *   Resend (red, cuota, 403/500) JAMÁS revierte la venta ni cambia la respuesta del webhook: la
 *   orden queda PAGADA, los grants creados, y el `ConfirmarPagoFn` devuelve su resultado igual
 *   (⇒ el webhook responde 200). La red de seguridad ante un fallo es el reenvío manual (F03).
 * - **I2 (una vez)**: envía SOLO cuando `transicion === "PAGADO" && !yaProcesado`. Los replays
 *   idempotentes del webhook (`yaProcesado`) y las transiciones a FALLIDO NO envían nada.
 * - **I3 (secretos/tokens/email fuera de logs)**: si el envío falla, se loguea el `orderId` (no es
 *   secreto, mismo criterio que el log del skip de raffle en F02) y el mensaje del error del
 *   adapter (que incluye status pero nunca la API key) — NUNCA el token del grant ni el email del
 *   Comprador.
 */
export function conCorreoPostPago(
  confirmarPago: ConfirmarPagoFn,
  enviarCorreoDescarga: (orderId: string) => Promise<unknown>,
): ConfirmarPagoFn {
  return async (input) => {
    const resultado = await confirmarPago(input);

    if (resultado.transicion === "PAGADO" && !resultado.yaProcesado) {
      try {
        await enviarCorreoDescarga(input.commerceOrder);
      } catch (e) {
        // Log-and-continue (I1): el correo es secundario a la venta. Sin token ni email (I3).
        const detalle = e instanceof Error ? e.message : "error desconocido";
        console.error(
          `[correo-post-pago] No se pudo enviar el correo de descarga de la orden ` +
            `${input.commerceOrder}: ${detalle}. La venta quedó confirmada; usar el reenvío del panel.`,
        );
      }
    }

    return resultado;
  };
}
