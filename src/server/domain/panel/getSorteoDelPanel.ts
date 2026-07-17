import { type PrismaClient, type RaffleStatus } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";

interface SorteoDelPanel {
  id: string;
  nombre: string;
  premio: string;
  estado: RaffleStatus;
  fechaInicio: Date;
  fechaFin: Date;
  participantes: Array<{ id: string; email: string; createdAt: Date }>;
  totalParticipantes: number;
  ganadorEmail: string | null;
  ejecutadoAt: Date | null;
  ejecutadoPor: string | null;
}

/**
 * Use case del panel (F05 interna): lee el sorteo ACTUAL de la Tienda (el más reciente) con
 * sus participaciones reales. Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005);
 * sin membresía ⇒ `FORBIDDEN`. Sin sorteo sembrado ⇒ `sorteo: null` (empty state).
 *
 * Los modelos `Raffle`/`RaffleEntry` los creó la fase F02 del roadmap; F05 solo LEE (y, en
 * `ejecutarSorteo`, escribe los campos de ejecución auditable que F05 agregó aditivamente).
 */
export async function getSorteoDelPanel({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{ sorteo: SorteoDelPanel | null }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const raffle = await db.raffle.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nombre: true,
      premio: true,
      estado: true,
      fechaInicio: true,
      fechaFin: true,
      ganadorEmail: true,
      ejecutadoAt: true,
      ejecutadoPor: true,
      entries: {
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!raffle) return { sorteo: null };

  const { entries, ...resto } = raffle;
  return {
    sorteo: {
      ...resto,
      participantes: entries,
      totalParticipantes: entries.length,
    },
  };
}
