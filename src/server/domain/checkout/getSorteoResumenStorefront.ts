import { type PrismaClient } from "@prisma/client";

/**
 * Use case público: el RESULTADO de los Raffle CERRADOS de una Tienda tal como lo ve el Comprador
 * (catálogo-v2 F06). Alimenta el widget `ganadores` en modo `automatico` (y, a futuro,
 * `resultado_sorteo`). Complementa `getSorteoActivoStorefront` (que da el ACTIVO): acá van los YA
 * EJECUTADOS, con el ganador ENMASCARADO + agregados.
 *
 * PRIVACIDAD (ADR-0004, regla de oro): la identidad del comprador es su correo y NO se expone. El
 * ganador se muestra SOLO enmascarado (`ma***@gmail.com`); jamás el correo completo, jamás la lista de
 * participantes (solo el conteo de tickets, `_count.entries`). El enmascarado se hace SERVER-SIDE:
 * el correo completo nunca sale de este borde. Tenant-scoped por el contexto (subdominio), jamás por
 * input (I1). Solo raffles con `ejecutadoAt` no-null (ejecutados de verdad, con ganador). Sin cerrados
 * ⇒ `[]` (el widget se auto-oculta).
 */

/** Cota dura del `take` (un widget no infla la query aunque pida más). */
const MAX_CERRADOS = 20;

export interface GanadorResumenStorefront {
  id: string;
  /** Nombre del sorteo. */
  nombre: string;
  premio: string;
  fechaFin: Date;
  /** Correo del ganador ENMASCARADO (`ma***@gmail.com`), o `null` si no hay ganador registrado. */
  ganadorEnmascarado: string | null;
  /** Conteo de tickets (nunca la lista de correos). */
  totalParticipaciones: number;
}

/**
 * Enmascara un correo para exhibición pública: 2 primeros caracteres de la parte local + `***` +
 * dominio (`mariajose@gmail.com` ⇒ `ma***@gmail.com`). Correo nulo, sin `@` o sin parte local ⇒ `null`
 * (no mostramos nada antes que exponer PII). Pura y determinista.
 */
export function enmascararEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return null; // sin `@` o sin parte local ⇒ no exhibimos nada
  const local = email.slice(0, at);
  const dominio = email.slice(at); // incluye el `@`
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***${dominio}`;
}

export async function getSorteoResumenStorefront({
  db,
  tenantId,
  max = MAX_CERRADOS,
}: {
  db: PrismaClient;
  tenantId: string;
  max?: number;
}): Promise<GanadorResumenStorefront[]> {
  const raffles = await db.raffle.findMany({
    where: { tenantId, estado: "CERRADO", ejecutadoAt: { not: null } }, // ejecutados de verdad
    orderBy: { ejecutadoAt: "desc" },
    take: Math.min(Math.max(1, max), MAX_CERRADOS),
    select: {
      id: true,
      nombre: true,
      premio: true,
      fechaFin: true,
      ganadorEmail: true, // se ENMASCARA acá; el correo completo NUNCA sale de este borde (ADR-0004)
      _count: { select: { entries: true } }, // solo el conteo, jamás los correos de las entries
    },
  });

  return raffles.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    premio: r.premio,
    fechaFin: r.fechaFin,
    ganadorEnmascarado: enmascararEmail(r.ganadorEmail),
    totalParticipaciones: r._count.entries,
  }));
}
