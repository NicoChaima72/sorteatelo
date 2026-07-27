import {
  Prisma,
  type PlatformInvoiceStatus,
  type PlatformPlan,
  type PlatformSubscriptionStatus,
  type PrismaClient,
} from "@prisma/client";

import { type CorreoAEnviar } from "~/server/domain/correo/plantillasFacturacion";
import {
  type CorreoDeFacturacion,
  type TransicionInvoice,
  correosDeLaNotificacion,
} from "~/server/domain/facturacion/_correosFacturacion";
import { derivarEstadoSuscripcion } from "~/server/domain/facturacion/_estadoSuscripcion";
import { fechaDeFlow } from "~/server/domain/facturacion/_fechaFlow";
import {
  derivarEstadoInvoice,
  esCobroAbandonadoSinSuspender,
} from "~/server/domain/facturacion/_invoiceFlow";
import {
  definicionDelPlan,
  montoDelPlan,
  planDeFlowPlanId,
} from "~/server/domain/facturacion/_precios";
import {
  FLOW_PAGO_PAGADO,
  type FlowInvoice,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * Use case del **webhook de suscripciones de plataforma** (F04, D4/D15/D16-C, ADR-0026).
 *
 * Flow notifica al `urlCallback` del plan cada vez que pasa algo con una suscripción (cobro OK, cobro
 * fallido, reintento, cancelación). Este use case toma esa notificación y hace cuatro cosas, en orden:
 *
 * 1. **Verifica SERVER-SIDE** (I3): consulta `subscription/get` con las credenciales de PLATAFORMA.
 *    El cuerpo del POST aporta un identificador y nada más — no es prueba de nada, igual que el
 *    redirect del navegador no confirma un pago (ADR-0001).
 * 2. **Rutea** la notificación a la fila local, con las tres salidas posibles (ver `rutearNotificacion`).
 * 3. **Espeja los invoices** en `PlatformInvoice` (ledger, unique por `flowInvoiceId`) y **deriva** el
 *    estado de la suscripción, todo dentro de una `$transaction` (I2: acá se registra plata).
 * 4. **Devuelve los correos** que la TRANSICIÓN amerita, para que el borde los mande POST-COMMIT
 *    (I9). Este use case no envía nada: no conoce el `CorreoService`.
 *
 * Idempotente por construcción: el upsert por `flowInvoiceId` absorbe el replay, y los correos se
 * deciden comparando el antes con el después — si nada cambió, no sale nada.
 */

/**
 * Ventana de gracia de la red de huérfanas (D16-C). Una suscripción de Flow SIN fila local que nació
 * hace menos que esto NO se cancela: es casi seguro la carrera con `activarPlanTrasRegistro` (Flow
 * cobra y notifica al instante, y nuestra `$transaction` puede no haber commiteado todavía).
 * Cancelarla ahí sería el peor resultado posible — matar de un mazazo la suscripción BUENA que un
 * Organizador acaba de contratar y pagar. Pasada la ventana, una suscripción que Flow sigue
 * notificando y de la que no tenemos ningún rastro sí es huérfana de verdad.
 */
export const GRACIA_HUERFANA_MS = 15 * 60 * 1000;

export type RuteoNotificacion =
  /** Ruteada a su fila local: se espejó y se derivó el estado. */
  | "PROCESADA"
  /** De una suscripción Flow ANTERIOR de un slot ya reusado (D6): se ignora sin tocar nada. */
  | "TARDIA"
  /** Sin fila local y fuera de la ventana de gracia: se canceló en Flow (D16-C). */
  | "HUERFANA_CANCELADA"
  /** Sin fila local pero recién nacida: probable carrera con la activación; NO se cancela. */
  | "HUERFANA_EN_GRACIA"
  /** Flow no reconoce el identificador: nada que hacer. */
  | "DESCONOCIDA";

/** Un correo listo para que el borde lo redacte y lo envíe (post-commit). */
/**
 * Re-export: el tipo se mudó a `plantillasFacturacion.ts` cuando F06 pasó a producir correos que este
 * use case no decide (la cancelación). Se mantiene exportado acá para no romper a sus consumidores
 * —el borde del webhook y sus tests—, que lo conocieron por este nombre.
 */
export type { CorreoAEnviar };

export interface ResultadoNotificacion {
  ruteo: RuteoNotificacion;
  estadoAntes?: PlatformSubscriptionStatus;
  estadoDespues?: PlatformSubscriptionStatus;
  correos: CorreoAEnviar[];
}

export async function procesarNotificacionSuscripcion({
  db,
  flow,
  input,
  ahora = new Date(),
}: {
  db: PrismaClient;
  flow: FlowPlataformaService;
  input: {
    flowSubscriptionId: string;
    /**
     * El cobro del que habla ESTA notificación, sacado del `commerceOrder` que Flow arma como
     * `<subscriptionId>_<invoiceId>_<fecha>`. Opcional porque la puerta de reconciliación manual
     * (un `subscriptionId` posteado a mano) no lo trae.
     */
    flowInvoiceId?: string;
    /**
     * `true` cuando `payment/getStatus` —el endpoint con el que ya se resolvió el token— declaró
     * ese cobro PAGADO. Es evidencia de primera mano del hecho notificado y se usa como segunda
     * prueba del pago, nunca como única (I3: lo que decide sigue saliendo de la API de Flow).
     */
    cobroPagado?: boolean;
  };
  ahora?: Date;
}): Promise<ResultadoNotificacion> {
  // ── Gate CRÍTICO (I3): el estado sale de la API de Flow, no del body ──────────────────────────
  const flowSub = await flow.getSuscripcion(input.flowSubscriptionId);
  if (!flowSub?.subscriptionId) {
    // Flow no reconoce el id: notificación ajena o malformada. Nada que cancelar ni escribir.
    return { ruteo: "DESCONOCIDA", correos: [] };
  }

  const local = await db.platformSubscription.findUnique({
    where: { flowSubscriptionId: input.flowSubscriptionId },
    select: {
      id: true,
      tenantId: true,
      estado: true,
      plan: true,
      montoBruto: true,
      cancelacionSolicitadaAt: true,
      cancelacionEfectivaAt: true,
      tenant: { select: { nombre: true } },
      pagador: { select: { email: true } },
    },
  });

  if (!local) {
    return {
      ruteo: await rutearSinFilaLocal({
        db,
        flow,
        flowSubscriptionId: input.flowSubscriptionId,
        periodStart: aFecha(flowSub.period_start),
        ahora,
      }),
      correos: [],
    };
  }

  // ── Espejo de invoices + estado derivado ─────────────────────────────────────────────────────
  const invoicesFlow = await completarInvoices({
    db,
    flow,
    subscriptionId: local.id,
    embebidos: flowSub.invoices ?? [],
    notificado: input.flowInvoiceId,
    cobroPagado: input.cobroPagado,
  });

  const { transiciones, estadoAntes, estadoDespues, cambioEstado } =
    await db.$transaction(async (tx) => {
      // El «antes» se lee DENTRO de la transacción, y aun así no es lo que decide los correos: eso lo
      // decide el `count` de los guards atómicos de abajo. Acá sirve para dos cosas más chicas —
      // saber si el monto es inmutable (invoice ya PAGADA) y qué mensaje corresponde.
      const previos = await tx.platformInvoice.findMany({
        where: { subscriptionId: local.id },
        select: { flowInvoiceId: true, estado: true },
      });
      const estadoPrevio = new Map(previos.map((p) => [p.flowInvoiceId, p.estado]));

      const avances: TransicionInvoice[] = [];
      for (const inv of invoicesFlow) {
        avances.push(
          await avanzarInvoice({
            tx,
            inv,
            subscriptionId: local.id,
            flowSubscriptionId: input.flowSubscriptionId,
            montoDeLaSuscripcion: local.montoBruto,
            estadoPrevio: estadoPrevio.get(String(inv.id)) ?? null,
          }),
        );
      }

      // La derivación mira TODOS los invoices del ledger, no solo los de esta notificación: el peor
      // impago manda (D15), y puede venir de una notificación anterior.
      const todos = await tx.platformInvoice.findMany({
        where: { subscriptionId: local.id },
        select: { estado: true },
      });

      const derivado = derivarEstadoSuscripcion({
        statusFlow: flowSub.status ?? 1,
        morose: flowSub.morose ?? 0,
        invoices: todos,
      });

      const espejo = {
        periodoInicio: aFecha(flowSub.period_start) ?? undefined,
        periodoFin: aFecha(flowSub.period_end) ?? undefined,
        proximoCobroAt: aFecha(flowSub.next_invoice_date) ?? undefined,
        ...planQueRigeAhora({ flowPlanIdEnFlow: flowSub.planId, planLocal: local.plan }),
      };

      // Avance ATÓMICO del estado de la suscripción: el `WHERE` condicional es el check-and-act, y su
      // `count` es lo que autoriza el correo de «en pausa»/«regularizada». El precedente es
      // `domain/pago/confirmarPagoDeOrden.ts` (y el fix de `liberarReservas` en F03): el `UPDATE` toma
      // el row-lock, así que de dos corridas concurrentes una ve `count: 1` y la otra `count: 0`.
      const { count } = await tx.platformSubscription.updateMany({
        where: { id: local.id, estado: { not: derivado } },
        data: {
          estado: derivado,
          ...espejo,
          // Cerrada de verdad en Flow: se sella cuándo surtió efecto. La cancelación la PIDE F06; acá
          // solo se registra el hecho, y una sola vez.
          ...(derivado === "CANCELADA" && local.cancelacionEfectivaAt === null
            ? { cancelacionEfectivaAt: ahora }
            : {}),
        },
      });

      if (count === 0) {
        // El estado ya era el derivado (replay, o ganó otra corrida): el resto del espejo igual se
        // refresca — son datos que convergen, no una transición, y el cron de F09 los lee.
        await tx.platformSubscription.updateMany({
          where: { id: local.id },
          data: espejo,
        });
      }

      return {
        transiciones: avances,
        estadoAntes: local.estado,
        estadoDespues: derivado,
        cambioEstado: count === 1,
      };
    });

  // ── Correos (I9): se DECIDEN acá, los ENVÍA el borde post-commit ─────────────────────────────
  const correos = correosDeLaNotificacion({
    invoices: transiciones,
    estadoAntes,
    estadoDespues,
    cambioEstado,
  }).map((correo) =>
    hidratarCorreo({
      correo,
      destinatario: local.pagador.email,
      nombreTienda: local.tenant.nombre,
      invoicesFlow,
      montoDeLaSuscripcion: local.montoBruto,
    }),
  );

  return { ruteo: "PROCESADA", estadoAntes, estadoDespues, correos };
}

/**
 * Estados en los que la historia de un invoice ya terminó: no hay link que buscar, ni fecha de pago
 * que llegue después, ni intento que contar. Enriquecerlos otra vez sería una llamada por mes de
 * historia en cada notificación.
 */
const ESTADOS_TERMINALES: readonly PlatformInvoiceStatus[] = ["PAGADA", "ANULADA"];

/**
 * Completa los invoices embebidos con lo que **solo trae `invoice/get`** (blocker 5): el bloque
 * `payment` —de donde sale `pagadaAt`—, el `paymentLink` con el que el Organizador regulariza (D4) y
 * los `error*` del intento fallido. `subscription/get` embebe una versión recortada que alcanza para
 * DERIVAR el estado (trae `status`), pero no para contarlo ni para dar la palanca de pago.
 *
 * Se pide **solo por los invoices cuya historia sigue abierta**: los que nunca vimos y los que en el
 * ledger no están en un estado terminal. En régimen eso es UNA llamada al mes por suscripción (el
 * invoice nuevo), y en dunning una por cada cobro abierto — nunca una por cada mes de historia.
 *
 * Un fallo acá **no voltea la notificación**: se sigue con el invoice embebido, que basta para el
 * estado. Perder el `paymentLink` de una vuelta es recuperable —la notificación siguiente lo trae—;
 * perder el espejo de un cobro por no poder adornarlo, no.
 */
async function completarInvoices({
  db,
  flow,
  subscriptionId,
  embebidos,
  notificado,
  cobroPagado,
}: {
  db: PrismaClient;
  flow: FlowPlataformaService;
  subscriptionId: string;
  embebidos: FlowInvoice[];
  notificado: string | undefined;
  cobroPagado: boolean | undefined;
}): Promise<FlowInvoice[]> {
  // El cobro que la notificación nombra SIEMPRE entra a la lista: si `subscription/get` no lo
  // lista, perderlo sería perder justo el hecho que Flow vino a contar.
  const aRevisar: FlowInvoice[] =
    notificado !== undefined && !embebidos.some((i) => String(i.id) === notificado)
      ? [...embebidos, { id: notificado }]
      : embebidos;

  if (aRevisar.length === 0) return aRevisar;

  const enLedger = await db.platformInvoice.findMany({
    where: { subscriptionId },
    select: { flowInvoiceId: true, estado: true },
  });
  const cerrados = new Set(
    enLedger
      .filter((i) => ESTADOS_TERMINALES.includes(i.estado))
      .map((i) => i.flowInvoiceId),
  );

  const completos: FlowInvoice[] = [];
  for (const inv of aRevisar) {
    const flowInvoiceId = String(inv.id);
    let completo = inv;

    if (!cerrados.has(flowInvoiceId)) {
      try {
        completo = { ...inv, ...(await flow.getInvoice(flowInvoiceId)) };
      } catch (e) {
        console.warn(
          "[facturacion] no se pudo traer el detalle del invoice; se espeja con lo que vino embebido",
          {
            flowInvoiceId,
            error: e instanceof Error ? e.message : String(e),
          },
        );
      }
    }

    // La evidencia del token entra solo si Flow todavía NO cuenta el pago por su cuenta: es una
    // segunda prueba, no una que pise el payload —que trae además la fecha en que se movió la plata.
    completos.push(
      cobroPagado &&
        flowInvoiceId === notificado &&
        completo.payment?.status !== FLOW_PAGO_PAGADO
        ? { ...completo, payment: { ...completo.payment, status: FLOW_PAGO_PAGADO } }
        : completo,
    );
  }
  return completos;
}

/**
 * Espejo del PLAN que rige hoy en Flow (D7, hallazgo 5 del sandbox real).
 *
 * Quien PIDE el cambio de plan es el cron (`facturacion/promocionesDePlan.ts`) y quien lo sella en
 * nuestra fila es él mismo. Esto es la **red**: si los dos lados divergen —una promoción que se
 * aplicó en Flow y cuya escritura local se perdió, o un plan cambiado a mano en el panel de Flow—,
 * manda Flow, que es quien cobra. Como Flow solo notifica en eventos de cobro, seguir su `planId`
 * acá actualiza el espejo justo cuando el precio nuevo empieza a cobrarse.
 *
 * Sin esto, una tienda promovida de adicional a full podría quedar mostrando «$12.500 /mes» en la
 * página Plan mientras Flow le cobra $25.000 — una pantalla de plata mintiendo.
 *
 * Dos guards: un `planId` que no está en nuestro catálogo **no se interpreta** (una notificación no
 * puede reescribir lo que le cobramos a una Tienda con un id que no reconocemos), y si el plan no
 * cambió no se escribe nada. El `montoBruto` se recalcula desde el catálogo y no desde Flow: es el
 * precio de OTRO plan, no una tarifa nueva del mismo (I2 sigue en pie — un cambio de tarifa no
 * reescribe el snapshot).
 */
function planQueRigeAhora({
  flowPlanIdEnFlow,
  planLocal,
}: {
  flowPlanIdEnFlow: string | null | undefined;
  planLocal: PlatformPlan;
}) {
  const enFlow = planDeFlowPlanId(flowPlanIdEnFlow);
  if (enFlow === null || enFlow === planLocal) return {};

  return {
    plan: enFlow,
    flowPlanId: definicionDelPlan(enFlow).flowPlanId,
    montoBruto: montoDelPlan(enFlow),
    // La promoción se cumplió: apagar las marcas evita que el aviso del cron (F09) siga anunciando
    // un cambio que ya ocurrió.
    planProgramado: null,
    planProgramadoDesde: null,
  };
}

/**
 * Qué hacer con una notificación cuyo `flowSubscriptionId` NO tiene fila en `PlatformSubscription`.
 * Es la **red de detección de huérfanas** de D16-C, el respaldo de la compensación de F03 para el
 * caso en que la compensación misma haya fallado. Tres salidas, en orden de descarte:
 *
 * 1. **TARDÍA** — el ledger `PlatformInvoice` tiene invoices con ese `flowSubscriptionId`: esta
 *    suscripción de Flow SÍ fue nuestra, y su slot local ya se reusó al re-suscribir (D6). O sea que
 *    está cancelada desde antes. No se cancela (no hay nada que cancelar) y no se escribe nada:
 *    espejar sus invoices contra el slot actual atribuiría cobros viejos a la suscripción nueva. Este
 *    descarte es exactamente para lo que `schema-guardian` pidió el snapshot de `flowSubscriptionId`.
 * 2. **EN GRACIA** — nació hace menos de `GRACIA_HUERFANA_MS`: probable carrera con la activación.
 *    Se avisa en el log y se deja viva.
 * 3. **HUÉRFANA** — se cancela en Flow, inmediata (`at_period_end=0`), y se grita en el log. Es plata
 *    que se le estaría cobrando a un Organizador por una tienda que no tiene plan.
 */
async function rutearSinFilaLocal({
  db,
  flow,
  flowSubscriptionId,
  periodStart,
  ahora,
}: {
  db: PrismaClient;
  flow: FlowPlataformaService;
  flowSubscriptionId: string;
  periodStart: Date | null;
  ahora: Date;
}): Promise<RuteoNotificacion> {
  const historico = await db.platformInvoice.findFirst({
    where: { flowSubscriptionId },
    select: { id: true },
  });
  if (historico) {
    console.warn(
      "[facturacion] notificación TARDÍA de una suscripción Flow anterior del mismo slot: se ignora",
      { flowSubscriptionId },
    );
    return "TARDIA";
  }

  // Edad DESCONOCIDA (`period_start` ausente o impresentable) ⇒ se trata como recién nacida y NO se
  // cancela. Es la misma dirección de falla que `_invoiceFlow.ts`: el dato que falta jamás autoriza la
  // acción destructiva. Y el caso es justamente el esperable durante la carrera que esta ventana
  // existe para cubrir — Flow puede no tener el período poblado en el instante de crear la
  // suscripción, y ahí cancelar sería matar la suscripción que un Organizador acaba de contratar.
  const edadMs =
    periodStart === null ? 0 : ahora.getTime() - periodStart.getTime();
  if (edadMs < GRACIA_HUERFANA_MS) {
    console.warn(
      "[facturacion] suscripción de Flow sin fila local, DENTRO de la ventana de gracia (o de edad desconocida): no se cancela (probable carrera con la activación)",
      { flowSubscriptionId, edadConocida: periodStart !== null },
    );
    return "HUERFANA_EN_GRACIA";
  }

  // D16-C: cobro vivo en Flow que nuestra DB no conoce. Se corta.
  try {
    await flow.cancelarSuscripcion({
      subscriptionId: flowSubscriptionId,
      alFinDelPeriodo: false,
    });
    console.error(
      "[facturacion] HUÉRFANA detectada por el webhook: suscripción de Flow sin fila local, CANCELADA (D16-C)",
      { flowSubscriptionId },
    );
  } catch (e) {
    // No se propaga: el webhook tiene que poder ackear igual (un 5xx solo haría que Flow reintente
    // esta misma notificación, sin arreglar nada). El log es la alerta.
    console.error(
      "[facturacion] HUÉRFANA detectada por el webhook y NO se pudo cancelar en Flow — cancelar a mano",
      {
        flowSubscriptionId,
        error: e instanceof Error ? e.message : String(e),
      },
    );
  }
  return "HUERFANA_CANCELADA";
}

/**
 * Espeja UN invoice de Flow en el ledger y devuelve si **esta** corrida ganó su avance.
 *
 * Los dos pasos son guards atómicos, y su `count` es lo único que autoriza un correo (BLOCKER de la
 * revisión de F04): leer el estado previo y después decidir sería un check-and-act NO atómico, y dos
 * notificaciones simultáneas del mismo invoice —plausible: Flow reintenta por timeout mientras la
 * primera request sigue en vuelo— mandarían dos comprobantes al Pagador.
 *
 * 1. `createMany({ skipDuplicates: true })` — el árbitro es el unique de `flowInvoiceId`. `count: 1`
 *    ⇒ la fila nació acá, o sea que esta corrida hizo la transición `null → estado`.
 * 2. Si ya existía, `updateMany` con `WHERE estado NOT IN (nuevo, PAGADA)`. `count: 1` ⇒ esta corrida
 *    cambió el estado. El `PAGADA` en el `NOT IN` es el guard append-only: un invoice pagado es un
 *    HECHO con plata movida y una notificación rancia no lo devuelve a FALLIDA/VENCIDA (que
 *    suspendería una tienda que ya pagó). Ahora vive en el `WHERE`, o sea en la DB, y no en una
 *    comparación en memoria que otra corrida podría pisar.
 */
async function avanzarInvoice({
  tx,
  inv,
  subscriptionId,
  flowSubscriptionId,
  montoDeLaSuscripcion,
  estadoPrevio,
}: {
  tx: Prisma.TransactionClient;
  inv: FlowInvoice;
  subscriptionId: string;
  flowSubscriptionId: string;
  montoDeLaSuscripcion: Prisma.Decimal;
  estadoPrevio: PlatformInvoiceStatus | null;
}): Promise<TransicionInvoice> {
  const flowInvoiceId = String(inv.id);
  const estado = derivarEstadoInvoice(inv);

  // El punto ciego que queda tras el blocker 5 (ver `esCobroAbandonadoSinSuspender`): Flow parece
  // haber dejado de cobrar un invoice que sigue impago y la derivación NO lo suspende. Se respeta la
  // lectura conservadora, pero se deja rastro: es lo que delata que una tienda morosa no se está
  // suspendiendo, en vez de descubrirlo cuadrando los ingresos meses después.
  if (esCobroAbandonadoSinSuspender(inv)) {
    console.warn(
      "[facturacion] Flow parece haber dejado de cobrar un invoice impago que NO estamos suspendiendo: si así marca los INCOBRABLES, esta tienda debería estar en pausa — verificar contra el sandbox",
      {
        flowInvoiceId,
        flowSubscriptionId,
        status: inv.status,
        intentos: inv.attemp_count,
        seCobrara: inv.attemped,
      },
    );
  }

  const campos = camposDelInvoice(inv, estado);
  const monto = montoDelInvoice(inv) ?? montoDeLaSuscripcion;

  const creada = await tx.platformInvoice.createMany({
    data: [
      {
        subscriptionId,
        flowInvoiceId,
        // Snapshot de QUÉ suscripción Flow lo generó: la fila local es un slot reusable (D6).
        flowSubscriptionId,
        montoBruto: monto,
        ...campos,
      },
    ],
    skipDuplicates: true,
  });
  if (creada.count === 1) {
    return { flowInvoiceId, despues: estado, transiciono: true };
  }

  const avance = await tx.platformInvoice.updateMany({
    where: { flowInvoiceId, estado: { notIn: [estado, "PAGADA"] } },
    data: {
      ...campos,
      // El monto de un invoice abierto se completa; el de uno PAGADA es INMUTABLE — y esa rama no
      // llega acá, porque `PAGADA` está excluida en el `WHERE`.
      montoBruto: monto,
    },
  });
  if (avance.count === 1) {
    return { flowInvoiceId, despues: estado, transiciono: true };
  }

  // No hubo avance: el invoice ya estaba en ese estado (replay), ya estaba PAGADA (notificación
  // rancia), o ganó otra corrida. Los DATOS igual se refrescan mientras el cobro siga abierto —
  // `intentos`, `proximoIntentoAt` y `paymentLink` cambian entre reintentos sin cambiar el estado, y
  // la página Plan (F10) los muestra. Sobre una fila PAGADA no se toca nada.
  if (estadoPrevio !== "PAGADA") {
    await tx.platformInvoice.updateMany({
      where: { flowInvoiceId, estado: { not: "PAGADA" } },
      data: {
        periodoInicio: campos.periodoInicio,
        periodoFin: campos.periodoFin,
        proximoIntentoAt: campos.proximoIntentoAt,
        intentos: campos.intentos,
        paymentLink: campos.paymentLink,
      },
    });
  }

  return {
    flowInvoiceId,
    despues: estadoPrevio ?? estado,
    transiciono: false,
  };
}

/**
 * Campos del espejo que se escriben tanto al crear como al avanzar la fila, sobre las claves REALES
 * de Flow (blocker 5).
 *
 * `pagadaAt` sale del bloque `payment`, que **solo viene en `invoice/get`**: si el invoice llegó
 * apenas embebido en `subscription/get`, queda `undefined` en vez de inventarse un `ahora` — la
 * columna dice cuándo se movió la plata, y eso lo sabe Flow, no nosotros. `intentos` sale de
 * `attemp_count` (el contador de verdad) y jamás de `attemped`, que es un flag de «se va a cobrar».
 */
function camposDelInvoice(inv: FlowInvoice, estado: PlatformInvoiceStatus) {
  return {
    estado,
    periodoInicio: aFecha(inv.period_start) ?? undefined,
    periodoFin: aFecha(inv.period_end) ?? undefined,
    pagadaAt: aFecha(inv.payment?.paymentData?.date) ?? undefined,
    // `next_attemp_date` (sic: typo del proveedor) — va en el correo de cobro fallido.
    proximoIntentoAt: aFecha(inv.next_attemp_date) ?? undefined,
    intentos: inv.attemp_count ?? 0,
    paymentLink: inv.paymentLink ?? undefined,
  };
}

/**
 * Monto del invoice como `Decimal` (I2). Flow lo manda como número JSON; se cruza a `Decimal` vía
 * STRING y nunca se hace aritmética con él. `undefined` si Flow lo omite (el caller cae al monto
 * snapshoteado de la suscripción).
 */
function montoDelInvoice(
  inv: Pick<FlowInvoice, "amount"> | undefined,
): Prisma.Decimal | undefined {
  if (inv?.amount === undefined || inv.amount === null) return undefined;
  return new Prisma.Decimal(String(inv.amount));
}

/** Completa el correo con los datos que necesita su plantilla. */
function hidratarCorreo({
  correo,
  destinatario,
  nombreTienda,
  invoicesFlow,
  montoDeLaSuscripcion,
}: {
  correo: CorreoDeFacturacion;
  destinatario: string;
  nombreTienda: string;
  invoicesFlow: FlowInvoice[];
  montoDeLaSuscripcion: Prisma.Decimal;
}): CorreoAEnviar {
  const inv = correo.flowInvoiceId
    ? invoicesFlow.find((i) => String(i.id) === correo.flowInvoiceId)
    : undefined;

  return {
    destinatario,
    datos: {
      tipo: correo.tipo,
      nombreTienda,
      montoBruto: (montoDelInvoice(inv) ?? montoDeLaSuscripcion).toString(),
      paymentLink: inv?.paymentLink ?? paymentLinkVigente(invoicesFlow),
      proximoIntentoAt: aFecha(inv?.next_attemp_date),
    },
  };
}

/**
 * `paymentLink` para los correos que no cuelgan de un invoice puntual (tienda en pausa): el de
 * cualquier invoice impago que Flow haya dejado con link. Es la palanca para regularizar (D4).
 *
 * Flow solo publica el link **mientras el invoice no está pagado**, así que el filtro de impago es
 * casi redundante; se deja igual porque el link de un invoice ya cobrado no es una palanca, es una
 * invitación a pagar dos veces.
 */
function paymentLinkVigente(invoices: FlowInvoice[]): string | null {
  const impago = invoices.find((i) => i.status !== 1 && Boolean(i.paymentLink));
  return impago?.paymentLink ?? null;
}

/**
 * Fecha de Flow → `Date`. Alias local de `fechaDeFlow`, que es quien sabe que Flow manda relojes de
 * pared **sin zona** y que son hora de Chile (ver `_fechaFlow.ts`): leerlas con `new Date` corría
 * los períodos y el próximo cobro 3 o 4 horas en producción, donde el proceso está en UTC.
 */
const aFecha = fechaDeFlow;
