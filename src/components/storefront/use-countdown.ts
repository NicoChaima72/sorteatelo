import { useEffect, useState } from "react";

/**
 * Cuenta regresiva al cierre del sorteo (plantilla-rica F04/D9). El chip del header y la vitrina
 * del sorteo muestran cuánto falta para `Raffle.fechaFin`. El núcleo (`tiempoRestante`) es PURO y
 * testeable (sin React ni timers); el hook (`useCountdown`) lo envuelve con un tick por segundo.
 */

export interface TiempoRestante {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
  /** `true` cuando la fecha ya pasó (o falta ≤ 0): el countdown se apaga. */
  terminado: boolean;
}

const MS_SEGUNDO = 1000;
const MS_MINUTO = 60 * MS_SEGUNDO;
const MS_HORA = 60 * MS_MINUTO;
const MS_DIA = 24 * MS_HORA;

/**
 * Descompone el tiempo entre `ahora` y `fechaFin` en días/horas/minutos/segundos. Fecha pasada (o
 * `fechaFin` inválida) ⇒ todo 0 + `terminado: true`. Puro y determinista (ambos argumentos
 * inyectados): el test lo ejerce sin timers.
 */
export function tiempoRestante(fechaFin: Date, ahora: Date): TiempoRestante {
  const restanteMs = fechaFin.getTime() - ahora.getTime();
  if (!Number.isFinite(restanteMs) || restanteMs <= 0) {
    return { dias: 0, horas: 0, minutos: 0, segundos: 0, terminado: true };
  }
  return {
    dias: Math.floor(restanteMs / MS_DIA),
    horas: Math.floor((restanteMs % MS_DIA) / MS_HORA),
    minutos: Math.floor((restanteMs % MS_HORA) / MS_MINUTO),
    segundos: Math.floor((restanteMs % MS_MINUTO) / MS_SEGUNDO),
    terminado: false,
  };
}

/** Formato compacto del countdown para el chip del header (ej. "3d 04h", "12h 30m", "45m 10s"). */
export function formatoCompacto(t: TiempoRestante): string {
  if (t.terminado) return "Cerrado";
  const dos = (n: number) => n.toString().padStart(2, "0");
  if (t.dias > 0) return `${t.dias}d ${dos(t.horas)}h`;
  if (t.horas > 0) return `${t.horas}h ${dos(t.minutos)}m`;
  return `${t.minutos}m ${dos(t.segundos)}s`;
}

/** Un bloque del reloj completo: el número ya formateado + su etiqueta humana. */
export interface BloqueReloj {
  clave: "dias" | "horas" | "minutos" | "segundos";
  /** Valor YA formateado: días sin pad ni tope; horas/minutos/segundos a 2 dígitos. */
  valor: string;
  label: string;
}

/** Sufijo de una letra por bloque, en el orden de `bloquesReloj` (la línea de `clasico`). */
const SUFIJOS = ["d", "h", "m", "s"] as const;

/**
 * Descompone el tiempo restante en los 4 BLOQUES del reloj completo (builder-countdown-presencia F01/D3):
 * Días / Horas / Min / Seg. Los 4 están SIEMPRE, aunque den 0 — que el bloque de días desaparezca al llegar
 * a las últimas 24 h movería el resto del reloj de lugar (estabilidad de layout, CLS 0). Los días no se
 * topean a 2 dígitos (un sorteo puede cerrar a más de 99 días); h/m/s van con `padStart(2)`.
 *
 * Es la ÚNICA fuente de la descomposición: `panel`/`tarjeta` la pintan como bloques y `clasico` la pinta
 * como línea vía `formatoRelojLinea` ⇒ las tres variantes no pueden desincronizarse. Puro (recibe el
 * `TiempoRestante` ya calculado): se ejerce sin timers ni React.
 */
export function bloquesReloj(t: TiempoRestante): BloqueReloj[] {
  const dos = (n: number) => n.toString().padStart(2, "0");
  return [
    { clave: "dias", valor: t.dias.toString(), label: "Días" },
    { clave: "horas", valor: dos(t.horas), label: "Horas" },
    { clave: "minutos", valor: dos(t.minutos), label: "Min" },
    { clave: "segundos", valor: dos(t.segundos), label: "Seg" },
  ];
}

/**
 * El reloj completo en UNA línea (ej. "54d 03h 12m 07s") — el formato de la variante `clasico` desde la
 * enmienda D2 del usuario (antes mostraba el `formatoCompacto` de 2 unidades, sin segundos). Se DERIVA de
 * `bloquesReloj`, así que comparte pad y valores con `panel`/`tarjeta` por construcción.
 *
 * `terminado` ⇒ "Cerrado", igual que `formatoCompacto`: un reloj congelado en ceros afirmaría que faltan
 * 0 segundos en vez de que el sorteo cerró (hoy ningún llamador llega acá — las variantes se auto-ocultan
 * antes, I3 — pero el helper no puede quedar diciendo algo falso si mañana lo llama alguien más).
 */
export function formatoRelojLinea(t: TiempoRestante): string {
  if (t.terminado) return "Cerrado";
  return bloquesReloj(t)
    .map((b, i) => `${b.valor}${SUFIJOS[i]!}`)
    .join(" ");
}

/**
 * Hook: recalcula el tiempo restante a `fechaFin` cada segundo. Arranca desde `new Date()` en el
 * cliente; en SSR/primer render usa la misma base para no divergir (el valor exacto se corrige al
 * montar). `fechaFin` llega vía superjson como `Date`.
 */
export function useCountdown(fechaFin: Date): TiempoRestante {
  const [ahora, setAhora] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), MS_SEGUNDO);
    return () => clearInterval(id);
  }, []);

  return tiempoRestante(fechaFin, ahora);
}
