/**
 * Decisión PURA de qué documento sirve el storefront (F05, ADR-0016/I5). El público lee SOLO el
 * Publicado; el Borrador se sirve únicamente con un TOKEN válido (para revisarlo desde el editor antes
 * de publicar, R2). Sin token configurado o token incorrecto ⇒ 404 NEUTRAL (no se delata que hay un
 * borrador ni por qué falló). Separado del acceso a env para testear sin manosear `process.env`.
 */
export type ModoPagina = "publicado" | "borrador" | "no-encontrado";

export function resolverModoPreview({
  preview,
  token,
}: {
  /** Valor del query param `?preview=` (Next lo entrega string | string[] | undefined). */
  preview: string | string[] | undefined;
  /** Token de preview configurado en env; `undefined`/vacío ⇒ preview deshabilitada. */
  token: string | undefined;
}): ModoPagina {
  // Sin param `preview` ⇒ camino público normal: Publicado.
  if (preview === undefined) return "publicado";

  const valor = Array.isArray(preview) ? preview[0] : preview;

  // Se pidió preview pero no hay token configurado, o no coincide ⇒ 404 neutral (I5).
  if (!token || valor !== token) return "no-encontrado";

  return "borrador";
}
