import { type PrismaClient } from "@prisma/client";

/**
 * Use case público: el sorteo ACTIVO de una Tienda tal como lo ve el Comprador (F05/D8, ADR-0008).
 *
 * Distinto de `getSorteoDelPanel` (panel-scoped, exige membresía, devuelve los correos de los
 * participantes): esta vista es del STOREFRONT y devuelve SOLO datos públicos —
 * nombre/premio/fechas/bases + un CONTEO de participaciones—, NUNCA correos ni identidades
 * (privacidad, ADR-0004). El conteo es de TICKETS (`RaffleEntry` de grano fino, ADR-0012), no de
 * órdenes. Tenant-scoped por el contexto (subdominio), jamás por input (I1). Las BASES ya NO viajan
 * acá (admin-bases-pdf F07/D3): eran un texto del Tenant (`basesSorteo`) y un enlace externo del
 * Raffle (`basesUrl`), ambos dropeados. Hoy son un PDF por Sorteo que la página `/bases` sirve desde
 * su propio loader (`storefront/basesDelSorteo`). Sin sorteo ACTIVO ⇒ null (no hay sección).
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
  premioImageUrl: string | null;
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
      // URL pública de la imagen del premio (bucket público, ADR-0013); null ⇒ gradiente temático (D7).
      premioImageUrl: true,
      // Solo el CONTEO de tickets — nunca los correos de las entries (privacidad, ADR-0004).
      _count: { select: { entries: true } },
    },
  });

  if (!raffle) return null;

  return {
    id: raffle.id,
    nombre: raffle.nombre,
    premio: raffle.premio,
    fechaInicio: raffle.fechaInicio,
    fechaFin: raffle.fechaFin,
    premioImageUrl: raffle.premioImageUrl,
    totalParticipaciones: raffle._count.entries,
  };
}
