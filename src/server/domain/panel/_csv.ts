/**
 * Codificación CSV (RFC 4180) — módulo PURO, sin nada del dominio (F07,
 * `tasks/26-07-25-checkout-campos-configurables.md`, D9).
 *
 * La separación es el punto: quien lo usa decide QUÉ celdas tiene cada fila (columnas fijas del
 * panel, una por clave respondida); este módulo decide cómo se escriben para que Excel abra el
 * archivo entero y sin sorpresas. Es el único lugar del repo que sabe de comillas dobladas, CRLF y
 * BOM.
 */

/**
 * Separador de filas. **CRLF y no `\n`**: es lo que manda RFC 4180 y lo que espera Excel en
 * Windows, que es donde este archivo se va a abrir.
 */
const FIN_DE_FILA = "\r\n";

/**
 * Byte Order Mark UTF-8. Sin él, Excel abre el CSV con la codificación del sistema y «Teléfono»
 * sale «TelÃ©fono» — el archivo estaría bien y se vería roto. Va UNA vez, al principio del todo
 * (D9 lo pide por nombre).
 */
const BOM = "﻿";

/**
 * Caracteres que obligan a entrecomillar una celda: el separador de campos, el de filas y la
 * comilla misma.
 */
const NECESITA_COMILLAS = /[",\r\n]/;

/**
 * Caracteres con los que Excel (y Sheets, y LibreOffice) empieza a leer una FÓRMULA en vez de un
 * dato. El `\t` y el `\r` entran porque la planilla los descarta y deja ver el carácter siguiente.
 */
const ARRANQUE_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Neutraliza una celda que la planilla leería como fórmula, anteponiéndole el apóstrofo de TEXTO
 * (la marca que Excel/Sheets usan para «esto es texto, no lo evalúes»; en la celda no se ve).
 *
 * Resuelve dos problemas de una:
 *
 * 1. **Fidelidad del dato.** Un TELEFONO se congela con el `+` adelante (F05, sin presunción de
 *    país). Sin esto, Excel lee `+56912345678` como una suma y muestra `56912345678`: el `+` se
 *    pierde y el Organizador copia un teléfono equivocado.
 * 2. **CSV injection.** El texto libre lo escribe un Comprador desconocido y el archivo lo abre el
 *    Organizador en SU computador; un `=HYPERLINK(...)` o un `=cmd|...` no puede ejecutarse ahí.
 *
 * NO toca los números: los montos son no-negativos y el tipo NUMERO tiene piso 0 (F05), así que
 * arrancan con dígito y siguen siendo sumables — que es justo el punto del export (D9).
 */
function neutralizarFormula(valor: string): string {
  return ARRANQUE_DE_FORMULA.test(valor) ? `'${valor}` : valor;
}

/**
 * Una celda escapada. Se entrecomilla SOLO si hace falta —una celda limpia viaja pelada, porque
 * hay herramientas que no desescapan y mostrarían `"M"` con comillas— y adentro la comilla doble
 * se escribe DOBLE, que es como RFC 4180 la escapa.
 *
 * El entrecomillado NO protege de una fórmula (la planilla desescapa primero y evalúa después),
 * así que la neutralización va ANTES y es independiente.
 */
export function celdaCsv(valor: string): string {
  const seguro = neutralizarFormula(valor);
  if (!NECESITA_COMILLAS.test(seguro)) return seguro;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Filas → texto CSV listo para descargar, con BOM. La primera fila es el encabezado; el largo lo
 * decide quien llama.
 *
 * Sin salto final: una línea vacía al cierre la leen como una fila más los parsers ingenuos (RFC
 * 4180 la permite pero no la exige).
 */
export function armarCsv(filas: string[][]): string {
  return (
    BOM + filas.map((fila) => fila.map(celdaCsv).join(",")).join(FIN_DE_FILA)
  );
}
