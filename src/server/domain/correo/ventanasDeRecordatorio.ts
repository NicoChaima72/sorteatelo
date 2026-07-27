/**
 * **Cuándo vence un recordatorio del sorteo** (F06/C2-C3, T1). Puro y sin `db`: aritmética de
 * fechas y nada más, para que la regla más delicada del feature se pueda leer y testear sola.
 *
 * ── El job pregunta «¿qué está vencido y sin enviar?», no «¿qué toca ahora?» ────────────────────
 * Vercel Cron es best-effort: puede saltarse una corrida (ADR-0027 §4). Si la ventana del
 * recordatorio T-48h fuera exactamente la hora en que el sorteo cruza las 48 h, una corrida perdida
 * **perdería el correo para siempre** — el sorteo ya estaría a 47 h en la corrida siguiente y no
 * calificaría nunca más. Por eso cada offset no define un instante sino un TRAMO abierto hacia
 * abajo: sigue vencido mientras nadie lo haya mandado.
 *
 * ── Los tramos son contiguos y no se pisan ─────────────────────────────────────────────────────
 * El piso de un offset es el TECHO del siguiente, así que ningún sorteo cae en dos tramos a la vez:
 *
 * ```
 *   cierre del sorteo (tiempo que falta)
 *   ────────────────────────────────────────────────────────────────────►
 *   49 h                          7 h                        0 h
 *     │◄──────── T-48h ────────────►│◄──────── T-6h ──────────►│  ya cerró
 * ```
 *
 * En la corrida NOMINAL —la del cron de la hora en que el sorteo entra al tramo— el T-48h sale con
 * 48-49 h por delante y el T-6h con 6-7 h, que es exactamente la ventana `[48,49)` / `[6,7)` que
 * fija el plan. Si esa corrida se pierde, el recordatorio sale en la siguiente: **tarde, pero
 * sale**, y jamás dos veces (la clave del ledger es `raffleId:offset:email`).
 *
 * Ese diseño impone algo al COPY y no al revés: el correo **no puede decir «faltan 48 horas»**
 * (sería falso en una corrida de recuperación). Dice la fecha y hora de cierre, que es verdad
 * siempre — y de paso es más útil.
 *
 * ── Nada de librería de fechas ─────────────────────────────────────────────────────────────────
 * Aritmética con milisegundos sobre instantes UTC (backend-conventions § Aritmética de fechas). La
 * hora de Chile aparece SOLO al formatear el correo (`_fechaDeCorreo.ts`, I7): acá no hay husos ni
 * DST que valgan porque «faltan 6 horas» es la misma cantidad de tiempo en cualquier zona.
 */

/**
 * Los recordatorios que existen, del más lejano al más cercano al cierre (D3): **T-48h
 * informativo** y **T-6h con CTA de compra**. El ORDEN importa: cada tramo usa al siguiente como
 * piso, así que la lista tiene que venir descendente.
 */
export const OFFSETS_RECORDATORIO = [48, 6] as const;

export type OffsetRecordatorio = (typeof OFFSETS_RECORDATORIO)[number];

/**
 * Techo de recordatorios por sorteo por comprador que fija el plan. **No se chequea contando filas
 * en la DB: se cumple por construcción** — hay `OFFSETS_RECORDATORIO.length` correos posibles y la
 * clave del ledger lleva el offset, así que el `@@unique([tipo, clave])` garantiza uno por
 * (persona, sorteo, offset). Un contador sería una segunda fuente de verdad que puede discrepar.
 *
 * Lo que sí hace falta es que nadie agregue un cuarto offset sin darse cuenta: de eso se encarga el
 * guard de abajo, que corre al importar el módulo.
 */
export const MAX_RECORDATORIOS_POR_SORTEO = 3;

if (OFFSETS_RECORDATORIO.length > MAX_RECORDATORIOS_POR_SORTEO) {
  throw new Error(
    `Hay ${OFFSETS_RECORDATORIO.length} recordatorios configurados y el techo por sorteo es ${MAX_RECORDATORIOS_POR_SORTEO}.`,
  );
}

/**
 * Ancho de la ventana nominal, en horas = el período del cron (`0 * * * *`, ADR-0027 §4). Es lo que
 * hace que el tramo T-48h empiece en 49 h y no en 48: con el cron horario, un sorteo puede entrar
 * al tramo en cualquier punto de esa hora.
 */
const VENTANA_HORAS = 1;

const HORA_MS = 60 * 60 * 1000;

export interface VentanaRecordatorio {
  offsetHoras: OffsetRecordatorio;
  /** El sorteo califica si `fechaFin > desde`. Es el techo del offset siguiente (tramos contiguos). */
  desde: Date;
  /** …y `fechaFin <= hasta`. */
  hasta: Date;
}

/**
 * Los tramos vencidos en este instante, uno por offset. El caller pregunta por sorteos ACTIVO con
 * `fechaFin` dentro de cada tramo.
 *
 * El piso del último offset es `ahora`: un sorteo cuyo cierre ya pasó **no recibe nada** (mandar un
 * «cierra pronto» de algo ya cerrado es peor que no mandar nada), y eso además es lo que impide que
 * un sorteo ACTIVO olvidado por el Organizador siga generando correos para siempre.
 */
export function ventanasDeRecordatorio(ahora: Date): VentanaRecordatorio[] {
  const base = ahora.getTime();
  return OFFSETS_RECORDATORIO.map((offsetHoras, i) => {
    // El piso es el TECHO del offset siguiente ⇒ tramos contiguos que no se solapan. Sin esto, un
    // sorteo a 6,5 h de cerrar caería en los DOS tramos y recibiría dos correos en la misma corrida.
    const siguiente = OFFSETS_RECORDATORIO[i + 1] ?? 0;
    return {
      offsetHoras,
      desde: new Date(base + (siguiente === 0 ? 0 : siguiente + VENTANA_HORAS) * HORA_MS),
      hasta: new Date(base + (offsetHoras + VENTANA_HORAS) * HORA_MS),
    };
  });
}
