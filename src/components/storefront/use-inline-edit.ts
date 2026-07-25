import { useEffect } from "react";

/**
 * Edición INLINE de texto sobre el canvas (Tanda 3 F12/D19). Contrato `data-campo` en los componentes de
 * storefront (SOLO campos planos de 1er nivel — jamás runs ni objetos anidados, que se editan en el panel).
 * El runtime se activa SOLO en modo preview tokenizado DENTRO del iframe del editor (I-T5, espejo del patch
 * en vivo): click ⇒ contentEditable plaintext-only; blur/Enter ⇒ `postMessage({tipo, nodoId, campo, valor})`
 * al editor (parent same-origin), que RE-VALIDA (origin + shape + campo permitido) y dispara
 * `update_section_props` (el server revalida el documento entero, I3). El SSR público NO monta el hook ni la
 * clase de activación ⇒ los `data-campo` quedan INERTES (sin cursor, sin edición).
 */

/** Tipo del mensaje inline (namespaced, distinto del patch). */
export const TIPO_INLINE = "pagebuilder:inline";

/**
 * Campos PLANOS de 1er nivel editables inline (D19). Enum cerrado ⇒ un `campo` fuera de esta lista se
 * IGNORA en el editor (defensa; el server igual revalida). Deliberadamente NO incluye campos `rico`/runs
 * (hero.titulo/subtitulo, perfil.bio, texto_rico.bloques) ni objetos anidados (destacado, ctaSecundario).
 */
export const CAMPOS_INLINE_PERMITIDOS = new Set<string>([
  "titulo",
  "subtitulo",
  "caption",
  "nota",
  "mensaje",
  "eyebrow",
  "autoria",
  "metodo",
]);

/** Mensaje inline validado (lo consume el editor para emitir `update_section_props`). */
export interface MensajeInline {
  nodoId: string;
  campo: string;
  valor: string;
}

/**
 * Valida un mensaje inline entrante al EDITOR (Tanda 3 F12/D19): `origin` esperado + `tipo` correcto +
 * shape (nodoId/campo/valor strings) + `campo` PERMITIDO (plano). El `valor` se APLANA a texto plano
 * (se le quitan tags HTML — defensa aunque el contentEditable sea plaintext-only, I-U1). Devuelve el
 * mensaje limpio o `null` (⇒ el editor lo ignora). PURO ⇒ testeable en node sin DOM.
 */
export function validarMensajeInline(
  mensaje: { origin: string; data: unknown },
  origenEsperado: string,
): MensajeInline | null {
  if (mensaje.origin !== origenEsperado) return null; // otro origin ⇒ descarta (I-T5)
  const data = mensaje.data as { tipo?: unknown; nodoId?: unknown; campo?: unknown; valor?: unknown } | null;
  if (!data || typeof data !== "object" || data.tipo !== TIPO_INLINE) return null;
  if (typeof data.nodoId !== "string" || typeof data.campo !== "string" || typeof data.valor !== "string") {
    return null;
  }
  if (!CAMPOS_INLINE_PERMITIDOS.has(data.campo)) return null; // campo no-plano ⇒ ignorado (D19)
  // Aplana a texto plano: quita cualquier tag HTML (el contentEditable es plaintext-only, esto es defensa).
  const valor = data.valor.replace(/<[^>]*>/g, "").trim();
  return { nodoId: data.nodoId, campo: data.campo, valor };
}

/**
 * Runtime del inline editing (montado en el storefront SOLO en preview). Activa contentEditable al click
 * sobre un `[data-campo]`, y al blur/Enter emite el `postMessage` al editor. Escape revierte. Solo corre
 * dentro del iframe del editor (`window.parent !== window`) ⇒ el público jamás edita. No-op fuera de preview.
 */
export function useInlineEdit(esPreview: boolean): void {
  useEffect(() => {
    if (!esPreview || typeof window === "undefined") return;
    if (window.parent === window) return; // no está en el iframe del editor ⇒ no activar
    const origen = window.location.origin;
    let editando: HTMLElement | null = null;

    document.body.classList.add("pb-inline-activo");

    const emitir = (el: HTMLElement) => {
      const campo = el.getAttribute("data-campo");
      const nodoId = el.closest("[data-nodo]")?.getAttribute("data-nodo") ?? null;
      if (!campo || !nodoId) return;
      const valor = (el.textContent ?? "").trim();
      window.parent.postMessage({ tipo: TIPO_INLINE, nodoId, campo, valor }, origen);
    };

    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-campo]") as HTMLElement | null;
      if (!target || editando === target) return;
      e.preventDefault();
      editando = target;
      target.setAttribute("contenteditable", "plaintext-only");
      target.dataset.inlineOriginal = target.textContent ?? "";
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    };

    const finalizar = (el: HTMLElement) => {
      el.removeAttribute("contenteditable");
      const original = (el.dataset.inlineOriginal ?? "").trim();
      delete el.dataset.inlineOriginal;
      const valor = (el.textContent ?? "").trim();
      if (valor.length > 0 && valor !== original) emitir(el);
      editando = null;
    };

    const onBlur = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el === editando) finalizar(el);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!editando) return;
      if (e.key === "Enter") {
        e.preventDefault();
        editando.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        editando.textContent = editando.dataset.inlineOriginal ?? editando.textContent;
        editando.blur();
      }
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.classList.remove("pb-inline-activo");
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [esPreview]);
}
