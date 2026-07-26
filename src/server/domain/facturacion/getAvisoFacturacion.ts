import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import {
  derivarAvisoFacturacion,
  type AvisoFacturacion,
} from "~/server/domain/facturacion/_gateVenta";
import { cargarGateVenta } from "~/server/domain/facturacion/cargarGateVenta";

/**
 * Use case del CHROME del panel (F05/D4, ADR-0026): qué avisarle al Organizador sobre la facturación
 * de la Tienda que está administrando, y si el panel va en modo restringido.
 *
 * La consulta el layout en TODA página del panel, así que está armada para ser barata en el caso
 * normal: la lectura del gate es una sola fila por `tenantId` (`@unique`, con sus dos 1-1 embebidas) y
 * el `paymentLink` solo se busca cuando de verdad hay algo que avisar.
 *
 * Scopeada por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005): el input SELECCIONA entre lo ya
 * autorizado por la membresía, jamás autoriza. Sin membresía ⇒ `FORBIDDEN`.
 *
 * El `enPausa` que devuelve es PRESENTACIÓN —apagar los ítems del rail que van a redirigir igual—, no
 * el gate: la restricción real la aplica `guardPaginaAdmin` server-side en cada página. Un rail que
 * muestra ítems que rebotan es peor que un rail corto, pero la autoridad no está acá.
 */

export interface EstadoAvisoFacturacion {
  /** Qué avisar; `null` = nada (tienda al día, exenta, o todavía configurándose). */
  aviso: AvisoFacturacion | null;
  /**
   * Link de Flow para regularizar el cobro impago, si hay uno. Se busca para todos los avisos de
   * DEUDA —incluidos `SIN_PLAN` y `EXENCION_EXPIRADA`, donde lo normal es re-suscribir pero puede
   * quedar un invoice `VENCIDA` con link vigente del plan anterior (el slot de `PlatformSubscription`
   * se reusa, D6)—, y queda `null` si no había ninguno o si Flow no lo entregó. El único aviso que
   * ni siquiera paga la consulta es `EXENCION_POR_EXPIRAR`: no porque no PUEDA haber deuda (una
   * cortesía otorgada sobre una suscripción en pausa la tiene), sino porque mientras la cortesía
   * viva la deuda se silencia a propósito — ver la decisión escrita en `derivarAvisoFacturacion`.
   */
  paymentLink: string | null;
  /** `true` sii el panel va restringido a la página Plan (`enPausaPorFacturacion`). */
  enPausa: boolean;
  /**
   * Cuándo termina la cortesía, SOLO cuando el aviso es `EXENCION_POR_EXPIRAR` (F07/D8). El banner
   * nombra el día: un «tu cortesía termina pronto» obligaría al Organizador a averiguar cuándo.
   * `null` en cualquier otro caso — incluida la cortesía perpetua, que no termina nunca.
   */
  exentaHastaIso: string | null;
}

/** Estados de invoice que representan una deuda VIVA: son los únicos con link que ofrecer. */
const INVOICES_IMPAGOS = ["FALLIDA", "VENCIDA"] as const;

export async function getAvisoFacturacion({
  db,
  acceso,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  /** Inyectable: la vigencia de la Exención se evalúa LAZY (D8). */
  ahora?: Date;
}): Promise<EstadoAvisoFacturacion> {
  const tenantId = resolverTenantDelPanel(acceso);

  const gate = await cargarGateVenta({ db, where: { id: tenantId }, ahora });
  const aviso = derivarAvisoFacturacion({
    gate,
    estadoSuscripcion: gate.estadoSuscripcion,
    exencion: gate.exencion,
    ahora,
  });

  // El `paymentLink` solo se busca cuando hay una DEUDA que ofrecer pagar. `EXENCION_POR_EXPIRAR` es
  // un preaviso, no un cobro impago: en el caso normal la tienda cortesía no tiene ni suscripción ni
  // invoices, y en el caso raro (cortesía sobre una suscripción en pausa) la deuda está silenciada
  // mientras la cortesía viva. En los dos, esta consulta —que corre en CADA página del panel— no
  // tendría a quién ofrecerle el link.
  const hayDeuda = aviso !== null && aviso !== "EXENCION_POR_EXPIRAR";

  return {
    aviso,
    paymentLink: hayDeuda ? await paymentLinkVigente({ db, tenantId }) : null,
    enPausa: gate.enPausa,
    exentaHastaIso:
      aviso === "EXENCION_POR_EXPIRAR"
        ? (gate.exencion?.exentaHasta?.toISOString() ?? null)
        : null,
  };
}

/**
 * El `paymentLink` del cobro IMPAGO más reciente de esta Tienda (D4). Filtrar por
 * `estado in (FALLIDA, VENCIDA)` no es cosmético: ofrecerle el link de un invoice ya PAGADA sería
 * invitar al Organizador a pagar dos veces la misma mensualidad.
 *
 * Se llega al invoice por la relación (`subscription.tenantId`) y no por un `tenantId` propio, porque
 * `PlatformInvoice` es entidad de PLATAFORMA y a propósito no tiene esa columna (D14): la suscripción
 * es 1-1 con la Tienda, así que el filtro es exacto sin denormalizar nada.
 */
async function paymentLinkVigente({
  db,
  tenantId,
}: {
  db: PrismaClient;
  tenantId: string;
}): Promise<string | null> {
  const invoice = await db.platformInvoice.findFirst({
    where: {
      subscription: { tenantId },
      estado: { in: [...INVOICES_IMPAGOS] },
      paymentLink: { not: null },
    },
    // El más reciente: si hubo más de un intento fallido, el link que sirve es el del último cobro.
    // `createdAt` como desempate porque `emitidaAt` es nullable (lo puebla Flow).
    orderBy: [{ emitidaAt: "desc" }, { createdAt: "desc" }],
    select: { paymentLink: true },
  });
  return invoice?.paymentLink ?? null;
}
