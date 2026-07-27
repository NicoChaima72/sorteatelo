import { REINTENTOS_COBRO_FLOW } from "~/server/domain/facturacion/_invoiceFlow";
import {
  type DefinicionPlan,
  PLANES_PLATAFORMA,
} from "~/server/domain/facturacion/_precios";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Núcleo TESTEABLE del bootstrap de los planes de Flow (F02). Pone en marcha la cuenta de
 * plataforma: crea en Flow el plan full ($25.000) y el adicional ($12.500), mensuales, con su
 * `urlCallback` apuntando al webhook de suscripciones (F04).
 *
 * Recibe el `FlowPlataformaService` INYECTADO y no toca `env` ni instancia nada — el wrapper CLI
 * (`scripts/bootstrap-planes-plataforma.ts`) lee env, cablea el service real y formatea la salida
 * (patrón "núcleo testeable + wrapper", backend-conventions § Scripts CLI).
 *
 * **Idempotente** (requisito del plan): antes de crear consulta `plan/get`. Un plan que ya existe
 * se reporta como `existente` y NO se toca — ni siquiera para actualizarlo. Razón: cambiar el
 * `amount` de un plan vivo en Flow afectaría a las suscripciones ya colgadas de él, y la migración
 * de precio de planes vigentes está explícitamente fuera de alcance. Los planes son inmutables
 * una vez creados; un precio nuevo será un `planId` nuevo, con su propia decisión.
 */

export interface ResultadoBootstrap {
  creados: DefinicionPlan[];
  existentes: DefinicionPlan[];
}

export async function bootstrapPlanesPlataforma({
  flow,
  urlCallback,
}: {
  flow: FlowPlataformaService;
  urlCallback: string;
}): Promise<ResultadoBootstrap> {
  const creados: DefinicionPlan[] = [];
  const existentes: DefinicionPlan[] = [];

  // Secuencial a propósito: son 2 llamadas y la salida del CLI se lee en orden.
  for (const def of PLANES_PLATAFORMA) {
    if (await existeEnFlow(flow, def.flowPlanId)) {
      existentes.push(def);
      continue;
    }

    await flow.crearPlan({
      planId: def.flowPlanId,
      name: def.nombre,
      amount: def.montoCLP,
      urlCallback,
      // EXPLÍCITO, no el default de Flow (F04): este mismo número es el tope contra el que
      // `_invoiceFlow.ts` mide el `attemp_count` del invoice para declararlo VENCIDA — que es lo que
      // hace que la Tienda deje de vender (D4). Si el plan registrara un tope y la derivación midiera
      // contra otro, suspenderíamos tiendas que Flow todavía va a cobrar.
      chargesRetriesNumber: REINTENTOS_COBRO_FLOW,
    });
    creados.push(def);
  }

  return { creados, existentes };
}

/**
 * `true` sii el plan ya existe **y está vivo** en la cuenta Flow. Flow no tiene un "exists":
 * responde con error cuando el `planId` no está, así que la ausencia se detecta por el throw. Es
 * deliberadamente conservador — cualquier error se lee como "no existe" y el `plans/create`
 * siguiente fallará ruidosamente si el problema era otro (credenciales, red), en vez de romper acá
 * con un mensaje que hablaría del endpoint equivocado.
 *
 * **`status: 0` = borrado, y NO cuenta como existente** (verificado contra el sandbox, 3ª pasada del
 * E2E: Flow no saca los planes borrados, los sigue devolviendo con `status 0`). Darlos por buenos
 * dejaría al bootstrap reportando «ya existía» sobre un plan al que ninguna suscripción se puede
 * colgar. Como el `planId` además queda QUEMADO —`plans/create` responde «This planId has already
 * been used»—, no hay recuperación automática posible: lo único honesto es intentar crearlo y dejar
 * que el rechazo de Flow llegue a la persona que corre el script.
 *
 * El chequeo es `!== 0` y no `=== 1`: si Flow omitiera el campo, el plan se sigue tratando como
 * existente. La ausencia de dato no puede empujar a recrear un plan vivo.
 */
async function existeEnFlow(
  flow: FlowPlataformaService,
  flowPlanId: string,
): Promise<boolean> {
  try {
    const plan = await flow.getPlan(flowPlanId);
    return Boolean(plan?.planId) && plan.status !== 0;
  } catch {
    return false;
  }
}
