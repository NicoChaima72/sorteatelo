import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { type CorreoAEnviar } from "~/server/domain/correo/plantillasFacturacion";
import { DomainError } from "~/server/domain/errors";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";
import {
  definicionDelPlan,
  recalcularPlanesDelPagador,
} from "~/server/domain/facturacion/_precios";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Use case del panel (F06, D6/D7): el Organizador cancela el plan de su Tienda.
 *
 * **Cancelar es una acción explícita y separada de despublicar** (D6): pide
 * `subscription/cancel` con `at_period_end`, así que **la tienda sigue vendiendo hasta que cierre el
 * período ya pagado** — sin prorrateos ni reembolsos. El estado local NO pasa a `CANCELADA` acá: eso
 * lo hace el webhook (F04) cuando Flow reporta `status = 4`, que es el momento real en que el cobro
 * dejó de existir. Marcarla cancelada al pedirlo le quitaría un mes que ya pagó.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (ADR-0005): el input SELECCIONA entre lo ya
 * autorizado por la membresía, jamás autoriza.
 */

export interface ResultadoCancelacion {
  /** Hasta cuándo sigue vendiendo la Tienda. `null` si Flow todavía no reportó el período. */
  cancelacionEfectivaAtIso: string | null;
  /**
   * Correo (5) de D10 a despachar POST-COMMIT (I9). El use case decide, no envía: el dominio no
   * conoce el proveedor de correo. Mismo contrato que `procesarNotificacionSuscripcion`, así que lo
   * despacha el mismo borde (`enviarCorreosFacturacion`).
   */
  correos: CorreoAEnviar[];
}

export async function cancelarPlan({
  db,
  acceso,
  flow,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  flow: FlowPlataformaService;
  ahora?: Date;
}): Promise<ResultadoCancelacion> {
  const tenantId = resolverTenantDelPanel(acceso);

  const suscripcion = await db.platformSubscription.findUnique({
    where: { tenantId },
    select: {
      id: true,
      estado: true,
      pagadorId: true,
      flowSubscriptionId: true,
      periodoFin: true,
      cancelacionSolicitadaAt: true,
      cancelacionEfectivaAt: true,
      // El PAGADOR de la suscripción (D1), no el de la sesión: una Tienda admite más de una
      // membresía y el cliente de la Plataforma es quien puso la tarjeta. Mismo criterio que la
      // tarjeta de `getEstadoPlan`.
      pagador: { select: { email: true } },
      tenant: { select: { nombre: true } },
    },
  });
  if (!suscripcion || !esActiva(suscripcion.estado)) {
    // Sin fila, o con el período ya cerrado por el webhook: no hay cobro vivo que detener. Se
    // rechaza en vez de ackear en silencio porque la UI ofrece «Cancelar» solo cuando hay algo que
    // cancelar — llegar acá significa que la pantalla estaba mirando un estado viejo.
    throw new DomainError("INVALID", "Esta tienda no tiene un plan que cancelar.");
  }

  // Idempotencia (D6): ya se pidió la cancelación y Flow la tiene registrada. Se devuelve la fecha
  // —la UI que reintentó necesita mostrarla— pero NI se vuelve a llamar a Flow NI sale un segundo
  // correo. El estado en DB converge igual; el correo no se puede des-enviar.
  if (suscripcion.cancelacionSolicitadaAt !== null) {
    return {
      cancelacionEfectivaAtIso:
        suscripcion.cancelacionEfectivaAt?.toISOString() ?? null,
      correos: [],
    };
  }

  // ── Flow PRIMERO, DB después ──────────────────────────────────────────────────────────────
  // La dirección de la falla es deliberada. Si Flow cancela y la escritura local no ocurre, queda
  // una tienda que vende y que Flow ya no cobra: se pierde plata NUESTRA, y el webhook (F04) lo
  // reconcilia solo en cuanto Flow reporte `status = 4`. Al revés —marcar cancelado local y fallar
  // en Flow— le seguiríamos cobrando el mes a alguien que canceló, que es el error que no se puede
  // deshacer con una disculpa.
  await flow.cancelarSuscripcion({
    subscriptionId: suscripcion.flowSubscriptionId,
    alFinDelPeriodo: true,
  });

  // ── Guard ATÓMICO: quién selló la cancelación ────────────────────────────────────────────
  // El chequeo de arriba es un atajo (ahorra la llamada a Flow en el caso normal), NO la protección:
  // dos requests del mismo botón pueden leer ambas `cancelacionSolicitadaAt: null` antes de que
  // ninguna escriba. Quien decide es el `count` de este `updateMany` condicional — el mismo molde
  // que el ledger de F04 y la reserva de cupones de F03. Sin él, un doble click manda DOS correos
  // «cancelamos tu plan» y corre DOS veces el recálculo del pricing; el estado en DB convergería
  // igual, pero un correo no se puede des-enviar.
  const cancelacionEfectivaAt = suscripcion.periodoFin;
  const { count } = await db.platformSubscription.updateMany({
    where: { id: suscripcion.id, cancelacionSolicitadaAt: null },
    data: { cancelacionSolicitadaAt: ahora, cancelacionEfectivaAt },
  });

  if (count === 0) {
    // Perdió la carrera: otra corrida ya selló esta misma cancelación y se hizo cargo del correo y
    // del recálculo. Se responde la fecha vigente —la UI la necesita— y nada más.
    const vigente = await db.platformSubscription.findUnique({
      where: { id: suscripcion.id },
      select: { cancelacionEfectivaAt: true },
    });
    return {
      cancelacionEfectivaAtIso:
        vigente?.cancelacionEfectivaAt?.toISOString() ?? null,
      correos: [],
    };
  }

  await recalcularPricingDelPagador({
    db,
    flow,
    pagadorId: suscripcion.pagadorId,
    excluyendo: suscripcion.id,
  });

  return {
    cancelacionEfectivaAtIso: cancelacionEfectivaAt?.toISOString() ?? null,
    correos: [
      {
        destinatario: suscripcion.pagador.email,
        datos: {
          tipo: "CANCELACION_CONFIRMADA",
          nombreTienda: suscripcion.tenant.nombre,
          cancelacionEfectivaAt,
        },
      },
    ],
  };
}

/**
 * Recálculo del pricing del Pagador (D7/I8): tras irse una de sus tiendas, **exactamente una** de las
 * que quedan tiene que estar a precio full — la más antigua. Si la que se canceló era la full, su
 * adicional más antigua se promueve.
 *
 * **Programado, nunca retroactivo**: el cambio se pide a Flow con `changePlan` de temporalidad 2, así
 * que el precio nuevo rige desde la próxima renovación. La columna `plan` NO se toca — sigue
 * describiendo lo que se cobra HOY —; el destino vive en `planProgramado`, y el webhook (F04) es
 * quien verá el cobro nuevo cuando ocurra.
 *
 * **Un fallo acá NO revierte la cancelación**, que ya está hecha y confirmada en Flow: se loguea y se
 * sigue. La consecuencia de tragarlo es que el Pagador conserva la mitad de precio un mes más — una
 * fuga de ingresos nuestra, recuperable en la corrida siguiente. La alternativa —reventar la
 * mutation— le diría al Organizador que su cancelación falló cuando sí ocurrió, que es peor y además
 * mentira. Mismo criterio que I9 con los correos.
 */
async function recalcularPricingDelPagador({
  db,
  flow,
  pagadorId,
  excluyendo,
}: {
  db: PrismaClient;
  flow: FlowPlataformaService;
  pagadorId: string;
  /** La suscripción recién cancelada: ya no compite por el precio full. */
  excluyendo: string;
}): Promise<void> {
  const otras = await db.platformSubscription.findMany({
    where: { pagadorId, id: { not: excluyendo } },
    select: {
      id: true,
      plan: true,
      planProgramado: true,
      estado: true,
      createdAt: true,
      flowSubscriptionId: true,
      proximoCobroAt: true,
    },
  });

  const cambios = recalcularPlanesDelPagador(
    otras
      .filter((s) => esActiva(s.estado))
      // Se compara contra el plan que va a REGIR, no contra el vigente: si esta suscripción ya tiene
      // una promoción programada, volver a proponerla mandaría un segundo `changePlan` a Flow por el
      // mismo hecho. Es lo que hace idempotente al recálculo cuando un Pagador cancela dos tiendas.
      .map((s) => ({ id: s.id, plan: s.planProgramado ?? s.plan, createdAt: s.createdAt })),
  );

  for (const cambio of cambios) {
    const suscripcion = otras.find((s) => s.id === cambio.suscripcionId);
    if (!suscripcion) continue;

    try {
      const respuesta = await flow.cambiarPlan({
        subscriptionId: suscripcion.flowSubscriptionId,
        nuevoPlanId: definicionDelPlan(cambio.planNuevo).flowPlanId,
      });

      await db.platformSubscription.update({
        where: { id: suscripcion.id },
        data: {
          planProgramado: cambio.planNuevo,
          // Cuándo SURTE EFECTO. La fecha autoritativa es la de Flow; si no la manda, el mejor dato
          // que tenemos es la próxima renovación de esa misma suscripción, que es exactamente
          // cuando la temporalidad 2 aplica el plan nuevo.
          planProgramadoDesde:
            fechaDeFlow(respuesta.new_plan_scheduled_change_date) ??
            suscripcion.proximoCobroAt,
        },
      });
    } catch (error) {
      console.error(
        "[facturacion] no se pudo programar el cambio de plan del Pagador (la cancelación ya quedó hecha)",
        {
          suscripcionId: suscripcion.id,
          planNuevo: cambio.planNuevo,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}

/** Fecha de Flow (`YYYY-MM-DD` o ISO) a `Date`; `null` si viene vacía o no parsea. */
function fechaDeFlow(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
