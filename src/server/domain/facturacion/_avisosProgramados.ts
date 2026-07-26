/**
 * Núcleo PURO de los avisos que dispara el **cron diario** (F09/D11, ADR-0026). Sin DB ni red: el
 * barrido carga las filas y este módulo decide a quién le toca un correo.
 *
 * Son los dos avisos que **Flow no manda por nosotros**: el previo a cada renovación (7) —Flow cobra
 * sin anunciar— y el de que la cortesía se termina (6). Los dos son PREVENTIVOS: hablan de algo que
 * todavía no pasó, así que el criterio se evalúa contra un "ahora" inyectado, igual que el gate.
 */

import {
  type PlatformPlan,
  type PlatformSubscriptionStatus,
  type Prisma,
} from "@prisma/client";

import {
  DIAS_AVISO_EXPIRACION_EXENCION,
  exencionPorExpirar,
  suscripcionSostieneVenta,
} from "~/server/domain/facturacion/_gateVenta";
import { montoDelPlan } from "~/server/domain/facturacion/_precios";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Con cuánta anticipación se avisa una renovación.
 *
 * **Son 2 días y no 1 a propósito.** El cron de Vercel es best-effort (ADR-0027 / backend-conventions
 * § Jobs reconciliation-based): puede saltarse una corrida. Con una ventana de 1 día, la corrida
 * perdida se lleva el aviso puesto — el cobro llega sin anuncio, que es exactamente lo que este
 * correo existe para evitar. Con 2, la corrida siguiente todavía alcanza a avisar ANTES del cobro.
 *
 * Es también la razón por la que el correo nombra la FECHA en vez de decir «mañana»: el mismo texto
 * tiene que ser verdadero saliendo con 40 horas de anticipación o con 12.
 */
export const DIAS_AVISO_RENOVACION = 2;

/** Fin de la ventana de barrido de renovaciones: hasta acá se buscan cobros por avisar. */
export function limiteAvisoRenovacion(ahora: Date): Date {
  return new Date(ahora.getTime() + DIAS_AVISO_RENOVACION * MS_POR_DIA);
}

/**
 * Cuánto se va a cobrar EN ESE cobro (I2 — `Decimal`, jamás aritmética con `number`).
 *
 * Normalmente es el snapshot de la suscripción (`montoBruto`). Pero si hay un cambio de plan
 * PROGRAMADO (D7: el Pagador canceló su tienda full y una adicional se promueve) y su fecha de
 * vigencia cae en o antes de este cobro, lo que Flow va a cobrar es el monto del plan NUEVO — el
 * salto real es de $12.500 a $25.000. Anunciar el monto viejo sería preparar exactamente la sorpresa
 * que este correo existe para evitar.
 */
export function montoDelProximoCobro(s: {
  montoBruto: Prisma.Decimal;
  planProgramado: PlatformPlan | null;
  planProgramadoDesde: Date | null;
  proximoCobroAt: Date;
}): Prisma.Decimal {
  if (
    s.planProgramado &&
    s.planProgramadoDesde &&
    s.planProgramadoDesde.getTime() <= s.proximoCobroAt.getTime()
  ) {
    return montoDelPlan(s.planProgramado);
  }
  return s.montoBruto;
}

/** Fin de la ventana de barrido de exenciones: la misma que abre el banner del panel (F07/D8). */
export function limiteAvisoExencion(ahora: Date): Date {
  return new Date(ahora.getTime() + DIAS_AVISO_EXPIRACION_EXENCION * MS_POR_DIA);
}

/**
 * Desde cuándo cuenta como «ya avisada» una cortesía: el inicio de SU ventana de preaviso.
 *
 * La marca (`avisoExpiracionEnviadoAt`) no se lee como un booleano sino contra esta fecha. Así, si el
 * Operador ESTIRA la cortesía por DB directa (D8: se administran a mano), la marca vieja queda fuera
 * de la ventana nueva y el aviso vuelve a salir cuando corresponda — sin que nadie tenga que acordarse
 * de limpiar la columna, y sin schema nuevo.
 */
export function inicioVentanaAvisoExencion(exentaHasta: Date): Date {
  return new Date(
    exentaHasta.getTime() - DIAS_AVISO_EXPIRACION_EXENCION * MS_POR_DIA,
  );
}

/**
 * `true` sii a esta Tienda hay que avisarle que su cortesía se termina (correo 6, D8/D11).
 *
 * Son las MISMAS dos condiciones que el banner del panel (`derivarAvisoFacturacion`), y comparten
 * los predicados a propósito: si el cron llamara solo a `exencionPorExpirar`, el correo diría
 * justo lo que el banner ya decidió callar — «tu tienda va a necesitar un plan» a alguien que tiene
 * uno vivo y a quien Flow ya le cobra todos los meses. Un correo, además, no se puede des-decir.
 */
export function exencionPorAvisar(d: {
  exencion: { exentaHasta: Date | null };
  estadoSuscripcion: PlatformSubscriptionStatus | null;
  ahora: Date;
}): boolean {
  if (suscripcionSostieneVenta(d.estadoSuscripcion)) return false;
  return exencionPorExpirar(d.exencion, d.ahora);
}
