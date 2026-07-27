import { type PlatformPlan } from "@prisma/client";

/**
 * Núcleo PURO de la promoción de plan del Pagador (F06, D7/I8, ADR-0026): **cuándo** puede empezar a
 * regir el plan nuevo y **cuándo** se puede ejecutar el cambio contra Flow. Sin DB ni red.
 *
 * ── Por qué esto existe (blocker 6 de la 4ª pasada del E2E) ──────────────────────────────────────
 * D7 dice que la adicional más antigua se promueve «en la próxima renovación», y el plan suponía que
 * `subscription/changePlan` dejaba el cambio PROGRAMADO en Flow. No lo deja: el endpoint **ni
 * siquiera tiene el parámetro `temporality`** que le mandábamos (sus parámetros documentados son
 * `subscriptionId`, `newPlanId` y `startDateOfNewPlan`). Flow aplica el cambio en el acto y **emite y
 * cobra una factura por la diferencia del período en curso** — un período que el Organizador ya
 * había pagado al precio de su plan viejo. Ocurrió de verdad, dos veces, en el sandbox.
 *
 * La solución es no delegar la programación: la promoción se **anota** al cancelar y se **ejecuta**
 * desde el cron diario (F09), recién cuando el período que se está cobrando ya es uno que
 * corresponde al plan nuevo. Ahí la factura de diferencia que Flow emite deja de ser retroactiva:
 * completa lo que falta para el precio del período en curso, que es exactamente lo que se debe.
 *
 * ── La dirección de la falla, otra vez deliberada ────────────────────────────────────────────────
 * Si falta un dato para saber si la promoción ya corresponde, NO se ejecuta. Lo que se pierde es
 * plata NUESTRA (el Pagador conserva la mitad de precio un mes más), recuperable en la corrida
 * siguiente. Lo que se evita es cobrarle de más a alguien que no pidió nada — que es lo que no se
 * arregla con una disculpa (mismo criterio que D16).
 */

/** Una promoción anotada, tal como la lee el cron. */
export interface PromocionAnotada {
  planProgramado: PlatformPlan | null;
  /** Desde qué momento el plan nuevo puede regir sin ser retroactivo. */
  planProgramadoDesde: Date | null;
  /** Inicio del período que Flow está cobrando HOY (espejo de `period_start`). */
  periodoInicio: Date | null;
}

/**
 * Desde cuándo puede regir el plan nuevo, sin cobrarle de más a nadie. Es el más TARDÍO de dos
 * momentos, y cada uno tapa un agujero distinto:
 *
 * - **La próxima renovación de la suscripción que se promueve**: su período en curso ya está pagado
 *   al precio viejo. Cualquier cambio antes de que ese período termine es retroactivo — el cobro
 *   extra del blocker 6.
 * - **El fin del período de la suscripción que se canceló**: mientras esa tienda siga viva (D6: se
 *   cancela `at_period_end` y vende hasta el final), el Pagador ya está pagando SU plan full. Promover
 *   a la vecina antes de que muera le cobraría dos planes full solapados.
 *
 * `null` si falta el dato de la renovación: sin saber cuándo empieza el período siguiente no hay
 * forma de prometer que el cambio no será retroactivo, y entonces no se promete nada.
 */
export function vigenciaDeLaPromocion({
  proximoCobroAt,
  finDeLaCancelada,
}: {
  proximoCobroAt: Date | null;
  finDeLaCancelada: Date | null;
}): Date | null {
  if (!proximoCobroAt) return null;
  if (!finDeLaCancelada) return proximoCobroAt;
  return proximoCobroAt.getTime() >= finDeLaCancelada.getTime()
    ? proximoCobroAt
    : finDeLaCancelada;
}

/**
 * `true` sii ya se puede pedirle a Flow el cambio de plan: hay una promoción anotada, tiene fecha de
 * vigencia, y **el período que Flow está cobrando ahora empezó en esa fecha o después**.
 *
 * El predicado se evalúa contra `periodoInicio` —el período que corre— y no contra el reloj. Es la
 * diferencia entre las dos formas de equivocarse:
 *
 * - Contra el reloj, el cron ejecutaría la promoción el mismo día de la renovación **antes** de que
 *   Flow emita la factura nueva, y la diferencia caería sobre el período viejo: el blocker 6 otra vez.
 * - Contra el período en curso, el cambio solo ocurre cuando la factura del período nuevo ya existe.
 *   La diferencia que Flow cobre completa ESE período, que es el que de verdad vale el plan nuevo.
 *
 * Como el espejo de `periodoInicio` lo escribe el webhook con cada notificación de cobro (F04), el
 * predicado se vuelve verdadero solo, sin timers ni estados intermedios.
 */
export function promocionEjecutable(p: PromocionAnotada): boolean {
  if (!p.planProgramado || !p.planProgramadoDesde || !p.periodoInicio) {
    return false;
  }
  return p.periodoInicio.getTime() >= p.planProgramadoDesde.getTime();
}
