import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";
import { fechaDeFlow } from "~/server/domain/facturacion/_fechaFlow";
import { exencionVigente } from "~/server/domain/facturacion/_gateVenta";
import {
  definicionDelPlan,
  montoDelPlan,
  planParaNuevaSuscripcion,
} from "~/server/domain/facturacion/_precios";
import { traduciendoErroresDeFlow } from "~/server/domain/facturacion/_erroresDeFlow";
import { confirmarRegistroServerSide } from "~/server/domain/facturacion/_registroDeTarjeta";
import { DomainError } from "~/server/domain/errors";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Use case del panel (F03, D2/D12, I3/I4): cierra el paso «Activa tu plan» cuando el Pagador vuelve
 * del redirect de Flow con el token del registro de tarjeta.
 *
 * **I3 — la confirmación es SERVER-SIDE**: el token que trae el navegador no prueba nada. Se consulta
 * `customer/getRegisterStatus` contra la API de Flow con las credenciales de plataforma y solo con
 * un registro OK se crea la suscripción. Es el mismo principio que ADR-0001 para las ventas.
 *
 * **I4 — el plan y el precio se calculan acá**: se cuentan las suscripciones ACTIVAS del Pagador y
 * `planParaNuevaSuscripcion` decide FULL/ADICIONAL. El cliente no manda plan ni monto — no hay input
 * para eso, por construcción (lección H1 de datawalt-app).
 *
 * Idempotente: recargar la página de retorno no crea una segunda suscripción.
 */
export async function activarPlanTrasRegistro({
  db,
  acceso,
  flow,
  input,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  flow: FlowPlataformaService;
  input: { token: string };
  ahora?: Date;
}): Promise<{ activado: true; yaEstaba: boolean }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // Idempotencia: la página de retorno se puede recargar, y Flow puede reenviar al mismo `url_return`.
  const existente = await db.platformSubscription.findUnique({
    where: { tenantId },
    select: { id: true, estado: true },
  });
  if (existente !== null && esActiva(existente.estado)) {
    return { activado: true, yaEstaba: true };
  }

  // Guard de EXENCIÓN (D8), simétrico al de `iniciarRegistroTarjeta` y repetido acá A PROPÓSITO: el
  // registro de tarjeta es un viaje de ida y vuelta a Flow, y en el medio la Tienda pudo quedar
  // exenta — una cortesía otorgada por DB directa, o la corrida de grandfathering del despliegue
  // (F07/D3), que es cuando esto deja de ser hipotético. Sin el chequeo quedaría exenta Y suscrita:
  // vendiendo gratis por el gate (la exención le gana a la suscripción) mientras Flow le cobra todos
  // los meses, y sin ningún banner que lo diga. Va ANTES de `flow.crearSuscripcion` porque después
  // ya habría un cobro vivo que compensar.
  const exencion = await db.platformExemption.findUnique({
    where: { tenantId },
    select: { exentaHasta: true },
  });
  if (exencionVigente(exencion, ahora)) {
    throw new DomainError(
      "INVALID",
      "Tu tienda quedó con plan cortesía: no se creó ningún cobro y no necesitas registrar una tarjeta.",
    );
  }

  const pagador = await db.platformBillingCustomer.findUnique({
    where: { userId: acceso.userId },
    select: { id: true, flowCustomerId: true },
  });
  if (!pagador) {
    // Sin customer no hubo `iniciarRegistroTarjeta`: alguien llegó al retorno por la vía equivocada.
    throw new DomainError(
      "INVALID",
      "No encontramos tu registro de tarjeta. Vuelve a intentar activar tu plan.",
    );
  }

  // ── Gate CRÍTICO (I3): confirmación server-side contra Flow ────────────────────────────────
  // Incluye la defensa en profundidad de que el token sea de NUESTRO customer: sin eso, un token
  // ajeno filtrado activaría un plan con la tarjeta de otra persona.
  const tarjeta = await confirmarRegistroServerSide({
    flow,
    token: input.token,
    flowCustomerId: pagador.flowCustomerId,
  });

  // ── Plan y precio SERVER-SIDE (I4) ────────────────────────────────────────────────────────
  // "Activas" del Pagador EXCLUYENDO esta Tienda: si quedó una fila cancelada de esta misma tienda
  // (re-suscribir, D6), no debe contarse como si fuera una segunda tienda.
  const activasDelPagador = await db.platformSubscription.findMany({
    where: { pagadorId: pagador.id, tenantId: { not: tenantId } },
    select: { id: true, plan: true, estado: true, createdAt: true },
  });
  const plan = planParaNuevaSuscripcion(
    activasDelPagador.filter((s) => esActiva(s.estado)),
  );
  const definicion = definicionDelPlan(plan);

  // El canje reservado antes del redirect (si hubo código).
  const reserva = await db.platformCouponRedemption.findFirst({
    where: { tenantId, subscriptionId: null },
    select: { id: true, couponId: true },
  });
  const flowCouponId = reserva
    ? (
        await db.platformCoupon.findUnique({
          where: { id: reserva.couponId },
          select: { flowCouponId: true },
        })
      )?.flowCouponId
    : undefined;

  // ── Cobro en Flow ─────────────────────────────────────────────────────────────────────────
  // Fuera de la $transaction a propósito: es una llamada de red y no se puede sostener un lock de DB
  // esperándola. Si esto falla, no persistimos nada (el Organizador reintenta); si persistiéramos
  // primero, tendríamos una tienda "con plan" que Flow no conoce y nunca cobraría.
  const suscripcionFlow = await traduciendoErroresDeFlow(
    "No pudimos activar tu plan con Flow. Vuelve a intentarlo en unos minutos.",
    () =>
      flow.crearSuscripcion({
        planId: definicion.flowPlanId,
        customerId: pagador.flowCustomerId,
        couponId: flowCouponId ?? undefined,
      }),
  );

  // ⚠ Desde esta línea hay una obligación de cobro MENSUAL VIVA en Flow que nuestra DB todavía no
  // conoce. Si la escritura local no commitea, hay que DESHACERLA en Flow (`compensarEnFlow`).
  try {
    await db.$transaction(async (tx) => {
      const datos = {
        pagadorId: pagador.id,
        plan,
        estado: "AL_DIA" as const,
        // Snapshot del precio vigente (I2): un cambio futuro de tarifa no reescribe esta columna.
        montoBruto: montoDelPlan(plan),
        flowSubscriptionId: suscripcionFlow.subscriptionId,
        flowPlanId: definicion.flowPlanId,
        periodoInicio: aFecha(suscripcionFlow.period_start) ?? ahora,
        periodoFin: aFecha(suscripcionFlow.period_end),
        proximoCobroAt: aFecha(suscripcionFlow.next_invoice_date),
        // Re-suscribir reusa el SLOT: hay que limpiar los rastros de la cancelación anterior (D6).
        cancelacionSolicitadaAt: null,
        cancelacionEfectivaAt: null,
        planProgramado: null,
        planProgramadoDesde: null,
        renovacionAvisadaPara: null,
      };

      // `PlatformSubscription` es un SLOT por Tienda (`tenantId @unique`): si quedó la fila de una
      // suscripción cancelada, se REUSA en vez de crear una segunda.
      const suscripcion = existente
        ? await tx.platformSubscription.update({
            where: { tenantId },
            data: datos,
            select: { id: true },
          })
        : await tx.platformSubscription.create({
            data: { tenantId, ...datos },
            select: { id: true },
          });

      // La tarjeta: marca + últimos 4, lo único que Flow devuelve y lo único que guardamos. JAMÁS
      // el PAN ni nada reversible (I7).
      await tx.platformBillingCustomer.update({
        where: { id: pagador.id },
        data: {
          tarjetaMarca: tarjeta.marca,
          tarjetaUltimos4: tarjeta.ultimos4,
        },
        select: { id: true },
      });

      // Trazabilidad del canje (D9): la reserva deja de estar suelta y apunta a la suscripción real.
      if (reserva) {
        await tx.platformCouponRedemption.update({
          where: { id: reserva.id },
          data: { subscriptionId: suscripcion.id },
          select: { id: true },
        });
      }
    });
  } catch (error) {
    await compensarEnFlow({
      flow,
      subscriptionId: suscripcionFlow.subscriptionId,
      tenantId,
    });
    // Se relanza el error ORIGINAL, no el de la compensación: es el que explica por qué el plan no
    // quedó activo, y es el que hay que poder leer en los logs para arreglar la causa.
    throw error;
  }

  return { activado: true, yaEstaba: false };
}

/**
 * Compensación del ÚNICO punto del flujo que no puede ser transaccional (D16, decisión del usuario):
 * `crearSuscripcion` ya dejó un cobro mensual VIVO en la cuenta Flow de la plataforma, y el guard de
 * idempotencia de `activarPlanTrasRegistro` solo mira NUESTRA DB. Sin esto, una `$transaction` que
 * falla (basta un hipo del pool, no hace falta que muera el proceso) deja la suscripción huérfana: el
 * reintento del Organizador pasa todos los guards y crea una SEGUNDA suscripción en Flow ⇒ dos cobros
 * mensuales al mismo Pagador, indefinidamente.
 *
 * Se cancela INMEDIATO (`alFinDelPeriodo: false` ⇒ `at_period_end=0`): no hay período que respetar
 * porque esta suscripción no debería existir. Cancelar de más es recuperable (el Organizador reintenta
 * y queda suscrito); cobrar de más, no.
 *
 * El error de la cancelación NO se propaga: enmascararía la causa raíz. Si la compensación también
 * falla queda una suscripción huérfana en Flow, y la red de detección es el **webhook de F04** (D16-C):
 * una notificación con un `flowSubscriptionId` que no tiene fila local se cancela ahí y deja alerta.
 */
async function compensarEnFlow({
  flow,
  subscriptionId,
  tenantId,
}: {
  flow: FlowPlataformaService;
  subscriptionId: string;
  tenantId: string;
}): Promise<void> {
  try {
    await flow.cancelarSuscripcion({ subscriptionId, alFinDelPeriodo: false });
    console.warn(
      "[facturacion] suscripción de Flow COMPENSADA (cancelada) porque la escritura local falló",
      { tenantId, subscriptionId },
    );
  } catch (errorCompensacion) {
    // Lo peor que puede pasar: cobro vivo en Flow sin fila local. Se grita en el log con el
    // `flowSubscriptionId` para poder cancelarlo a mano, y F04 lo caza cuando Flow notifique.
    console.error(
      "[facturacion] HUÉRFANA: no se pudo cancelar en Flow la suscripción de una activación fallida — cancelar a mano",
      {
        tenantId,
        subscriptionId,
        error:
          errorCompensacion instanceof Error
            ? errorCompensacion.message
            : String(errorCompensacion),
      },
    );
  }
}

/** Fecha de Flow → `Date`, en hora de Chile (ver `_fechaFlow.ts`). */
const aFecha = fechaDeFlow;
