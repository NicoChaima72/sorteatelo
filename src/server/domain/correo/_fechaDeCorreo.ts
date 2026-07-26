/**
 * Fechas para el Comprador dentro de un correo — **siempre en hora de Chile y con la zona dicha en
 * voz alta** (invariante I7 del plan de correos, ADR-0027 §4).
 *
 * Por qué existe en vez de reusar `~/lib/formato`: ese módulo formatea en el HUSO DEL NAVEGADOR, y
 * ahí eso está bien (el cliente ya está parado en Chile). Un correo se arma en el SERVIDOR, que en
 * producción corre en UTC — sin fijar la zona, «el sorteo cierra el 1 de marzo a las 23:59» le
 * llegaría al Comprador corrido tres o cuatro horas, según la época del año. Chile tiene DST, así
 * que la conversión NO se puede hacer restando un offset fijo: la hace `Intl` con la base de datos
 * de zonas horarias.
 *
 * Es el segundo lugar del repo que fija un huso; el primero fue el export CSV del panel
 * (`exportarVentasCsv.ts`, con su propio formato ISO-primero porque lo abre Excel). Acá el destino
 * es una persona leyendo una frase, así que el formato es largo y en palabras.
 */

/** Zona horaria del producto: Sortéatelo es una plataforma chilena de punta a punta. */
const ZONA_HORARIA = "America/Santiago";

/**
 * Cómo se nombra la zona en el texto. Va como palabras y no como sigla (`CLT`/`-04`): el Comprador
 * no tiene por qué saber siglas de husos, y la sigla además cambia con el horario de verano.
 */
const ETIQUETA_ZONA = "hora de Chile";

const FMT_FECHA_HORA = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA_HORARIA,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // h23 para que no aparezca «11:59 p. m.», que en un cierre de sorteo se presta a confusión.
  hourCycle: "h23",
});

/**
 * `1 de marzo de 2026 a las 23:59 (hora de Chile)`. Se usa para el cierre del sorteo —donde la hora
 * DECIDE algo— y para la fecha de la compra del resumen.
 */
export function fechaHoraEnChile(d: Date): string {
  return `${FMT_FECHA_HORA.format(d)} (${ETIQUETA_ZONA})`;
}
