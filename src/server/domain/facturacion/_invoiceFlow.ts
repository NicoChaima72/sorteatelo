import { type PlatformInvoiceStatus } from "@prisma/client";

import {
  FLOW_PAGO_PAGADO,
  type FlowInvoice,
} from "~/server/services/flowPlataforma";

/**
 * Núcleo PURO del espejo de invoices de Flow (F04, D4/D15, ADR-0026). Sin DB ni red: el webhook
 * carga el invoice ya VERIFICADO server-side contra la API de Flow (I3) y este módulo decide qué
 * estado le corresponde en nuestro ledger.
 *
 * ── Reescrito por el blocker 5 de la 4ª pasada del E2E ────────────────────────────────────────
 * La versión anterior no usaba el `status` numérico de Flow «porque su numeración no estaba
 * verificada», y derivaba de `paid` / `payment_date` / `outstanding` / `attemp`. **Esas cuatro
 * claves no existen**: no vienen en `invoice/get` ni en el invoice embebido de `subscription/get`.
 * Resultado: TODO invoice caía en `PENDIENTE` — el comprobante no salía nunca, ningún invoice
 * llegaba a `VENCIDA` y por lo tanto ninguna tienda morosa entraba en pausa. Una tienda que dejaba
 * de pagar vendía para siempre.
 *
 * El contrato real (documentado en `tmp/apiFlow.yaml` v7 y corroborado contra los payloads del
 * sandbox) es:
 *
 * - **`status`** → `0` impago, `1` pagado, `2` anulado. Es el campo autoritativo y el que sí viaja
 *   en el invoice EMBEBIDO, que es lo único que el webhook ve sin pedir nada más.
 * - **`attemp_count`** (sic, typo del proveedor) → número de intentos de cobro, **incluido el
 *   exitoso**. Es el contador contra el que se mide el dunning.
 * - **`attemped`** (sic) → NO es un contador: es «si este importe se cobrará» (1 sí / 0 no). Un
 *   invoice PAGADO viene con `attemp_count: 1` y `attemped: 0`, que es exactamente la trampa que la
 *   4ª pasada dejó anotada — leer cualquiera de los dos como «intentos fallidos» convertiría un
 *   cobro exitoso en una tienda suspendida.
 * - **`error`** → `0`/`1` según si el último intento de cobro falló.
 * - **`payment`**, **`paymentLink`**, **`chargeAttemps`**, **`errorDescription`** → SOLO en
 *   `invoice/get`; el embebido no los trae.
 *
 * ── La dirección de la falla sigue siendo deliberada ──────────────────────────────────────────
 * Suspender exige evidencia positiva: un `status` que dice impago Y un contador de intentos que
 * llegó al tope que nosotros mismos registramos en el plan. Cualquier ambigüedad —`status` ausente
 * o con un valor que Flow no documenta— cae a `PENDIENTE`. El error posible sigue siendo «la
 * plataforma cobra tarde», recuperable con el banner y el aviso manual, y nunca «una Tienda al día
 * quedó en pausa», que castigaría al Organizador Y a sus Compradores (I5). El corte de venta se
 * apoya además en un segundo filtro: `derivarEstadoSuscripcion` solo suspende con un invoice
 * `VENCIDA` en el ledger.
 */

/** `Invoice.status` de Flow: 0 impago, 1 pagado, 2 anulado. */
const FLOW_INVOICE_IMPAGO = 0;
const FLOW_INVOICE_PAGADO = 1;
const FLOW_INVOICE_ANULADO = 2;

/** `Invoice.attemped`: 1 = Flow todavía va a intentar cobrarlo, 0 = ya no lo va a cobrar. */
const FLOW_NO_SE_COBRARA = 0;

/** `Invoice.error`: 1 = el último intento de cobro falló. */
const FLOW_CON_ERROR = 1;

/**
 * Reintentos de cobro que Flow hace antes de dar el invoice por incobrable. Es el
 * `charges_retries_number` que el bootstrap de planes (F02) REGISTRA explícitamente en Flow, y el
 * tope contra el que acá se mide `attemp_count`. Vive en un solo lugar a propósito: si el plan
 * registrara 5 y la derivación siguiera midiendo contra 3, suspenderíamos tiendas que Flow todavía
 * va a cobrar.
 */
export const REINTENTOS_COBRO_FLOW = 3;

/**
 * Los campos del invoice de Flow que la derivación mira. Shape chico y explícito: acopla el núcleo a
 * DATOS, no al service (mismo criterio que `DatosGate` de `_publicacion.ts`).
 */
export type DatosInvoice = Pick<
  FlowInvoice,
  "status" | "attemp_count" | "attemped" | "error" | "payment"
>;

/**
 * Estado de nuestro ledger para un invoice de Flow. Prioridad, de más fuerte a más débil:
 *
 * 1. **Pagado** ⇒ `PAGADA`. Dos evidencias independientes y cualquiera basta: `status === 1`, que
 *    es lo que trae el invoice embebido, o un bloque `payment` cobrado (`status === 2`), que es lo
 *    que trae `invoice/get` y lo que responde `payment/getStatus` por el token de la notificación.
 *    Redundar acá es barato y cierra la carrera en que Flow cobra y su `status` todavía no lo
 *    refleja: sin esa segunda evidencia, un comprobante que no salió no vuelve a intentarse nunca.
 * 2. **Anulado** (`status === 2`) ⇒ `ANULADA`. No se cobró y ya no se debe.
 * 3. A partir de acá se exige que Flow diga **impago** (`status === 0`). Un `status` ausente o con
 *    un valor no documentado NO habilita el camino de la suspensión: cae a `PENDIENTE`.
 * 4. **Reintentos agotados** (`attemp_count >= REINTENTOS_COBRO_FLOW`) ⇒ `VENCIDA`. El ÚNICO camino
 *    a la suspensión, y exige el dato explícito.
 * 5. **Algún intento fallido** (`attemp_count > 0` o `error === 1`) ⇒ `FALLIDA`: Flow sigue
 *    reintentando y la tienda SIGUE vendiendo (D4).
 * 6. Si no ⇒ `PENDIENTE` (recién emitido, o datos incompletos).
 */
export function derivarEstadoInvoice(
  inv: DatosInvoice,
  { reintentosMax = REINTENTOS_COBRO_FLOW }: { reintentosMax?: number } = {},
): PlatformInvoiceStatus {
  if (inv.status === FLOW_INVOICE_PAGADO) return "PAGADA";
  if (inv.payment?.status === FLOW_PAGO_PAGADO) return "PAGADA";
  if (inv.status === FLOW_INVOICE_ANULADO) return "ANULADA";
  if (inv.status !== FLOW_INVOICE_IMPAGO) return "PENDIENTE";

  const intentos = inv.attemp_count ?? 0;
  if (intentos >= reintentosMax) return "VENCIDA";
  if (intentos > 0 || inv.error === FLOW_CON_ERROR) return "FALLIDA";
  return "PENDIENTE";
}

/**
 * `true` cuando Flow parece haber **dejado de cobrar** un invoice que sigue impago y aun así la
 * derivación NO lo suspende. Es el punto ciego que queda después del blocker 5, y existe para que
 * deje rastro en el log en vez de descubrirse cuadrando ingresos meses después.
 *
 * Dos formas, las dos con la misma consecuencia («esta tienda debería estar en pausa y no lo está»):
 *
 * - **`attemped === 0` con el tope de reintentos sin alcanzar**: Flow declara que este importe ya no
 *   se cobrará, pero nuestro contador dice que todavía quedaban intentos. Si así marcara Flow los
 *   incobrables, el dunning terminaría antes que nuestra cuenta y la tienda nunca se suspendería.
 * - **`ANULADA` con los reintentos ya agotados**: el supuesto es que Flow anula al cancelar, no al
 *   dar por incobrable. Si resultara que también anula los incobrables, se leería como una deuda que
 *   no existe.
 *
 * En ningún caso se cambia la lectura conservadora: la prioridad del plan es la opuesta (I5/D4 —
 * jamás suspender de más; el error recuperable es cobrar tarde, no cortarle la tienda a quien está
 * al día). El caso sigue siendo ambiguo hasta que el sandbox pueda producir un cobro fallido de
 * verdad; lo que cambia es que deja de ser silencioso.
 */
export function esCobroAbandonadoSinSuspender(
  inv: DatosInvoice,
  { reintentosMax = REINTENTOS_COBRO_FLOW }: { reintentosMax?: number } = {},
): boolean {
  const estado = derivarEstadoInvoice(inv, { reintentosMax });
  const intentos = inv.attemp_count ?? 0;

  if (estado === "ANULADA") return intentos >= reintentosMax;
  if (estado === "PAGADA" || estado === "VENCIDA") return false;
  return inv.attemped === FLOW_NO_SE_COBRARA;
}

/**
 * NOTA sobre el otro invariante del ledger — **un invoice `PAGADA` no retrocede**. Es un HECHO con
 * plata movida, y una notificación rancia de Flow no puede devolverlo a `FALLIDA`/`VENCIDA` (que
 * suspendería una tienda que ya pagó). Ese guard NO vive acá: vive en el `WHERE` del `updateMany` de
 * `avanzarInvoice` (`procesarNotificacionSuscripcion.ts`), o sea en la DB, porque tiene que ser
 * ATÓMICO — una comparación en memoria la puede pisar otra notificación concurrente.
 */
