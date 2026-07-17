import { type PrismaClient } from "@prisma/client";

/**
 * Use case público: el sorteo ACTIVO de una Tienda tal como lo ve el Comprador (F05/D8, ADR-0008).
 *
 * Distinto de `getSorteoDelPanel` (panel-scoped, exige membresía, devuelve los correos de los
 * participantes): esta vista es del STOREFRONT y devuelve SOLO datos públicos —
 * nombre/premio/fechas/bases + un CONTEO de participaciones—, NUNCA correos ni identidades
 * (privacidad, ADR-0004). El conteo es de TICKETS (`RaffleEntry` de grano fino, ADR-0012), no de
 * órdenes. Tenant-scoped por el contexto (subdominio), jamás por input (I1). El texto de las bases
 * sale del `Tenant` (`basesSorteo`, borrador del Organizador, ADR-0008); el `basesUrl` es el enlace
 * al archivo de bases (si lo hay). Sin sorteo ACTIVO ⇒ null (no hay sección).
 */
export async function getSorteoActivoStorefront({
  db,
  tenantId,
}: {
  db: PrismaClient;
  tenantId: string;
}): Promise<{
  id: string;
  nombre: string;
  premio: string;
  fechaInicio: Date;
  fechaFin: Date;
  basesUrl: string | null;
  basesTexto: string | null;
  totalParticipaciones: number;
} | null> {
  const raffle = await db.raffle.findFirst({
    where: { tenantId, estado: "ACTIVO" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nombre: true,
      premio: true,
      fechaInicio: true,
      fechaFin: true,
      basesUrl: true,
      // Solo el CONTEO de tickets — nunca los correos de las entries (privacidad, ADR-0004).
      _count: { select: { entries: true } },
      // Texto de las bases del Organizador (a nivel Tienda, ADR-0008).
      tenant: { select: { basesSorteo: true } },
    },
  });

  if (!raffle) return null;

  return {
    id: raffle.id,
    nombre: raffle.nombre,
    premio: raffle.premio,
    fechaInicio: raffle.fechaInicio,
    fechaFin: raffle.fechaFin,
    basesUrl: raffle.basesUrl,
    basesTexto: raffle.tenant.basesSorteo,
    totalParticipaciones: raffle._count.entries,
  };
}
