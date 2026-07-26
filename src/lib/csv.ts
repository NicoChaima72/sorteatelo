/**
 * Codificación CSV (RFC 4180) — módulo PURO: recibe `string[][]` y devuelve texto. No importa
 * Prisma, ni sesión, ni nada del dominio, y por eso vive en `~/lib` y no bajo `domain/panel/`
 * (nació ahí como `_csv.ts` en F07 de `tasks/26-07-25-checkout-campos-configurables.md`, D9).
 *
 * La separación es el punto: quien lo usa decide QUÉ celdas tiene cada fila; este módulo decide
 * cómo se escriben para que Excel abra el archivo entero y sin sorpresas. Es el único lugar del
 * repo que sabe de separador de campos, comillas dobladas, CRLF y BOM — y las razones de cada una
 * de esas cuatro decisiones están MEDIDAS en Excel 16 real sobre un Windows es-CL, no supuestas
 * (ver los comentarios de abajo y `panel.ventas.csv.002` en `tasks/e2e-panel-organizadores.md`).
 * Si mañana otra superficie exporta una planilla, entra por acá y hereda esas mediciones.
 */

/**
 * Separador de filas. **CRLF y no `\n`**: es lo que manda RFC 4180 y lo que espera Excel en
 * Windows, que es donde este archivo se va a abrir.
 */
const FIN_DE_FILA = "\r\n";

/**
 * Separador de campos. **`;` y no la coma de RFC 4180**, porque Excel no autodetecta: al abrir un
 * `.csv` con doble clic usa el **separador de lista del sistema**, y en un Windows **es-CL** —el
 * locale del mercado de Sortéatelo— ese separador es `;`. Con coma, el doble clic mete la planilla
 * entera en la columna A y el Organizador tiene que saber de «Datos → Desde texto» para leer sus
 * ventas (medido en Excel 16 real: `panel.ventas.csv.002`, decisión del usuario 2026-07-25).
 *
 * El precio es la contracara: en un Excel en inglés (separador `,`) este archivo abre en una sola
 * columna. Se elige el locale de los Organizadores, no el de la RFC.
 */
const SEPARADOR_DE_CAMPOS = ";";

/**
 * Byte Order Mark UTF-8. Sin él, Excel abre el CSV con la codificación del sistema y «Teléfono»
 * sale «TelÃ©fono» — el archivo estaría bien y se vería roto. Va UNA vez, al principio del todo
 * (D9 lo pide por nombre).
 */
const BOM = "﻿";

/**
 * Caracteres que obligan a entrecomillar una celda: el separador de campos, el de filas y la
 * comilla misma. **La coma NO está**: con `;` de separador, una coma es texto común y
 * entrecomillar por ella sería ruido (`"María, Ñuñoa"` se ve con comillas en las herramientas que
 * no desescapan). Verificado en Excel 16 es-CL: una celda con coma y sin comillas queda entera.
 */
const NECESITA_COMILLAS = new RegExp(`["${SEPARADOR_DE_CAMPOS}\r\n]`);

/**
 * Caracteres con los que Excel (y Sheets, y LibreOffice) empieza a leer una FÓRMULA en vez de un
 * dato. El `\t` y el `\r` entran porque la planilla los descarta y deja ver el carácter siguiente.
 */
const ARRANQUE_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Neutraliza una celda que la planilla leería como fórmula, anteponiéndole el apóstrofo de TEXTO
 * (la marca que Excel/Sheets usan para «esto es texto, no lo evalúes»).
 *
 * **El apóstrofo SE VE en la celda.** Excel solo lo esconde cuando lo tipea una persona; llegando
 * por CSV es un carácter más del valor (`'+56912345678`, con `PrefixCharacter` vacío) — igual al
 * importar que al abrir con doble clic. Medido en Excel 16 es-CL por las dos vías
 * (`panel.ventas.csv.002`, 2026-07-26). Es un costo asumido, no un efecto invisible: entrecomillar
 * NO sustituye a la guarda (`"=1+1"` igual se evalúa a 2, y `"+56912345678"` igual se vuelve
 * `5,6912E+10`), así que el prefijo es lo único que protege sin reescribir el dato.
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
    BOM +
    filas
      .map((fila) => fila.map(celdaCsv).join(SEPARADOR_DE_CAMPOS))
      .join(FIN_DE_FILA)
  );
}
