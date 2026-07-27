import { type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";

/**
 * **Verificador público de tickets** (verificador-tickets F01): dado un correo, los Números del
 * sorteo ACTIVO de esa Tienda que le pertenecen. Es la superficie que la landing promete y que las
 * referencias del nicho llevan en el menú — el Comprador no tiene cuenta (ADR-0004), así que su
 * correo ES su identidad.
 *
 * **Qué viaja y qué no (I2/D1).** SOLO los Números del sorteo (identidad PÚBLICA del ticket,
 * ADR-0024), el prefijo de la Tienda y el NOMBRE del sorteo —para que quien busca sepa qué está
 * verificando—. Cero PII de la orden: ni el propio correo se ecoa desde el server, ni montos, ni
 * ítems, ni nada de un tercero. La garantía es del TIPO: en este resultado no hay dónde meterlo.
 *
 * **Anti-enumeración (D4).** Un correo sin tickets devuelve la MISMA forma con `numeros: []`. No se
 * distingue «este correo nunca compró» de «compró pero sin tickets»: la superficie no confirma la
 * existencia de compras de terceros. Lo único observable es la pertenencia al sorteo activo, que es
 * exactamente lo que esta página viene a mostrar.
 *
 * **Solo el sorteo ACTIVO (D2/I4).** Los tickets de un sorteo CERRADO no salen por acá: ni
 * histórico, ni ganador, ni «ganaste». Sin sorteo activo la query de entries ni siquiera corre.
 *
 * **Solo órdenes PAGADAS, por construcción (D7).** No hay join a `Order.estado` porque no hace
 * falta: las únicas dos escrituras de `RaffleEntry` son `aplicarEfectosPostPago` (dentro de la `$tx`
 * que confirma el pago) y el arrastre de participantes de `crearSorteo` (copia tickets ya
 * legítimos). Una entry existe ⇔ hubo pago confirmado. Si algún día apareciera un tercer writer que
 * cree entries antes del pago, este use case pasa a mentir y hay que agregarle el join.
 *
 * Tenant-scoped por el CONTEXTO (I1/ADR-0005): el `tenantId` sale del subdominio resuelto
 * server-side, jamás del input. El mismo correo con tickets en otra Tienda no aparece acá.
 */
export async function verificarTickets({
  db,
  tenantId,
  email,
  permitirIntento,
}: {
  db: PrismaClient;
  tenantId: string;
  /** Correo tal cual lo tipeó el Comprador; se normaliza acá (D6). */
  email: string;
  /**
   * Gate anti-abuso (D5), inyectado por el borde con la clave `tenant+IP`. Se consulta ANTES de
   * tocar la DB: una cuota agotada no debe costar ni una query. Es un seam y no el limitador
   * concreto para que el use case no sepa nada del transporte (la IP es del request, no del dominio).
   */
  permitirIntento: () => boolean;
}): Promise<{
  /** El sorteo que se está verificando, o `null` si la Tienda no tiene ninguno ACTIVO. */
  sorteo: { nombre: string } | null;
  /** Números del sorteo del correo buscado, ascendentes. `[]` = sin tickets (D4). */
  numeros: number[];
  /** `Tenant.prefijoTicket` — viaja junto con los números (mismo criterio que `getEstadoOrden`). */
  prefijo: string | null;
}> {
  if (!permitirIntento()) {
    throw new DomainError(
      "TOO_MANY_REQUESTS",
      "Demasiadas búsquedas seguidas. Espera un minuto y vuelve a intentarlo.",
    );
  }

  // El sorteo ACTIVO + el prefijo de la Tienda en UN solo viaje: el prefijo cuelga de la relación,
  // así que no hace falta una segunda query al `Tenant`. Mismo `orderBy` que
  // `getSorteoActivoStorefront`: si hubiera más de un ACTIVO (invariante de use case, no constraint),
  // las dos superficies tienen que hablar del MISMO sorteo.
  const raffle = await db.raffle.findFirst({
    where: { tenantId, estado: "ACTIVO" },
    orderBy: { createdAt: "desc" },
    select: { id: true, nombre: true, tenant: { select: { prefijoTicket: true } } },
  });

  // Sin sorteo activo no hay nada que buscar y NO se consultan entries (D2): la página lo comunica
  // con su estado vacío. El prefijo tampoco viaja — sin números no significa nada.
  if (!raffle) return { sorteo: null, numeros: [], prefijo: null };

  const buscado = email.trim();
  const entries = await db.raffleEntry.findMany({
    // `raffleId` ya es tenant-bound (el sorteo se resolvió por `tenantId`); el `tenantId` va igual
    // como defensa en profundidad, mismo criterio que el filtro doble de `getEstadoOrden`.
    where: {
      raffleId: raffle.id,
      tenantId,
      // Insensible a MAYÚSCULAS (D6): quien compró con `Ana@Gmail.com` y busca `ana@gmail.com`
      // encuentra sus tickets. Espeja la identidad de persona del sistema de correos
      // (`identidadDeCorreo` = trim + lowercase), sin reescribir el snapshot de la entry.
      //
      // Ojo con la asimetría, que es real y no un descuido: `mode:"insensitive"` pliega mayúsculas
      // y NADA MÁS — Postgres no trimea el valor almacenado. El `trim` de arriba corre solo sobre lo
      // que tipeó la persona. Alcanza porque el snapshot no puede traer espacios: `Order.email` pasa
      // por `z.string().email()` antes de existir, y `RaffleEntry.email` lo copia verbatim.
      email: { equals: buscado, mode: "insensitive" },
    },
    select: { numero: true },
    orderBy: { numero: "asc" },
  });

  return {
    sorteo: { nombre: raffle.nombre },
    numeros: entries.map((e) => e.numero),
    prefijo: raffle.tenant.prefijoTicket,
  };
}
