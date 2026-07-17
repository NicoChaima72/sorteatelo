import { type PrismaClient, type RaffleStatus } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";

interface SorteoDelPanel {
  id: string;
  nombre: string;
  premio: string;
  estado: RaffleStatus;
  fechaInicio: Date;
  fechaFin: Date;
  /** Participaciones AGRUPADAS por correo, con su conteo de tickets (S2/D6, ADR-0012). */
  participantes: Array<{ email: string; tickets: number; ultimaInscripcion: Date }>;
  /** Total de TICKETS del sorteo (nº de RaffleEntry = suma de tickets de todos los correos). */
  totalParticipaciones: number;
  ganadorEmail: string | null;
  ejecutadoAt: Date | null;
  ejecutadoPor: string | null;
}

/**
 * Use case del panel (F05 interna; conteo por ticket en F sorteo-por-producto, ADR-0012): lee el
 * sorteo ACTUAL de la Tienda (el más reciente) con sus participaciones reales. Scopeado por el
 * `tenantId` resuelto SERVER-SIDE (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`. Sin sorteo sembrado
 * ⇒ `sorteo: null` (empty state).
 *
 * Cada `RaffleEntry` es un TICKET (grano fino, ADR-0012). El panel cuenta *participaciones/tickets*,
 * no órdenes, y AGRUPA por correo (más honesto que listar el mismo correo N veces): cada participante
 * muestra su nº de tickets. `totalParticipaciones` = nº de RaffleEntry.
 *
 * Los modelos `Raffle`/`RaffleEntry` los creó la fase F02 del roadmap; este use case solo LEE.
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
        select: { email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!raffle) return { sorteo: null };

  const { entries, ...resto } = raffle;

  // Agrupa los tickets por correo (S2/D6). Las entries vienen orderBy createdAt desc, así que el
  // primer visto de cada correo es su ticket más reciente ⇒ el orden de `participantes` respeta
  // "quién participó más recientemente primero".
  const porCorreo = new Map<
    string,
    { email: string; tickets: number; ultimaInscripcion: Date }
  >();
  for (const e of entries) {
    const acumulado = porCorreo.get(e.email);
    if (acumulado) {
      acumulado.tickets += 1;
      if (e.createdAt > acumulado.ultimaInscripcion) {
        acumulado.ultimaInscripcion = e.createdAt;
      }
    } else {
      porCorreo.set(e.email, {
        email: e.email,
        tickets: 1,
        ultimaInscripcion: e.createdAt,
      });
    }
  }

  return {
    sorteo: {
      ...resto,
      participantes: [...porCorreo.values()],
      totalParticipaciones: entries.length,
    },
  };
}
