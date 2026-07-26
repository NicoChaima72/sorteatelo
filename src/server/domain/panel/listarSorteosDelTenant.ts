import { type PrismaClient, type RaffleStatus } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";

interface SorteoDeLista {
  id: string;
  nombre: string;
  premio: string;
  estado: RaffleStatus;
  fechaInicio: Date;
  fechaFin: Date;
  /** URL pública del PDF de BASES del sorteo (admin-bases-pdf F02/D2); null ⇒ sin bases cargadas. */
  basesPdfUrl: string | null;
  premioImageUrl: string | null;
  ganadorEmail: string | null;
  /**
   * Número del sorteo GANADOR (ADR-0024 §5): el Historial anuncia el TICKET que ganó, no solo el
   * correo. `null` en sorteos ejecutados ANTES de ADR-0024 (histórico irreconstruible) ⇒ la UI
   * muestra solo el correo.
   */
  ganadorNumero: number | null;
  /**
   * Prefijo con el que se PRESENTA el `ganadorNumero` en el Historial (F08/D12, I12): `ARMY` ⇒
   * `Nº ARMY-1057`. Es el MISMO dato que devuelve `getSorteoDelPanel`, y llega por fila para que
   * ningún consumidor tenga que cruzar dos queries para escribir un número.
   */
  prefijoTicket: string | null;
  ejecutadoAt: Date | null;
  ejecutadoPor: string | null;
  /** Total de TICKETS (nº de RaffleEntry) del sorteo — para el historial y el modal de arrastre. */
  totalParticipaciones: number;
  createdAt: Date;
}

/**
 * Use case de LECTURA del panel (F01/D12): lista TODOS los sorteos de la Tienda (orderBy `createdAt`
 * desc) con su conteo de tickets y datos de ganador. Scopeado por el `tenantId` resuelto SERVER-SIDE
 * (I1/I2/ADR-0005); un tenant ajeno JAMÁS aparece. Sirve tres consumidores del panel: la sección
 * **Historial** (sorteos CERRADOS con su ganador), la fuente del **modal de arrastre** de
 * participantes (sorteos pasados a elegir, D13) y los valores iniciales del **form de edición** (F02)
 * — así NO se re-toca `getSorteoDelPanel` (que sigue leyendo solo el sorteo actual con sus
 * participaciones agrupadas).
 */
export async function listarSorteosDelTenant({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{ sorteos: SorteoDeLista[] }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const raffles = await db.raffle.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nombre: true,
      premio: true,
      estado: true,
      fechaInicio: true,
      fechaFin: true,
      basesPdfUrl: true,
      premioImageUrl: true,
      ganadorEmail: true,
      ganadorNumero: true,
      ejecutadoAt: true,
      ejecutadoPor: true,
      createdAt: true,
      _count: { select: { entries: true } },
      // Prefijo de presentación de los Números (F08/D12): se lee por la relación en la MISMA query
      // (todas las filas son del mismo tenant, así que es el mismo valor repetido — barato al lado
      // de un round trip extra contra el pooler).
      tenant: { select: { prefijoTicket: true } },
    },
  });

  return {
    sorteos: raffles.map(({ _count, tenant, ...resto }) => ({
      ...resto,
      totalParticipaciones: _count.entries,
      prefijoTicket: tenant.prefijoTicket,
    })),
  };
}
