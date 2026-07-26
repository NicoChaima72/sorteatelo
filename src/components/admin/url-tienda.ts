import { hrefSubdominio } from "~/lib/urlApex";

/**
 * URLs de una Tienda desde el PANEL (admin-multi-tienda F05, ADR-0022).
 *
 * Con el panel scopeado por subdominio, el host actual YA es `<slugActual>.<apex>`: colgar el slug
 * del host actual —lo que hacía este módulo— generaba `<slug>.<slugActual>.<apex>`, una URL rota.
 * Ahora se deriva el APEX (env autoritativa, o quitándole el label de `slugActual` al host) y el
 * subdominio se cuelga de ahí. `slugActual` = la tienda del panel donde estoy (`tiendaActiva`).
 *
 * Client-only (usan `window.location`) ⇒ `null`/no-op en SSR.
 */
export function urlDeTienda(slug: string, slugActual: string): string | null {
  if (typeof window === "undefined") return null;
  return hrefSubdominio({ slug, slugActual, path: "" });
}

/** Abre el storefront de la Tienda en una pestaña nueva (no-op en SSR). */
export function abrirTienda(slug: string, slugActual: string): void {
  const url = urlDeTienda(slug, slugActual);
  if (url) window.open(url, "_blank", "noopener");
}

/**
 * Abre el EDITOR de la Tienda (`<slug>.<apex>/editor`) en una pestaña nueva (admin-bases-pdf F06/D7).
 * Sigue siendo navegación CROSS-HOST aunque el panel ya viva en un subdominio: el editor es otra
 * zona de la app ⇒ `window.open`, nunca `next/link`. No-op en SSR.
 */
export function abrirEditor(slug: string, slugActual: string): void {
  if (typeof window === "undefined") return;
  window.open(
    hrefSubdominio({ slug, slugActual, path: "/editor" }),
    "_blank",
    "noopener",
  );
}
