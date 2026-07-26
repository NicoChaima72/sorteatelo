import {
  type PlatformSubscriptionStatus,
  type PrismaClient,
} from "@prisma/client";

import { type CorreoAEnviar } from "~/server/domain/correo/plantillasFacturacion";
import {
  exencionPorAvisar,
  inicioVentanaAvisoExencion,
  limiteAvisoExencion,
  limiteAvisoRenovacion,
  montoDelProximoCobro,
} from "~/server/domain/facturacion/_avisosProgramados";

/**
 * Barrido del **cron diario de facturación** (F09/D11, ADR-0026): los dos correos que Flow no
 * dispara — el aviso previo de cada renovación (7) y el de la cortesía que se termina (6).
 *
 * Recibe el cliente Prisma INYECTADO y **devuelve las intenciones de correo**, no las envía: el
 * dominio no conoce el proveedor y el despacho lo hace el mismo borde que el webhook y la
 * cancelación (`enviarCorreosFacturacion`). Mismo reparto de F04/F06.
 *
 * **Reconciliation-based** (backend-conventions § Jobs): pregunta «¿qué cobro se viene y no está
 * avisado?», nunca «¿qué toca hoy?». Una corrida perdida se recupera en la siguiente y una duplicada
 * no manda nada dos veces, porque quien decide no es una lectura sino el `count` de un `updateMany`
 * condicional sobre la marca de idempotencia.
 *
 * **Marcar primero, enviar después**: el claim se sella ANTES de devolver el correo. Si el envío
 * falla, el aviso se pierde; si fuera al revés, una corrida duplicada lo mandaría dos veces. Es la
 * dirección de falla que la convención fija para los correos — trabajo sin hacer es recuperable,
 * trabajo hecho dos veces no.
 */

type DbAvisos = Pick<PrismaClient, "platformSubscription" | "platformExemption">;

/**
 * Estados en los que TODAVÍA hay un cobro por venir. Es el mismo par que `suscripcionSostieneVenta`
 * del gate —y no por casualidad: una suscripción que sostiene la venta es una que Flow sigue
 * cobrando—, pero se declara aparte porque responde otra pregunta. Si algún día un estado sostuviera
 * la venta sin generar cobro (o al revés), acá tiene que poder divergir sin tocar el gate.
 */
const ESTADOS_CON_RENOVACION: readonly PlatformSubscriptionStatus[] = [
  "AL_DIA",
  "COBRO_PENDIENTE",
];

export interface ResultadoAvisos {
  /** Correos a despachar POST-claim (I9). */
  correos: CorreoAEnviar[];
  /** Cuántas renovaciones se avisaron en esta corrida (para el body del cron). */
  renovaciones: number;
  /** Cuántas cortesías por vencer se avisaron. */
  exenciones: number;
}

export async function barrerAvisosDeFacturacion({
  db,
  ahora = new Date(),
}: {
  db: DbAvisos;
  /** "Ahora" INYECTADO: toda la decisión es temporal y así es testeable en sus bordes. */
  ahora?: Date;
}): Promise<ResultadoAvisos> {
  // Las dos mitades son independientes: una Tienda exenta no tiene cobro que anunciar y una que
  // paga no tiene cortesía que se venza. Se corren en serie —no en paralelo— porque el barrido
  // completo cabe de sobra en la corrida y así el log del cron se lee en orden.
  const renovaciones = await avisarRenovaciones({ db, ahora });
  const exenciones = await avisarExencionesPorVencer({ db, ahora });

  return {
    correos: [...renovaciones, ...exenciones],
    renovaciones: renovaciones.length,
    exenciones: exenciones.length,
  };
}

/**
 * Aviso previo de renovación (correo 7). La ventana la fija `DIAS_AVISO_RENOVACION`; el filtro
 * `proximoCobroAt > ahora` deja fuera los cobros cuya fecha ya pasó — ese hecho ya no es un aviso
 * previo, y el webhook (F04) tiene sus propios correos para el cobro efectivo o fallido.
 */
async function avisarRenovaciones({
  db,
  ahora,
}: {
  db: DbAvisos;
  ahora: Date;
}): Promise<CorreoAEnviar[]> {
  const suscripciones = await db.platformSubscription.findMany({
    where: {
      // Solo los planes que van a generar un cobro. `EN_PAUSA_POR_PAGO` queda fuera porque ahí lo
      // que corresponde es pagar la deuda (banner + correo (3)), no anunciar la mensualidad
      // siguiente; `CANCELADA` porque no hay cobro; y `cancelacionSolicitadaAt` porque
      // `cancel_at_period_end` ya detuvo el cobro nuevo aunque el estado siga activo (D6).
      estado: { in: [...ESTADOS_CON_RENOVACION] },
      cancelacionSolicitadaAt: null,
      proximoCobroAt: { gt: ahora, lte: limiteAvisoRenovacion(ahora) },
    },
    select: {
      id: true,
      proximoCobroAt: true,
      montoBruto: true,
      planProgramado: true,
      planProgramadoDesde: true,
      tenant: { select: { nombre: true } },
      pagador: { select: { email: true } },
    },
    orderBy: { id: "asc" },
  });

  const correos: CorreoAEnviar[] = [];

  for (const s of suscripciones) {
    const proximoCobroAt = s.proximoCobroAt;
    if (!proximoCobroAt) continue;

    // Guard ATÓMICO de idempotencia: la marca guarda PARA QUÉ COBRO se avisó, no un booleano — hay
    // que volver a avisar cada período. Quien decide es el `count`: dos corridas solapadas del cron
    // pueden leer las dos la misma marca vieja, pero solo una gana el update y manda el correo.
    const { count } = await db.platformSubscription.updateMany({
      where: {
        id: s.id,
        OR: [
          { renovacionAvisadaPara: null },
          { renovacionAvisadaPara: { not: proximoCobroAt } },
        ],
      },
      data: { renovacionAvisadaPara: proximoCobroAt },
    });
    if (count !== 1) continue;

    correos.push({
      destinatario: s.pagador.email,
      datos: {
        tipo: "RENOVACION_PROXIMA",
        nombreTienda: s.tenant.nombre,
        montoBruto: montoDelProximoCobro({ ...s, proximoCobroAt }).toFixed(0),
        proximoCobroAt,
      },
    });
  }

  return correos;
}

/**
 * Aviso de que la cortesía se termina (correo 6). Barre la MISMA ventana que abre el banner del
 * panel (`DIAS_AVISO_EXPIRACION_EXENCION`), y el `where` deja fuera por construcción las dos
 * exenciones que no son un evento: la perpetua (`exentaHasta: null`, el grandfathering del
 * despliegue) y la que ya venció —eso no es un preaviso sino un hecho consumado, con su propio
 * aviso en el gate.
 */
async function avisarExencionesPorVencer({
  db,
  ahora,
}: {
  db: DbAvisos;
  ahora: Date;
}): Promise<CorreoAEnviar[]> {
  const exenciones = await db.platformExemption.findMany({
    where: { exentaHasta: { gt: ahora, lte: limiteAvisoExencion(ahora) } },
    select: {
      id: true,
      exentaHasta: true,
      tenant: {
        select: {
          nombre: true,
          // El estado del plan decide si hay algo que avisar (ver `exencionPorAvisar`) y, cuando
          // existe, su Pagador es el receptor correcto: es el cliente de la Plataforma (D10).
          platformSubscription: {
            select: { estado: true, pagador: { select: { email: true } } },
          },
          // Sin suscripción no hay Pagador: el receptor es el Organizador de la Tienda. Membresía
          // MÁS ANTIGUA, el mismo criterio con el que el repo resuelve «el Organizador» para el
          // reply-to de los correos al Comprador (`enviarCorreoDescargaDeOrden`).
          memberships: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { user: { select: { email: true } } },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const correos: CorreoAEnviar[] = [];

  for (const e of exenciones) {
    const exentaHasta = e.exentaHasta;
    if (!exentaHasta) continue;

    const suscripcion = e.tenant.platformSubscription;
    if (
      !exencionPorAvisar({
        exencion: { exentaHasta },
        estadoSuscripcion: suscripcion?.estado ?? null,
        ahora,
      })
    ) {
      continue;
    }

    const destinatario =
      suscripcion?.pagador.email ?? e.tenant.memberships[0]?.user.email;
    if (!destinatario) {
      // Una Tienda sin membresías (borradas a mano) no tiene a quién avisarle. Se salta y se sigue:
      // no hay nada que hacer, y abortar el barrido castigaría a las demás.
      console.warn(
        "[facturacion] cortesía por vencer sin destinatario: la Tienda no tiene Pagador ni Organizador",
        { exencionId: e.id },
      );
      continue;
    }

    // Guard ATÓMICO, igual que el de la renovación. La marca se compara contra el INICIO de la
    // ventana de esta cortesía y no como booleano: si el Operador la estira por DB directa, el
    // aviso vuelve a salir solo.
    const { count } = await db.platformExemption.updateMany({
      where: {
        id: e.id,
        OR: [
          { avisoExpiracionEnviadoAt: null },
          {
            avisoExpiracionEnviadoAt: {
              lt: inicioVentanaAvisoExencion(exentaHasta),
            },
          },
        ],
      },
      data: { avisoExpiracionEnviadoAt: ahora },
    });
    if (count !== 1) continue;

    correos.push({
      destinatario,
      datos: {
        tipo: "EXENCION_POR_VENCER",
        nombreTienda: e.tenant.nombre,
        exentaHasta,
      },
    });
  }

  return correos;
}
