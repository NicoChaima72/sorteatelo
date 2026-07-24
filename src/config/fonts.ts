import {
  Anton,
  Bebas_Neue,
  Bricolage_Grotesque,
  Fraunces,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Instrument_Sans,
  Nunito_Sans,
  Playfair_Display,
  Poppins,
  Roboto,
  Source_Sans_3,
  Space_Grotesk,
} from "next/font/google";

import { type ParTipografico } from "~/lib/pagebuilder/widgets";

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

// ── Pares tipográficos curados del TemaPagina (catálogo-v2 F02/D3, síntesis §3.3) ─────────────
// Modelo Shopify: heading+body curados, NUNCA fuente libre. El enum de NOMBRES vive en
// `~/lib/pagebuilder/widgets` (puro); acá se INSTANCIAN las familias `next/font` (build-time) y se
// mapean a `enum → { display, texto }`. `preload: false` en los NO-default (solo se descargan si un
// tenant elige ese par): cero costo para el 99% que usa "plataforma". El render (`_app`) swapea las
// CSS vars `--font-display`/`--font-instrument` al par elegido — el theme ya las consume por var.

const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  preload: false,
});
const nunitoSans = Nunito_Sans({ subsets: ["latin"], display: "swap", preload: false });
const anton = Anton({ subsets: ["latin"], weight: ["400"], display: "swap", preload: false });
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", preload: false });
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: ["400"], display: "swap", preload: false });

/** `family` CSS de un par (display para headings/wordmark, texto para el cuerpo). */
export interface ParFont {
  display: string;
  texto: string;
}

/**
 * Mapa `ParTipografico → { display, texto }` (family CSS de `next/font`). "plataforma" = el par por
 * defecto ya cargado (Bricolage + Instrument). El resto se instancia arriba con `preload:false`.
 */
export const PARES_FONT: Record<ParTipografico, ParFont> = {
  plataforma: { display: bricolage.style.fontFamily, texto: instrumentSans.style.fontFamily },
  editorial: { display: fraunces.style.fontFamily, texto: inter.style.fontFamily },
  energia: { display: spaceGrotesk.style.fontFamily, texto: inter.style.fontFamily },
  dulce: { display: poppins.style.fontFamily, texto: nunitoSans.style.fontFamily },
  impacto: { display: anton.style.fontFamily, texto: roboto.style.fontFamily },
  clasica: { display: playfair.style.fontFamily, texto: sourceSans.style.fontFamily },
  tecnica: { display: plexSans.style.fontFamily, texto: sourceSans.style.fontFamily },
  cartel: { display: bebasNeue.style.fontFamily, texto: spaceGrotesk.style.fontFamily },
};
