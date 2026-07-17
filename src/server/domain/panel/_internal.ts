/**
 * Helpers internos del dominio del panel (no se consumen fuera de `domain/panel/`).
 */

/**
 * Normaliza un campo de texto OPCIONAL del panel: un valor ausente (`undefined`) o vacío
 * (`""` — lo que mandan inputs/textarea del form, ya trimeados por Zod) se persiste como
 * `null`, nunca como string vacío. Centraliza la semántica "vacío ⇒ null" que garantizan los
 * use cases (y que fijan los tests con `db` fake), sin el ternario identidad `x ? x : null`
 * que marca `@typescript-eslint/prefer-nullish-coalescing` (`??` no serviría: dejaría pasar
 * el `""`).
 */
export function textoOpcionalANull(valor: string | undefined): string | null {
  return valor && valor.length > 0 ? valor : null;
}
