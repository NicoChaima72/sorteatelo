import { createTheme } from "@mantine/core";
import { GeistSans } from "geist/font/sans";

/**
 * Theme base de la PLATAFORMA (ADR-0011). Casi-default a propósito: la identidad de marca
 * está PENDIENTE (`docs/design.md`) — acá NO va paleta nueva ni dirección visual propia.
 * Cuando se cierre la marca, la paleta se vuelca en `theme.colors` + `primaryColor` (nada
 * más). El storefront per-tenant (F06) arma su theme por request con
 * `mergeThemeOverrides(theme, overrideDesdeTenant)` sobre esta base.
 */
export const theme = createTheme({
  // Tipografía cableada al scaffold (Geist vía next/font). La familia definitiva se decide
  // con la marca; hoy es Geist para que Mantine y el `<html>` compartan la misma fuente.
  fontFamily: GeistSans.style.fontFamily,
  fontFamilyMonospace: GeistSans.style.fontFamily,
  headings: { fontFamily: GeistSans.style.fontFamily },
  // Radio por defecto ~0.5rem (design.md §4). Elevación por borde, no por sombra.
  defaultRadius: "md",
  // design.md §7: respetar prefers-reduced-motion globalmente.
  respectReducedMotion: true,
});
