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
      ejecutadoAt: true,
      ejecutadoPor: true,
      createdAt: true,
      _count: { select: { entries: true } },
    },
  });

  return {
    sorteos: raffles.map(({ _count, ...resto }) => ({
      ...resto,
      totalParticipaciones: _count.entries,
    })),
  };
}
