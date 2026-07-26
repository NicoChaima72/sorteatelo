/**
 * Primitivas compartidas por las plantillas de correo (`plantillaDescarga.ts` al Comprador,
 * `plantillasFacturacion.ts` al Pagador). Son las dos defensas que TODA plantilla necesita, y viven
 * en un solo lugar porque son seguridad: duplicarlas garantiza que un día una copia se corrija y la
 * otra no.
 *
 * - `sanearCabecera` — anti **header injection**: un `\r\n` en el `from`/`subject` puede inyectar
 *   cabeceras nuevas (un `Bcc:`, por ejemplo). El nombre de la Tienda lo controla el Organizador, así
 *   que no se confía aunque no sea un input anónimo.
 * - `escaparHtml` — anti **HTML injection** en el cuerpo: los datos del tenant se interpolan en el
 *   `html`, y un `<script>` en el nombre de una Tienda no tiene por qué llegar entero al buzón de
 *   nadie.
 *
 * Sin `env`, sin DB, sin red: son funciones de texto.
 */

/** Último code point de la franja de control baja (0x00–0x1F). */
const ULTIMO_CONTROL_BAJO = 0x1f;
/** DEL (0x7F), el control alto que también hay que sacar. */
const DEL = 0x7f;

/**
 * Quita los caracteres de control (0x00–0x1F y 0x7F) filtrando por code point, sin incrustar bytes de
 * control en una expresión regular — un `[\x00-\x1f]` escrito literal es invisible en el editor y en
 * un diff, y es justo el carácter que hay que poder LEER cuando se audita una defensa.
 */
function sinControl(texto: string): string {
  return Array.from(texto)
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code > ULTIMO_CONTROL_BAJO && code !== DEL;
    })
    .join("");
}

/**
 * Sanea un texto para interpolarlo en una CABECERA de correo (`from`, `subject`): quita caracteres de
 * control y saltos de línea, colapsa espacios y cae al `fallback` si no queda nada legible.
 */
export function sanearCabecera(texto: string, fallback: string): string {
  const limpio = sinControl(texto).replace(/\s+/g, " ").trim();
  return limpio.length > 0 ? limpio : fallback;
}

/** Escapa los 5 caracteres peligrosos de HTML (los datos del tenant se interpolan en el cuerpo). */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
