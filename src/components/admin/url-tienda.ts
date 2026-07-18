/**
 * Construye la URL pública del storefront de una Tienda desde el host del panel (dev y prod):
 * `<slug>.<host>`. Client-only (usa `window.location`) ⇒ `null` en SSR. Extraído de
 * `checklist-publicacion.tsx` para reusarlo en el chrome del admin ("Ver mi tienda", D6).
 */
export function urlDeTienda(slug: string): string | null {
  if (typeof window === "undefined") return null;
  const { protocol, host } = window.location;
  return `${protocol}//${slug}.${host}`;
}

/** Abre el storefront de la Tienda en una pestaña nueva (no-op en SSR). */
export function abrirTienda(slug: string): void {
  const url = urlDeTienda(slug);
  if (url) window.open(url, "_blank", "noopener");
}
