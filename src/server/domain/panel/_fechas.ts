/**
 * Aritmética de fechas del panel SIN librería (backend-conventions § Aritmética de fechas): solo
 * `Date.UTC` nativo sobre fechas UTC a medianoche. Usado por las ventanas de días del dashboard
 * (serie de 14 días, deltas de período). Agregar `date-fns`/`dayjs`/`luxon` sería decisión bloqueante.
 */

/** Medianoche UTC del día de `d` — ancla estable para bucketear/comparar por día. */
export function inicioDiaUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Resta `dias` a la medianoche UTC de `d` (rueda de mes/año la maneja `Date.UTC`). */
export function restarDiasUTC(d: Date, dias: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dias));
}

/** Clave de día UTC `YYYY-MM-DD` para agrupar órdenes por día (sin `Intl`, estable). */
export function claveDiaUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
