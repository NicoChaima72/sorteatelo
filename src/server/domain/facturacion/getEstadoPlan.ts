import {
  type PlatformExemptionReason,
  type PlatformInvoiceStatus,
  type PlatformPlan,
  type PlatformSubscriptionStatus,
  type PrismaClient,
} from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";
import {
  exencionVigente,
  suscripcionSostieneVenta,
} from "~/server/domain/facturacion/_gateVenta";
import {
  montoDelPlan,
  planParaNuevaSuscripcion,
} from "~/server/domain/facturacion/_precios";

/**
 * Use case del panel (F03/F10, D12): el estado de facturación de la Tienda — lo que alimenta el paso
 * «Activa tu plan» del checklist y la página «Plan» del admin.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005): el input SELECCIONA entre lo ya
 * autorizado por la membresía, jamás autoriza. Sin membresía ⇒ `FORBIDDEN`.
 *
 * **El precio que muestra la UI se calcula ACÁ** (I4): `planQueCorresponde` cuenta las suscripciones
 * activas del Pagador. La pantalla solo lo imprime — no hay forma de que el cliente proponga un plan
 * o un monto, porque no existe input para eso.
 *
 * Montos como STRING de `Decimal` (convención de `listarVentas`): el cliente formatea con `clp()` y
 * jamás hace aritmética.
 */

/** Un cobro del historial de la página Plan (F10/D12). */
export interface CobroDelHistorial {
  id: string;
  /** Cuándo se emitió (o cuándo lo registramos, si Flow no reportó la fecha). */
  fechaIso: string;
  /** Monto bruto como string `Decimal` (IVA incl.): el cliente lo formatea, no lo opera (I2). */
  montoBruto: string;
  estado: PlatformInvoiceStatus;
  /**
   * Link de Flow para pagar ESTE cobro, y solo si sigue impago. En un cobro ya pagado va `null` a
   * propósito: ofrecer el link de una mensualidad saldada sería invitar a pagarla dos veces (mismo
   * criterio que `paymentLinkVigente` en `getAvisoFacturacion`).
   */
  paymentLink: string | null;
}

/** Estados de invoice que representan una deuda VIVA: los únicos con link que ofrecer. */
const INVOICES_IMPAGOS: PlatformInvoiceStatus[] = ["FALLIDA", "VENCIDA"];

/**
 * Cuántos cobros muestra el historial. Un año de mensualidades: alcanza para reconocer un cargo y
 * para ver el patrón, y acota la lectura de una tabla que crece un invoice por mes y por Tienda.
 */
const TOPE_HISTORIAL = 12;

export interface EstadoPlan {
  /** Vende sin pagar: Exención vigente (D8). La UI muestra "Plan cortesía". */
  exenta: boolean;
  exencion: {
    motivo: PlatformExemptionReason;
    /** null = perpetua. */
    exentaHastaIso: string | null;
  } | null;
  /** La suscripción de la Tienda, o null si nunca activó / canceló y cerró el período. */
  suscripcion: {
    estado: PlatformSubscriptionStatus;
    plan: PlatformPlan;
    /** Monto bruto mensual (IVA incl.) como string `Decimal`. */
    montoBruto: string;
    periodoFinIso: string | null;
    proximoCobroAtIso: string | null;
    /** Fecha en que la cancelación surte efecto, si la pidió (D6). */
    cancelacionEfectivaAtIso: string | null;
    /** Cambio de plan programado para la próxima renovación (D7). */
    planProgramado: PlatformPlan | null;
  } | null;
  /**
   * Marca + últimos 4 de la tarjeta del Pagador de ESTA Tienda. NUNCA nada más (I7).
   *
   * Con una suscripción viva sale de `suscripcion.pagador` —el Pagador real, D1— y no de la sesión:
   * una Tienda puede tener más de una membresía (`TenantMembership`), y quién mira la página no es
   * necesariamente quien puso la tarjeta.
   */
  tarjeta: { marca: string | null; ultimos4: string | null } | null;
  /** Plan que le correspondería a esta Tienda si activara ahora (server-side, I4). */
  planQueCorresponde: PlatformPlan;
  /** Su monto bruto mensual, como string `Decimal`. */
  montoQueCorresponde: string;
  /**
   * `true` si el precio que corresponde es el de "tienda adicional" — o sea, el Pagador ya tiene
   * otra tienda activa. Lo usa la UI para EXPLICAR la mitad de precio en vez de mostrar un número
   * distinto del de la landing sin decir por qué.
   */
  esTiendaAdicional: boolean;
  /**
   * Historial de cobros de la Tienda (F10/D12): el espejo local de los invoices de Flow, del más
   * reciente al más viejo. No es contabilidad ni reemplaza la boleta (D13, fuera del producto): es
   * para que el Organizador reconozca los cargos de su tarjeta.
   */
  historial: CobroDelHistorial[];
  /**
   * `true` sii quien está mirando ES el Pagador de esta Tienda (D1) — el dueño del customer de Flow
   * y de la tarjeta. Es lo que habilita «Cambiar tarjeta»: una Tienda admite varias membresías, y
   * registrar una tarjeta nueva sobre el customer del Pagador desde otra cuenta haría que pague
   * alguien que no eligió pagar. Viaja como BOOLEANO derivado server-side; el `userId` del Pagador
   * no sale de acá.
   */
  soyElPagador: boolean;
  /**
   * `true` sii, cuando venza la Exención, la Tienda se queda SIN plan que sostenga la venta (F07/D8).
   * Es la condición para explicarle el después a una cortesía con fecha.
   *
   * Se calcula acá y no en el cliente a propósito: espejar «¿qué estados sostienen la venta?» en la
   * UI la haría derivar del gate el día que aparezca un estado nuevo. Con una suscripción viva es
   * `false` y la pantalla NO promete nada — decirle «desde ese día vas a poder activar tu plan» a
   * alguien a quien Flow ya le cobra todos los meses sería falso dos veces.
   */
  quedaSinPlanAlVencerLaExencion: boolean;
}

export async function getEstadoPlan({
  db,
  acceso,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  /** Inyectable: la vigencia de la Exención se evalúa LAZY (D8). */
  ahora?: Date;
}): Promise<EstadoPlan> {
  const tenantId = resolverTenantDelPanel(acceso);

  const [suscripcion, exencion, pagadorDeLaSesion, invoices] = await Promise.all([
    db.platformSubscription.findUnique({
      where: { tenantId },
      select: {
        estado: true,
        plan: true,
        montoBruto: true,
        periodoFin: true,
        proximoCobroAt: true,
        cancelacionEfectivaAt: true,
        planProgramado: true,
        // El Pagador REAL de esta Tienda (D1). La tarjeta que muestra la página es la suya, no la de
        // quien esté mirando: el `@unique` de `tenantId` garantiza que hay a lo sumo uno.
        pagador: {
          select: { userId: true, tarjetaMarca: true, tarjetaUltimos4: true },
        },
      },
    }),
    db.platformExemption.findUnique({
      where: { tenantId },
      select: { motivo: true, exentaHasta: true },
    }),
    db.platformBillingCustomer.findUnique({
      where: { userId: acceso.userId },
      select: { id: true, tarjetaMarca: true, tarjetaUltimos4: true },
    }),
    // Historial de cobros (F10). Se llega por la RELACIÓN (`subscription.tenantId`) y no por una
    // columna propia: `PlatformInvoice` es entidad de PLATAFORMA y a propósito no lleva `tenantId`
    // (D14). Como la suscripción es 1-1 con la Tienda, el filtro es exacto sin denormalizar nada.
    db.platformInvoice.findMany({
      where: { subscription: { tenantId } },
      // El más reciente primero. `createdAt` desempata porque `emitidaAt` lo puebla Flow y puede
      // faltar; y el `id` cierra el orden total (dos invoices del mismo instante no pueden
      // intercambiarse entre dos lecturas — la lección del cursor de `listarVentas`).
      orderBy: [{ emitidaAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: TOPE_HISTORIAL,
      select: {
        id: true,
        estado: true,
        montoBruto: true,
        emitidaAt: true,
        createdAt: true,
        paymentLink: true,
      },
    }),
  ]);

  // Pricing (I4/I8): las otras tiendas activas del Pagador PROSPECTIVO — quien está mirando, porque
  // es quien pondría la tarjeta si activara ahora (D12). A propósito NO es el pagador de la
  // suscripción: este número responde «cuánto me costaría», y con un plan ya vivo el monto que la UI
  // muestra es el snapshot `suscripcion.montoBruto`, no este. Se excluye ESTA tienda para que una
  // fila cancelada propia no se cuente como si fuera una segunda.
  const otrasDelPagador = pagadorDeLaSesion
    ? await db.platformSubscription.findMany({
        where: { pagadorId: pagadorDeLaSesion.id, tenantId: { not: tenantId } },
        select: { id: true, plan: true, estado: true, createdAt: true },
      })
    : [];
  const planQueCorresponde = planParaNuevaSuscripcion(
    otrasDelPagador.filter((s) => esActiva(s.estado)),
  );

  return {
    exenta: exencionVigente(exencion, ahora),
    exencion: exencion
      ? {
          motivo: exencion.motivo,
          exentaHastaIso: exencion.exentaHasta?.toISOString() ?? null,
        }
      : null,
    suscripcion: suscripcion
      ? {
          estado: suscripcion.estado,
          plan: suscripcion.plan,
          montoBruto: suscripcion.montoBruto.toFixed(0),
          periodoFinIso: suscripcion.periodoFin?.toISOString() ?? null,
          proximoCobroAtIso: suscripcion.proximoCobroAt?.toISOString() ?? null,
          cancelacionEfectivaAtIso:
            suscripcion.cancelacionEfectivaAt?.toISOString() ?? null,
          planProgramado: suscripcion.planProgramado,
        }
      : null,
    tarjeta: tarjetaDe(suscripcion?.pagador ?? pagadorDeLaSesion),
    historial: invoices.map((i) => ({
      id: i.id,
      estado: i.estado,
      montoBruto: i.montoBruto.toFixed(0),
      fechaIso: (i.emitidaAt ?? i.createdAt).toISOString(),
      paymentLink: INVOICES_IMPAGOS.includes(i.estado) ? i.paymentLink : null,
    })),
    // Sin suscripción todavía no hay Pagador: quien active el plan lo será (D12), así que la página
    // no le niega nada a nadie — simplemente no hay tarjeta que cambiar.
    soyElPagador: suscripcion
      ? suscripcion.pagador.userId === acceso.userId
      : false,
    planQueCorresponde,
    montoQueCorresponde: montoDelPlan(planQueCorresponde).toFixed(0),
    esTiendaAdicional: planQueCorresponde === "ADICIONAL",
    quedaSinPlanAlVencerLaExencion: !suscripcionSostieneVenta(
      suscripcion?.estado ?? null,
    ),
  };
}

/**
 * Proyecta la tarjeta de un Pagador al shape público. Los DOS únicos campos que existen (I7): marca
 * y últimos 4. Que el mapeo esté acá y no inline es lo que hace evidente en un solo lugar que no se
 * puede filtrar nada más — cualquier campo nuevo de `PlatformBillingCustomer` tendría que agregarse
 * a mano en esta función.
 */
function tarjetaDe(
  pagador: { tarjetaMarca: string | null; tarjetaUltimos4: string | null } | null | undefined,
): { marca: string | null; ultimos4: string | null } | null {
  if (!pagador) return null;
  return { marca: pagador.tarjetaMarca, ultimos4: pagador.tarjetaUltimos4 };
}
