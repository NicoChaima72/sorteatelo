import {
  type PlatformSubscriptionStatus,
  type PrismaClient,
} from "@prisma/client";

import {
  definicionDelPlan,
  montoDelPlan,
} from "~/server/domain/facturacion/_precios";
import { promocionEjecutable } from "~/server/domain/facturacion/_promocionDePlan";
import {
  ErrorFlowPlataforma,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * Ejecución DIFERIDA de las promociones de plan del Pagador (F06, D7/I8, ADR-0026) — la otra mitad
 * del fix del blocker 6 de la 4ª pasada del E2E. La corre el cron diario de facturación (F09).
 *
 * ── Por qué esto no vive en `cancelarPlan` ───────────────────────────────────────────────────────
 * Porque `subscription/changePlan` **cambia el plan en el acto y cobra la diferencia del período en
 * curso**. Pedido en el momento de cancelar, eso le factura a la tienda VECINA la diferencia de un
 * mes que su dueño ya había pagado al precio de su plan (invoices reales `1179471` y `1179474`:
 * misma suscripción, mismo período, $12.500 cada uno). D7 dice «en la próxima renovación», así que
 * la promoción se anota al cancelar y se ejecuta acá, cuando esa renovación ya ocurrió.
 *
 * **Reconciliation-based** (backend-conventions § Jobs), igual que el barrido de avisos: pregunta
 * «¿qué promoción anotada ya corresponde?», nunca «¿cuál vence hoy?». Una corrida perdida se
 * recupera al día siguiente y una repetida no cobra dos veces — Flow responde `1001` («ya está en
 * ese plan») y el sellado local es idempotente.
 *
 * **Flow primero, DB después**, misma dirección de falla que la cancelación: si Flow cambia el plan y
 * el sellado local no ocurre, la corrida siguiente reintenta, recibe el `1001` y sella. Al revés
 * —sellar y después fallar en Flow— dejaría la página Plan diciendo «$25.000 al mes» mientras Flow
 * cobra $12.500: una pantalla de plata mintiendo, y una fuga silenciosa.
 */

/** Estados en los que todavía hay una renovación por delante que pueda cobrar el plan nuevo. */
const ESTADOS_PROMOVIBLES: readonly PlatformSubscriptionStatus[] = [
  "AL_DIA",
  "COBRO_PENDIENTE",
];

/** El `1001` de Flow: «el plan seleccionado es el mismo que el actual». No es una falla. */
const CODIGO_PLAN_YA_APLICADO = 1001;

function esPlanYaAplicado(error: unknown): boolean {
  return (
    error instanceof ErrorFlowPlataforma &&
    error.codigoFlow === CODIGO_PLAN_YA_APLICADO
  );
}

export interface ResultadoPromociones {
  /** Cuántas promociones se aplicaron en esta corrida (para el body del cron). */
  ejecutadas: number;
}

export async function ejecutarPromocionesDePlan({
  db,
  flow,
}: {
  db: Pick<PrismaClient, "platformSubscription">;
  flow: FlowPlataformaService;
}): Promise<ResultadoPromociones> {
  const anotadas = await db.platformSubscription.findMany({
    where: {
      planProgramado: { not: null },
      estado: { in: [...ESTADOS_PROMOVIBLES] },
      // Una tienda que ya pidió cancelar no tiene renovación siguiente que cobrar: promoverla sería
      // emitirle una diferencia por el último mes que le queda.
      cancelacionSolicitadaAt: null,
    },
    select: {
      id: true,
      planProgramado: true,
      planProgramadoDesde: true,
      periodoInicio: true,
      flowSubscriptionId: true,
    },
    orderBy: { id: "asc" },
  });

  let ejecutadas = 0;

  for (const s of anotadas) {
    const planNuevo = s.planProgramado;
    if (!planNuevo || !promocionEjecutable(s)) continue;

    try {
      try {
        await flow.cambiarPlan({
          subscriptionId: s.flowSubscriptionId,
          nuevoPlanId: definicionDelPlan(planNuevo).flowPlanId,
        });
      } catch (error) {
        // `changePlan` NO es idempotente (verificado contra el sandbox): repetirlo responde
        // `400 code 1001`. Eso no es una falla — es Flow confirmando que el cambio YA está hecho, que
        // es el resultado que se quería. Tratarlo como error dejaría la marca sin apagar y el cron
        // reintentaría la misma promoción todos los días. Cualquier otro error sí sube.
        if (!esPlanYaAplicado(error)) throw error;
        console.info(
          "[facturacion] Flow reporta que la suscripción ya estaba en el plan nuevo: se sella la promoción igual",
          { suscripcionId: s.id, planNuevo },
        );
      }

      // Guard ATÓMICO: el `WHERE` exige que la promoción siga anotada, así que de dos corridas
      // solapadas solo una cuenta la ejecución. El `plan` y el `montoBruto` se sellan JUNTOS — el
      // monto sale del catálogo (I2, `Decimal`) y no de Flow: es el precio de OTRO plan, no una
      // tarifa nueva del mismo.
      const { count } = await db.platformSubscription.updateMany({
        where: { id: s.id, planProgramado: planNuevo },
        data: {
          plan: planNuevo,
          flowPlanId: definicionDelPlan(planNuevo).flowPlanId,
          montoBruto: montoDelPlan(planNuevo),
          planProgramado: null,
          planProgramadoDesde: null,
        },
      });
      if (count === 1) ejecutadas++;
    } catch (error) {
      // Log-and-continue: una promoción caída no puede llevarse puesto el resto de la corrida (ni
      // los avisos que el cron manda después). Se reintenta mañana.
      console.error(
        "[facturacion] no se pudo ejecutar la promoción de plan; queda anotada para la corrida siguiente",
        {
          suscripcionId: s.id,
          planNuevo,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  return { ejecutadas };
}
