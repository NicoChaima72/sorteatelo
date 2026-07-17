/**
 * Formato de dinero y números para la UI (es-CL). El dinero del dominio es `Decimal`
 * (CLAUDE.md § Regla de oro): llega al cliente como string `Decimal.toFixed(…)` y acá se
 * cruza a `Number()` SOLO en el borde de presentación para formatear — nunca se hace
 * aritmética con ese número ni vuelve al server. CLP no tiene decimales reales, así que el
 * cruce es seguro. Ver `docs/agents/frontend-conventions.md` § Formato de dinero.
 */

const NF_CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const NF_NUM = new Intl.NumberFormat("es-CL");

/** Formatea un monto CLP. Acepta el string `Decimal` del server o un número ya cruzado. */
export function clp(monto: string | number): string {
  return NF_CLP.format(typeof monto === "string" ? Number(monto) : monto);
}

/** Formatea un entero con separador de miles es-CL (conteos, no montos). */
export function num(n: number): string {
  return NF_NUM.format(n);
}

const NF_FECHA = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Fecha + hora corta es-CL (ej. "28 jun, 14:22"). El `Date` llega vía superjson. */
export function fechaHora(d: Date): string {
  return NF_FECHA.format(d);
}

const NF_DIA = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Fecha corta SIN hora es-CL (ej. "28 jun 2026"). Para rangos de fechas (sorteo). */
export function fecha(d: Date): string {
  return NF_DIA.format(d);
}
