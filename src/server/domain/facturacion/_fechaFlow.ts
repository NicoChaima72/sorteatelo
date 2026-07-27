/**
 * Núcleo PURO: las fechas que manda Flow son **hora de Chile** (F04/F09, ADR-0026).
 *
 * ── El hallazgo, verificado contra el sandbox (3ª pasada del E2E, punto 8) ───────────────────────
 * `subscription/get` devuelve `next_invoice_date`, `period_start` y `period_end` como
 * `"2026-08-26 00:00:00"`: un reloj de pared **sin zona**, que es la medianoche de Santiago (donde
 * vive Flow). `new Date("2026-08-26 00:00:00")` interpreta ese string en la zona **del proceso** —
 * en una máquina chilena da lo correcto por casualidad, y en Vercel (UTC) da un instante **4 horas
 * antes** en invierno, 3 en verano.
 *
 * Y como el panel formatea esas fechas en el navegador del Organizador (que está en Chile), un
 * `proximoCobroAt` guardado desde Vercel se mostraba **un día antes** del cobro real. En una pantalla
 * que dice «Próximo cobro: …», eso es decirle a alguien una fecha equivocada sobre su plata.
 *
 * Chile tiene horario de verano, así que la conversión NO se puede hacer restando un offset fijo: la
 * resuelve `Intl` con la base de datos de zonas horarias, igual que `domain/correo/_fechaDeCorreo.ts`
 * (el precedente del repo para fijar un huso).
 */

/** Zona horaria de Flow y del producto: Sortéatelo es una plataforma chilena de punta a punta. */
const ZONA_FLOW = "America/Santiago";

/** `YYYY-MM-DD` con hora opcional y SIN zona: el formato en que Flow manda todas sus fechas. */
const RELOJ_DE_PARED =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const PARTES_EN_CHILE = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_FLOW,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Fecha de Flow → `Date`. `null` si viene ausente o impresentable (Flow omite varias según el
 * evento, y una fecha inventada en un flujo de dinero es peor que ninguna).
 *
 * Un string con zona explícita (ISO con `Z` u offset) se respeta tal cual: si algún día Flow empieza
 * a mandarlas bien, esto no lo estropea.
 */
export function fechaDeFlow(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const texto = valor.trim();
  if (texto.length === 0) return null;

  const m = RELOJ_DE_PARED.exec(texto);
  if (m) {
    return instanteEnChile({
      anio: Number(m[1]),
      mes: Number(m[2]),
      dia: Number(m[3]),
      hora: Number(m[4] ?? 0),
      minuto: Number(m[5] ?? 0),
      segundo: Number(m[6] ?? 0),
    });
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El instante UTC que corresponde a un reloj de pared chileno.
 *
 * Se resuelve en dos pasadas porque el offset depende del instante y el instante depende del offset:
 * la primera estima con el offset del mismo reloj leído como UTC, y la segunda corrige usando el
 * offset real del instante estimado.
 *
 * ── El día que la hora no existe ────────────────────────────────────────────────────────────────
 * Chile adelanta el reloj a las **24:00 del sábado**, así que las **00:00 del primer domingo de
 * septiembre nunca ocurren** — y `00:00:00` es exactamente el formato en que Flow manda
 * `next_invoice_date`. Para un reloj inexistente la corrección "acierta" en la hora anterior al
 * salto y devuelve las 23:00 del día ANTERIOR: el error de un día que este módulo existe para matar,
 * reaparecido en el borde.
 *
 * Por eso la corrección se **verifica** (round-trip): si el instante corregido no reproduce el reloj
 * pedido, ese reloj no existe y se usa la estimación, que cae del lado de DESPUÉS del salto — el
 * mismo día que dijo Flow, que es lo que la pantalla tiene que mostrar.
 */
function instanteEnChile(r: {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}): Date {
  const comoSiFueraUtc = Date.UTC(
    r.anio,
    r.mes - 1,
    r.dia,
    r.hora,
    r.minuto,
    r.segundo,
  );
  const estimado = comoSiFueraUtc - offsetDeChile(comoSiFueraUtc);
  const corregido = comoSiFueraUtc - offsetDeChile(estimado);

  const reproduce =
    offsetDeChile(corregido) === comoSiFueraUtc - corregido;
  return new Date(reproduce ? corregido : estimado);
}

/** Cuánto adelanta (o atrasa) el reloj de Chile respecto de UTC en ese instante, en ms. */
function offsetDeChile(instante: number): number {
  const partes = PARTES_EN_CHILE.formatToParts(new Date(instante));
  const n = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);

  const relojChileno = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return relojChileno - instante;
}
