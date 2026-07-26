import { type PrismaClient, type RaffleStatus } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";

interface SorteoDelPanel {
  id: string;
  nombre: string;
  premio: string;
  estado: RaffleStatus;
  fechaInicio: Date;
  fechaFin: Date;
  /** URL pública de la imagen del premio (bucket público, ADR-0013); null ⇒ sin imagen (plantilla-rica F03). */
  premioImageUrl: string | null;
  /**
   * URL pública del PDF de BASES del sorteo (bucket público, admin-bases-pdf F01/F02/D1/D2). null ⇒
   * sin bases cargadas ⇒ el gate de publicación BLOQUEA con este sorteo ACTIVO (F03/ADR-0008). El
   * panel lo usa para mostrar el estado «bases cargadas» y sembrar el uploader.
   */
  basesPdfUrl: string | null;
  /**
   * Prefijo con el que se PRESENTAN los Números de este sorteo (F08/D12, invariante I12):
   * `Tenant.prefijoTicket` ⇒ `ARMY-1043`. `null` ⇒ Números pelados, como antes de F08.
   *
   * Viaja server-side junto al sorteo —y no lo busca el panel por su cuenta— para que la superficie
   * no pueda mostrar un texto distinto del que sale en el correo (I12: UN solo punto de aplicación,
   * `~/lib/numerosDelSorteo`). Vive en el SORTEO y no en la respuesta porque a nivel de presentación
   * eso ES: el prefijo con el que se leen los Números de este sorteo. Si algún día D12 evoluciona a
   * un override per-`Raffle`, cambia la derivación de acá adentro y ningún consumidor se entera.
   */
  prefijoTicket: string | null;
  /**
   * Participaciones AGRUPADAS por correo, con su conteo de tickets (S2/D6, ADR-0012) y los
   * **Números del sorteo** de ese comprador (ADR-0024), ascendentes. El panel los muestra plegados
   * en rangos con `formatearNumerosDelSorteo` (`~/lib/numerosDelSorteo`); se devuelven como lista
   * —no como string ya formateado— para que el use case no cargue con presentación.
   */
  participantes: Array<{
    email: string;
    tickets: number;
    ultimaInscripcion: Date;
    numeros: number[];
  }>;
  /** Total de TICKETS del sorteo (nº de RaffleEntry = suma de tickets de todos los correos). */
  totalParticipaciones: number;
  ganadorEmail: string | null;
  /**
   * Número del sorteo GANADOR (ADR-0024 §5). `null` si no se ejecutó, o si se ejecutó ANTES de
   * ADR-0024 (histórico: se sabe el correo, no cuál de sus tickets ganó) ⇒ la UI degrada.
   */
  ganadorNumero: number | null;
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
  const tenantId = resolverTenantDelPanel(acceso);

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
      premioImageUrl: true,
      basesPdfUrl: true,
      ganadorEmail: true,
      ganadorNumero: true,
      ejecutadoAt: true,
      ejecutadoPor: true,
      // Prefijo de presentación de los Números (F08/D12): es de la TIENDA, así que se lee por la
      // relación del raffle en la MISMA lectura — un `findUnique` aparte sobre `Tenant` sería un
      // round trip más contra el pooler por cada visita al panel.
      tenant: { select: { prefijoTicket: true } },
      entries: {
        select: { email: true, createdAt: true, numero: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!raffle) return { sorteo: null };

  const { entries, tenant, ...resto } = raffle;

  // Agrupa los tickets por correo (S2/D6). Las entries vienen orderBy createdAt desc, así que el
  // primer visto de cada correo es su ticket más reciente ⇒ el orden de `participantes` respeta
  // "quién participó más recientemente primero".
  const porCorreo = new Map<
    string,
    { email: string; tickets: number; ultimaInscripcion: Date; numeros: number[] }
  >();
  for (const e of entries) {
    const acumulado = porCorreo.get(e.email);
    if (acumulado) {
      acumulado.tickets += 1;
      if (e.createdAt > acumulado.ultimaInscripcion) {
        acumulado.ultimaInscripcion = e.createdAt;
      }
      if (e.numero !== null) acumulado.numeros.push(e.numero);
    } else {
      porCorreo.set(e.email, {
        email: e.email,
        tickets: 1,
        ultimaInscripcion: e.createdAt,
        numeros: e.numero !== null ? [e.numero] : [],
      });
    }
  }

  // Los Números salen ASCENDENTES (las entries llegan por createdAt desc): es el orden en que se
  // presentan y en que se pliegan a rangos. La guarda de `null` cubre solo la ventana de backfill
  // — con el schema cerrado (`numero` NOT NULL) el filtro no descarta nada.
  const participantes = [...porCorreo.values()].map((p) => ({
    ...p,
    numeros: p.numeros.sort((a, b) => a - b),
  }));

  return {
    sorteo: {
      ...resto,
      prefijoTicket: tenant.prefijoTicket,
      participantes,
      totalParticipaciones: entries.length,
    },
  };
}
