/**
 * Núcleo PURO de la elegibilidad de canje de un [[Cupón de plataforma]] (F03/F08, D9, ADR-0026).
 *
 * Flow aporta el DESCUENTO (`couponId` en `subscription/create`) pero no el concepto de «código
 * canjeable»: el código repartible, su expiración, su tope de canjes y la trazabilidad de quién
 * entró por cuál son modelo PROPIO. Este módulo decide si un canje procede; la reserva atómica y
 * la llamada a Flow viven en el use case.
 */

/** Por qué se rechaza un canje. Es para el LOG y los tests — al Organizador se le da un mensaje neutral. */
export type MotivoRechazoCupon =
  | "INEXISTENTE"
  | "INACTIVO"
  | "EXPIRADO"
  | "AGOTADO"
  | "YA_CANJEADO";

/** Datos del cupón que la elegibilidad necesita (shape propio, no el modelo de Prisma). */
export interface DatosCupon {
  activo: boolean;
  /** Hasta cuándo se puede CANJEAR (distinto de cuánto DURA el descuento). null = sin límite. */
  expiraAt: Date | null;
  /** Tope de canjes; null = ilimitado. `1` modela el código personal (D9). */
  maxCanjes: number | null;
  canjes: number;
}

export type ResultadoElegibilidad =
  | { ok: true }
  | { ok: false; motivo: MotivoRechazoCupon };

/**
 * Normaliza un código tipeado por el Organizador: sin espacios (ni internos) y en MAYÚSCULAS.
 *
 * Es load-bearing, no cosmético: `PlatformCoupon.codigo` es `@unique` y el unique de Postgres es
 * case-sensitive, así que sin normalizar «army2026» y «ARMY2026» serían dos filas distintas. Se
 * normaliza en LOS DOS extremos — al crear el cupón (script CLI) y al canjearlo — porque un código
 * se reparte por WhatsApp y vuelve tipeado de cualquier forma.
 */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/\s+/g, "").toUpperCase();
}

/**
 * Decide si el canje procede. Orden de los rechazos pensado para el LOG (el más específico primero):
 * un código agotado y expirado a la vez se reporta como expirado, que es lo que le pasó primero.
 *
 * `yaCanjeadoPorLaTienda` viene del `@@unique([couponId, tenantId])`: la misma Tienda no canjea dos
 * veces el mismo código. Esa es la guarda DURA; el contador `canjes` cubre la carrera entre tiendas
 * distintas y se verifica de nuevo, atómicamente, al reservar.
 */
export function evaluarCanje({
  cupon,
  ahora,
  yaCanjeadoPorLaTienda,
}: {
  cupon: DatosCupon | null;
  ahora: Date;
  yaCanjeadoPorLaTienda: boolean;
}): ResultadoElegibilidad {
  if (!cupon) return { ok: false, motivo: "INEXISTENTE" };
  if (!cupon.activo) return { ok: false, motivo: "INACTIVO" };
  if (cupon.expiraAt !== null && cupon.expiraAt.getTime() <= ahora.getTime()) {
    return { ok: false, motivo: "EXPIRADO" };
  }
  if (yaCanjeadoPorLaTienda) return { ok: false, motivo: "YA_CANJEADO" };
  if (cupon.maxCanjes !== null && cupon.canjes >= cupon.maxCanjes) {
    return { ok: false, motivo: "AGOTADO" };
  }
  return { ok: true };
}

/**
 * Mensaje ÚNICO para cualquier rechazo (D9). Deliberadamente NEUTRAL: no distingue «ese código no
 * existe» de «ese código ya se usó», porque la diferencia convertiría el input en un oráculo para
 * adivinar códigos ajenos por fuerza bruta — y los códigos son cortos y repartibles. El motivo real
 * queda en el log del server, donde sirve para soporte y no para un atacante.
 */
export const MENSAJE_CUPON_INVALIDO =
  "Ese código no es válido o ya no se puede usar. Revísalo, o continúa sin código.";
