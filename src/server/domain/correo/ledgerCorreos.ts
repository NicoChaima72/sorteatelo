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
 * **La identidad de una persona** en este dominio: su email normalizado (trim + lowercase). No es
 * cosmética: el unique de Postgres es case-sensitive, así que `Ana@X.cl` y `ana@x.cl` serían DOS
 * filas ⇒ dos correos a la misma persona (I2). El `email` snapshot de la fila NO se toca — ahí queda
 * lo que escribió el Comprador; lo que se normaliza es la llave de identidad.
 *
 * **Exportada, y con una razón**: quien agrupa por persona en OTRO lado —los Números de un
 * comprador para su correo de resultado, por ejemplo— tiene que usar exactamente esta regla. Con dos
 * definiciones, alguien que compró dos veces escribiendo su correo distinto recibiría un correo con
 * la mitad de sus números y ningún test lo notaría.
 */
export function identidadDeCorreo(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Separador de la clave. Los ids de fila son cuids (alfanuméricos), así que el `:` nunca aparece
 * dentro del `raffleId` y el primer tramo se puede recuperar sin ambigüedad (ver `raffleIdDeClave`).
 */
const SEPARADOR_CLAVE = ":";

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
  return `${raffleId}${SEPARADOR_CLAVE}${identidadDeCorreo(email)}`;
}

/**
 * El `raffleId` de vuelta desde una clave de RESULTADO o RECORDATORIO. Vive ACÁ, pegado a los
 * constructores, y no en el resolvedor que la consume: el formato de la clave es una decisión de
 * este módulo, y dos módulos que lo conozcan por separado se desincronizan en silencio (la misma
 * lección que el helper de plegado de bloques de `~/lib` — cuyo nombre no se escribe acá a
 * propósito: el guard I12 de F08 lee el fuente crudo y no distingue código de prosa).
 *
 * Se corta por el PRIMER separador a propósito: el resto de la clave puede contener `:` (un email
 * no, pero el offset del recordatorio sí es otro tramo) y lo único que se promete acá es el padre.
 */
export function raffleIdDeClave(clave: string): string {
  return clave.split(SEPARADOR_CLAVE)[0]!;
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
  return `${raffleId}:${offsetHoras}:${identidadDeCorreo(email)}`;
}

/**
 * El offset de vuelta desde una clave de RECORDATORIO. Vive acá por lo mismo que
 * `raffleIdDeClave`: el formato de la clave tiene UN dueño. El resolvedor lo necesita para elegir
 * la variante del correo (informativo vs. CTA, D3) — el tipo del ledger es uno solo para los dos.
 *
 * Devuelve `null` si el tramo no es un número: una clave de otro tipo (o corrupta) no elige
 * variante por accidente, y el resolvedor la salta INTACTA.
 */
export function offsetDeClave(clave: string): number | null {
  const tramo = clave.split(SEPARADOR_CLAVE)[1];
  if (tramo === undefined || !/^\d+$/.test(tramo)) return null;
  return Number(tramo);
}

/**
 * Las filas del ledger que produce EJECUTAR UN SORTEO (F04/C4-C5, D4): una `RESULTADO_GANADOR` para
 * quien ganó y una `RESULTADO_NO_GANADOR` por cada persona distinta que participó y no ganó.
 *
 * Vive acá, junto a `claveResultado`, porque las dos reglas que lo definen SON reglas de la clave:
 *
 * - **Una persona = una clave.** `RaffleEntry` tiene una fila por TICKET, así que el mismo correo
 *   aparece tantas veces como tickets compró. Deduplicar por la clave (y no por el string crudo del
 *   email) es lo que hace que `Ana@x.cl` y `ana@x.cl` cuenten como UNA persona — el email se
 *   normaliza al armar la clave, y el índice de Postgres es case-sensitive.
 * - **El ganador se excluye por la MISMA clave**, no comparando strings: si no, alguien que compró
 *   con dos casings distintos recibiría "ganaste" y "no ganaste" a la vez (las claves son distintas
 *   sin normalizar, y el unique es `[tipo, clave]`, así que el ledger no lo frenaría).
 *
 * El `email` de la fila conserva el snapshot tal como lo escribió el Comprador (el primero que se
 * vea de esa persona): la clave normaliza IDENTIDAD, no el destinatario.
 */
export function correosDeResultado({
  tenantId,
  raffleId,
  ganadorEmail,
  emails,
}: {
  /** Tenant del sorteo, resuelto server-side (I1). */
  tenantId: string;
  raffleId: string;
  /** `RaffleEntry.email` del ticket ganador. */
  ganadorEmail: string;
  /** Todos los emails de las participaciones, con repetidos: uno por ticket. */
  emails: string[];
}): CorreoAEncolar[] {
  const claveGanador = claveResultado({ raffleId, email: ganadorEmail });
  const correos: CorreoAEncolar[] = [
    {
      tenantId,
      tipo: "RESULTADO_GANADOR",
      clave: claveGanador,
      email: ganadorEmail,
    },
  ];

  const vistas = new Set([claveGanador]);
  for (const email of emails) {
    const clave = claveResultado({ raffleId, email });
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    correos.push({
      tenantId,
      tipo: "RESULTADO_NO_GANADOR",
      clave,
      email,
    });
  }
  return correos;
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
