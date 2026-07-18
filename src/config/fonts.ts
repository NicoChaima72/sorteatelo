import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Instrument_Sans,
} from "next/font/google";

/**
 * Tipografía de plataforma (F01, identidad «El Talonario»). Cargada con `next/font/google`
 * (self-hosteada por Next, cero request a Google en runtime). Se define UNA vez acá y se aplica
 * en `_document.tsx` sobre el `<html>` (className base + CSS vars). El resto de la app la consume
 * por variable CSS: el theme de Mantine usa `var(--font-instrument)` (texto), `var(--font-display)`
 * (headings) y `var(--font-mono)` (montos), y el Wordmark usa `var(--font-display)` — así ningún
 * otro módulo importa el loader de fuentes (y `theme.ts` queda Vitest-safe, I9).
 */

/** Instrument Sans: la familia del sistema (texto de UI). Variable (todos los pesos). */
export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument",
});

/** Bricolage Grotesque: display / headings / wordmark (peso 800). Variable (200–800). */
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

/** IBM Plex Mono: números, montos y etiquetas (mono, `tabular-nums`). */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-mono",
});
