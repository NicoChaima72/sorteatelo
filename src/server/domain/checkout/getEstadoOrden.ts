import { type OrderStatus, type PrismaClient } from "@prisma/client";

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
}: {
  db: PrismaClient;
  tenantId: string;
  token: string;
}): Promise<{
  estado: OrderStatus | null;
  /** Números del sorteo de la orden. `null` = aún no confirmada; `[]` = pagada sin tickets (D4). */
  numeros: number[] | null;
  /** `Tenant.prefijoTicket` (F08/D12 de correos). Solo viaja junto con los números. */
  prefijo: string | null;
}> {
  // UNA sola consulta (D1): el polling ya existe y los números llegan por el mismo viaje. La
  // proyección los trae siempre —una orden sin confirmar no tiene `RaffleEntry`, así que el join
  // vuelve vacío— pero quien decide si SALEN del use case es el estado, no la consulta.
  const payment = await db.payment.findFirst({
    where: { token, tenantId },
    select: {
      order: {
        select: {
          estado: true,
          raffleEntries: { select: { numero: true }, orderBy: { numero: "asc" } },
        },
      },
      tenant: { select: { prefijoTicket: true } },
    },
  });

  if (!payment) return { estado: null, numeros: null, prefijo: null };

  const estado = payment.order.estado;
  if (estado !== "PAGADO") return { estado, numeros: null, prefijo: null };

  return {
    estado,
    numeros: payment.order.raffleEntries.map((e) => e.numero),
    prefijo: payment.tenant.prefijoTicket,
  };
}
