import {
  type CorreoEnviadoType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

/**
 * Ledger de correos al Comprador — el CLAIM (F02, ADR-0027 §1/§2; CONTEXT § Ledger de correos).
 *
 * Este módulo es la mitad PRODUCTORA de la máquina: convierte una intención de envío en una fila
 * `CorreoEnviado` PENDIENTE, idempotente por `@@unique([tipo, clave])`. La mitad consumidora (el
 * drenado por cron) vive en `drenarCorreosPendientes.ts`.
 *
 * Reglas duras:
 * - **I2 (jamás un correo duplicado)**: encolar es `createMany({ skipDuplicates: true })` contra el
 *   unique. Dos corridas concurrentes del cron —o un replay del webhook de Flow— no pueden crear
 *   dos filas para la misma clave, sin locks distribuidos. El que decide es el índice de Postgres.
 * - **La clave la arman los constructores de ACÁ, nunca el caller con un template string**: la
 *   seguridad cross-tenant del unique-sin-tenantId depende de que la clave empiece por un id
 *   tenant-bound, y la unicidad por persona depende de que el email vaya normalizado
 *   (`schema-guardian` 2026-07-26 — ver el comentario de `CorreoEnviado.clave` en el schema).
 * - **I1 (tenancy)**: `tenantId` lo pone el caller desde el dato ya resuelto server-side (la orden,
 *   el sorteo), jamás desde un input del Comprador.
 */

/**
 * Cliente Prisma o cliente de transacción: encolar tiene que poder correr DENTRO de la
 * `$transaction` de `confirmarPagoDeOrden` (F03) o suelto desde el cron (F04/F06).
 */
export type ClienteLedger = PrismaClient | Prisma.TransactionClient;

/** Presupuesto de reintentos REALES antes de degradar a FALLIDO (ADR-0027 §5). */
export const MAX_INTENTOS = 3;

export interface CorreoAEncolar {
  tenantId: string;
  tipo: CorreoEnviadoType;
  /** Clave natural determinística — armada SIEMPRE por un constructor de este módulo. */
  clave: string;
  /** Snapshot del destinatario (identidad del Comprador, ADR-0004). */
  email: string;
}

/**
 * Normaliza el email ANTES de meterlo en una clave (trim + lowercase). No es cosmética: el unique
 * de Postgres es case-sensitive, así que `Ana@X.cl` y `ana@x.cl` serían DOS filas ⇒ dos correos a
 * la misma persona (I2). El `email` snapshot de la fila NO se toca — ahí queda lo que escribió el
 * Comprador; lo que se normaliza es la llave de identidad.
 */
function emailEnClave(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Clave de la confirmación de compra (C1): el `orderId` pelado. Ya es único global y tenant-bound,
 * y una orden genera UN correo de confirmación.
 */
export function claveConfirmacionCompra({ orderId }: { orderId: string }): string {
  return orderId;
}

/**
 * Clave del resultado del sorteo (C4/C5): `raffleId:email`. UNA por persona por sorteo — el mismo
 * email con varios tickets recibe un solo correo, gane o no (el tipo distingue ganador de no
 * ganador y el unique es `[tipo, clave]`).
 */
export function claveResultado({
  raffleId,
  email,
}: {
  raffleId: string;
  email: string;
}): string {
  return `${raffleId}:${emailEnClave(email)}`;
}

/**
 * Clave del recordatorio (C2/C3): `raffleId:offsetHoras:email`. El offset es parte de la identidad
 * porque T-48h y T-6h son DOS correos distintos al mismo comprador del mismo sorteo (D3).
 */
export function claveRecordatorio({
  raffleId,
  offsetHoras,
  email,
}: {
  raffleId: string;
  offsetHoras: number;
  email: string;
}): string {
  return `${raffleId}:${offsetHoras}:${emailEnClave(email)}`;
}

/**
 * Encola N correos como filas PENDIENTE. Devuelve **cuántas filas nuevas** se crearon: las claves
 * ya presentes se saltan en silencio (eso ES la idempotencia, no un error). Un `0` significa "ya
 * estaba encolado", nunca "falló".
 */
export async function encolarCorreos({
  db,
  correos,
}: {
  db: ClienteLedger;
  correos: CorreoAEncolar[];
}): Promise<number> {
  if (correos.length === 0) return 0;
  const { count } = await db.correoEnviado.createMany({
    data: correos,
    skipDuplicates: true,
  });
  return count;
}
