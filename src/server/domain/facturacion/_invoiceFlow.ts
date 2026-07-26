import { type PlatformInvoiceStatus } from "@prisma/client";

import { type FlowInvoice } from "~/server/services/flowPlataforma";

/**
 * Núcleo PURO del espejo de invoices de Flow (F04, D4/D15, ADR-0026). Sin DB ni red: el webhook
 * carga el invoice ya VERIFICADO server-side contra la API de Flow (I3) y este módulo decide qué
 * estado le corresponde en nuestro ledger.
 *
 * ── Por qué NO se usa el `status` numérico de Flow ────────────────────────────────────────────
 * De esta derivación sale el `VENCIDA` que hace que una Tienda **deje de vender** (D4), así que un
 * dígito mal interpretado no cuesta un bug: cuesta el storefront de un Organizador y las compras de
 * sus Compradores. La numeración exacta de `Invoice.status` en la API de Flow NO está verificada
 * contra el sandbox (mismo caveat que el casing de campos que F02 dejó anotado), así que la
 * derivación se apoya SOLO en campos de semántica inequívoca:
 *
 * - `paid` / `payment_date` → se pagó. No hay ambigüedad posible.
 * - `outstanding` → cuánto se sigue debiendo. Un invoice impago que no debe nada fue ANULADO.
 * - `attemp` (sic, typo del proveedor) → cuántos cobros intentó Flow. Comparado contra el tope que
 *   NOSOTROS registramos en el plan (`REINTENTOS_COBRO_FLOW`), es evidencia POSITIVA de dunning
 *   agotado.
 *
 * ── La dirección de la falla es deliberada ────────────────────────────────────────────────────
 * Suspender exige evidencia positiva; la ausencia de datos cae a `PENDIENTE`. Si Flow cambiara sus
 * campos o el sandbox nos sorprendiera, el error resultante es «la plataforma cobra tarde» —
 * recuperable, con el banner y el aviso manual como red— y nunca «una Tienda al día quedó en pausa»,
 * que castigaría al Organizador Y a sus Compradores (I5). El corte de venta se apoya además en un
 * segundo filtro: `derivarEstadoSuscripcion` solo suspende con un invoice `VENCIDA` en el ledger.
 */

/**
 * Reintentos de cobro que Flow hace antes de dar el invoice por incobrable. Es el `days`/`charges_
 * retries_number` que el bootstrap de planes (F02) REGISTRA explícitamente en Flow, y el tope contra
 * el que acá se mide `attemp`. Vive en un solo lugar a propósito: si el plan registrara 5 y la
 * derivación siguiera midiendo contra 3, suspenderíamos tiendas que Flow todavía va a cobrar.
 */
export const REINTENTOS_COBRO_FLOW = 3;

/**
 * Los campos del invoice de Flow que la derivación mira. Shape chico y explícito: acopla el núcleo a
 * DATOS, no al service (mismo criterio que `DatosGate` de `_publicacion.ts`).
 */
export type DatosInvoice = Pick<
  FlowInvoice,
  "paid" | "payment_date" | "outstanding" | "attemp"
>;

/**
 * Estado de nuestro ledger para un invoice de Flow. Prioridad, de más fuerte a más débil:
 *
 * 1. **Pagado** (`paid === 1` o `payment_date` presente) ⇒ `PAGADA`.
 * 2. **Impago sin saldo** (`outstanding === 0`) ⇒ `ANULADA`: no se cobró y ya no se debe, o sea que
 *    Flow lo anuló (típicamente al cancelar la suscripción). Va ANTES de la regla de reintentos para
 *    que un invoice anulado tras varios intentos fallidos no se lea como incobrable y suspenda la
 *    tienda por una deuda que no existe.
 * 3. **Reintentos agotados** (`attemp >= REINTENTOS_COBRO_FLOW`) ⇒ `VENCIDA`. El ÚNICO camino a la
 *    suspensión, y exige el dato explícito: `attemp` ausente jamás llega acá.
 * 4. **Algún intento fallido** ⇒ `FALLIDA`: Flow sigue reintentando y la tienda SIGUE vendiendo (D4).
 * 5. Si no ⇒ `PENDIENTE` (recién emitido, o datos incompletos).
 */
export function derivarEstadoInvoice(
  inv: DatosInvoice,
  { reintentosMax = REINTENTOS_COBRO_FLOW }: { reintentosMax?: number } = {},
): PlatformInvoiceStatus {
  if (inv.paid === 1 || Boolean(inv.payment_date)) return "PAGADA";
  if (inv.outstanding === 0) return "ANULADA";

  const intentos = inv.attemp ?? 0;
  if (intentos >= reintentosMax) return "VENCIDA";
  if (intentos > 0) return "FALLIDA";
  return "PENDIENTE";
}

/**
 * `true` cuando un invoice cae en `ANULADA` **habiendo agotado los reintentos** — el único caso donde
 * el orden de las reglas de arriba es load-bearing y el supuesto que lo sostiene no está verificado
 * contra el sandbox.
 *
 * El supuesto: `outstanding === 0` solo ocurre cuando Flow ANULA el invoice (típicamente al cancelar).
 * Si resultara que Flow también deja `outstanding: 0` al dar un invoice por INCOBRABLE, esta
 * combinación se leería como `ANULADA` en vez de `VENCIDA` y —como `ANULADA` no suspende— una tienda
 * morosa de meses **nunca dejaría de vender**: la plataforma regalaría el servicio en silencio.
 *
 * El orden NO se invierte porque la prioridad del plan es la opuesta (I5/D4: jamás suspender de más;
 * el error recuperable es cobrar tarde, no cortarle la tienda a quien está al día). Pero el caso
 * ambiguo deja de ser silencioso: el caller loguea, y así el día que ocurra de verdad se ve en los
 * logs en vez de descubrirse recién al cuadrar los ingresos. Levantado por el `backend-reviewer` en
 * la revisión de F04.
 */
export function esAnulacionSospechosa(
  inv: DatosInvoice,
  { reintentosMax = REINTENTOS_COBRO_FLOW }: { reintentosMax?: number } = {},
): boolean {
  return (
    derivarEstadoInvoice(inv, { reintentosMax }) === "ANULADA" &&
    (inv.attemp ?? 0) >= reintentosMax
  );
}

/**
 * NOTA sobre el otro invariante del ledger — **un invoice `PAGADA` no retrocede**. Es un HECHO con
 * plata movida, y una notificación rancia de Flow no puede devolverlo a `FALLIDA`/`VENCIDA` (que
 * suspendería una tienda que ya pagó). Ese guard NO vive acá: vive en el `WHERE` del `updateMany` de
 * `avanzarInvoice` (`procesarNotificacionSuscripcion.ts`), o sea en la DB, porque tiene que ser
 * ATÓMICO — una comparación en memoria la puede pisar otra notificación concurrente.
 */
