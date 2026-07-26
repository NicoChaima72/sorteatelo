import {
  Prisma,
  type PlatformInvoiceStatus,
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
import {
  derivarEstadoInvoice,
  esAnulacionSospechosa,
} from "~/server/domain/facturacion/_invoiceFlow";
import {
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
  input: { flowSubscriptionId: string };
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
  const invoicesFlow = flowSub.invoices ?? [];

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

      const fechas = {
        periodoInicio: aFecha(flowSub.period_start) ?? undefined,
        periodoFin: aFecha(flowSub.period_end) ?? undefined,
        proximoCobroAt: aFecha(flowSub.next_invoice_date) ?? undefined,
      };

      // Avance ATÓMICO del estado de la suscripción: el `WHERE` condicional es el check-and-act, y su
      // `count` es lo que autoriza el correo de «en pausa»/«regularizada». El precedente es
      // `domain/pago/confirmarPagoDeOrden.ts` (y el fix de `liberarReservas` en F03): el `UPDATE` toma
      // el row-lock, así que de dos corridas concurrentes una ve `count: 1` y la otra `count: 0`.
      const { count } = await tx.platformSubscription.updateMany({
        where: { id: local.id, estado: { not: derivado } },
        data: {
          estado: derivado,
          ...fechas,
          // Cerrada de verdad en Flow: se sella cuándo surtió efecto. La cancelación la PIDE F06; acá
          // solo se registra el hecho, y una sola vez.
          ...(derivado === "CANCELADA" && local.cancelacionEfectivaAt === null
            ? { cancelacionEfectivaAt: ahora }
            : {}),
        },
      });

      if (count === 0) {
        // El estado ya era el derivado (replay, o ganó otra corrida): las FECHAS igual se refrescan —
        // son datos que convergen, no una transición, y el cron de F09 las lee.
        await tx.platformSubscription.updateMany({
          where: { id: local.id },
          data: fechas,
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

  // El único caso ambiguo de la derivación (ver `esAnulacionSospechosa`): un invoice sin saldo que YA
  // agotó los reintentos. Se respeta la lectura conservadora (ANULADA, no suspende) pero se deja
  // rastro: si Flow resultara marcar así los incobrables, esto es lo que delata que una tienda morosa
  // no se está suspendiendo, en vez de descubrirlo cuadrando los ingresos meses después.
  if (esAnulacionSospechosa(inv)) {
    console.warn(
      "[facturacion] invoice ANULADA con los reintentos agotados: si Flow marca así los INCOBRABLES, esta tienda debería estar en pausa y no lo está — verificar contra el sandbox",
      { flowInvoiceId, flowSubscriptionId, intentos: inv.attemp },
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

/** Campos del espejo que se escriben tanto al crear como al avanzar la fila. */
function camposDelInvoice(inv: FlowInvoice, estado: PlatformInvoiceStatus) {
  return {
    estado,
    periodoInicio: aFecha(inv.period_start) ?? undefined,
    periodoFin: aFecha(inv.period_end) ?? undefined,
    pagadaAt: aFecha(inv.payment_date) ?? undefined,
    // `next_attemp_date` (sic: typo del proveedor) — va en el correo de cobro fallido.
    proximoIntentoAt: aFecha(inv.next_attemp_date) ?? undefined,
    intentos: inv.attemp ?? 0,
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
 */
function paymentLinkVigente(invoices: FlowInvoice[]): string | null {
  const impago = invoices.find((i) => i.paid !== 1 && Boolean(i.paymentLink));
  return impago?.paymentLink ?? null;
}

/** Fecha de Flow (ISO o `YYYY-MM-DD`) → `Date`. `null`/inválida ⇒ null (Flow puede omitirlas). */
function aFecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
