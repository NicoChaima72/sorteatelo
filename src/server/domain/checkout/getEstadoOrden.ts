import { type OrderStatus, type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";

/**
 * Estado de UNA orden por su token de Flow (builder-tanda-1 F08/D12), más —cuando el webhook ya la
 * confirmó— los **Números del sorteo** de esa compra. SOLO-LECTURA: la transición a `PAGADO` la hace
 * EXCLUSIVAMENTE el webhook server-side contra Flow (I6/ADR-0001); esta query solo LEE el resultado,
 * no confirma nada. La página de retorno la sondea para pasar a celebración + confetti y, desde
 * `checkout-retorno-numeros-sorteo` F01/D1, para dibujar los boletos con los números.
 *
 * **Qué viaja y qué no (I-T6 + D1).** Sigue prohibido el correo, el total y los ítems. Los Números
 * del sorteo SÍ viajan porque no son PII ni montos: son la identidad PÚBLICA del ticket (ADR-0024) —
 * lo mismo que ya le llega al Comprador por correo y lo que la landing le promete ver. Quien tiene el
 * token de Flow de la orden es quien acaba de pagarla.
 *
 * **La URL de entrega** (F02/D1 de `entrega-postpago-retorno-y-reacceso`) viaja por el MISMO camino y
 * con la misma regla: solo con `PAGADO`, y solo si la orden ya tiene un `DownloadGrant`. Es la ruta
 * relativa `/entrega/<grantToken>` de la página de entrega que ya existía para el enlace del correo —
 * no una superficie de descarga nueva. Que el retorno pueda ofrecer la descarga en el acto sin que
 * esta query deje de ser solo-lectura es justamente el punto: el enlace aparece porque el WEBHOOK ya
 * confirmó, jamás porque el navegador volvió de Flow (I1/ADR-0001).
 *
 * **Los números NO se exponen antes de la confirmación** (D1): mientras la orden esté PENDIENTE o
 * FALLIDA —o el token sea ajeno/inexistente— `numeros` es `null` = «todavía no sé». `null` y `[]` son
 * dos respuestas distintas a propósito (D4): `[]` es una orden PAGADA cuyos productos no participan
 * del sorteo (o que se pagó sin sorteo activo), y la UI celebra sin bloque de boletos en vez de
 * prometer números que no existen.
 *
 * Tenant-scoped por el contexto (I1/ADR-0005): el `tenantId` viene del subdominio resuelto server-side,
 * nunca del input. El `token` de Flow es global-único (rutea token⇒Payment), pero además se filtra por
 * `tenantId` como defensa: una Tienda jamás lee el estado de una orden de otra. Token inexistente o de
 * otro tenant ⇒ respuesta neutral idéntica, sin filtrar existencia.
 */
export async function getEstadoOrden({
  db,
  tenantId,
  token,
  permitirIntento = () => true,
}: {
  db: PrismaClient;
  tenantId: string;
  token: string;
  /**
   * Gate anti-abuso por IP (F03/D3), inyectado por el borde con la clave `tenant+IP` — la IP es del
   * transporte y este use case no la conoce, igual que en `verificarTickets`. Default `true`: el
   * limitador falla ABIERTO (I8), y en ESTA superficie eso importa más que en ninguna otra — quien la
   * sondea acaba de pagar y está mirando la pantalla.
   */
  permitirIntento?: () => boolean;
}): Promise<{
  estado: OrderStatus | null;
  /** Números del sorteo de la orden. `null` = aún no confirmada; `[]` = pagada sin tickets (D4). */
  numeros: number[] | null;
  /** `Tenant.prefijoTicket` (F08/D12 de correos). Solo viaja junto con los números. */
  prefijo: string | null;
  /**
   * Ruta RELATIVA a la página de entrega de la orden, `/entrega/<grantToken>` (F02/D1). **Ausente**
   * —no `null`— cuando la orden no está PAGADA, cuando el token es ajeno/inexistente o cuando no hay
   * grants: así la respuesta neutral queda byte por byte como antes de F02, sin una clave nueva que
   * insinúe que del otro lado hay algo (I3).
   */
  urlEntrega?: string;
}> {
  if (!permitirIntento()) {
    throw new DomainError(
      "TOO_MANY_REQUESTS",
      "Estamos recibiendo muchas consultas. Espera un momento y vuelve a intentarlo.",
    );
  }

  // UNA sola consulta (D1): el polling ya existe y los números —y ahora el grant— llegan por el mismo
  // viaje. La proyección los trae siempre —una orden sin confirmar no tiene `RaffleEntry` ni
  // `DownloadGrant`, así que los joins vuelven vacíos— pero quien decide si SALEN del use case es el
  // estado, no la consulta.
  const payment = await db.payment.findFirst({
    where: { token, tenantId },
    select: {
      order: {
        select: {
          estado: true,
          raffleEntries: { select: { numero: true }, orderBy: { numero: "asc" } },
          // UNO cualquiera alcanza —`/entrega/<token>` muestra la orden COMPLETA, así que todos los
          // grants de la orden llevan a la misma página—, pero el `orderBy` no es decorativo: sin él
          // Postgres devuelve el orden físico de la tabla, y dos pollings del mismo retorno podrían
          // mandar al Comprador a dos URLs distintas de la misma compra. Se ordena por `id` (unique,
          // total) y no por `createdAt`, que empata: los grants de una orden nacen en el mismo
          // `createMany`.
          downloadGrants: { select: { token: true }, orderBy: { id: "asc" }, take: 1 },
        },
      },
      tenant: { select: { prefijoTicket: true } },
    },
  });

  if (!payment) return { estado: null, numeros: null, prefijo: null };

  const estado = payment.order.estado;
  if (estado !== "PAGADO") return { estado, numeros: null, prefijo: null };

  // Una orden PAGADA sin grants es un estado imposible (nacen en la misma `$tx` que la marca PAGADA),
  // pero acá se degrada en vez de asumirlo: reventar el polling de alguien que YA pagó, por un
  // enlace que es un ATAJO al correo, sería el peor intercambio posible. Sin URL, el retorno celebra
  // igual y la entrega va por correo, que es el respaldo que D4 mantiene a propósito.
  const grantToken = payment.order.downloadGrants[0]?.token;

  return {
    estado,
    numeros: payment.order.raffleEntries.map((e) => e.numero),
    prefijo: payment.tenant.prefijoTicket,
    ...(grantToken ? { urlEntrega: `/entrega/${grantToken}` } : {}),
  };
}
