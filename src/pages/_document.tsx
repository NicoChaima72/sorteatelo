import { ColorSchemeScript } from "@mantine/core";
import { Html, Head, Main, NextScript } from "next/document";

import { bricolage, instrumentSans, plexMono } from "~/config/fonts";

/**
 * Documento del pages router. `ColorSchemeScript` (Mantine) va acá para fijar el color scheme
 * antes del primer paint y evitar el flash (ADR-0011). La tipografía de plataforma (Instrument
 * Sans + Bricolage Grotesque + IBM Plex Mono, `next/font/google`) se aplica al `<html>`:
 * `instrumentSans.className` = font-family de texto por defecto, y el `.variable` de las tres
 * define `--font-instrument`/`--font-display`/`--font-mono` que consumen el theme de Mantine y el
 * Wordmark. Todo hereda la tipografía sin depender de un wrapper por página.
 */
export default function Document() {
  return (
    <Html
      lang="es"
      className={`${instrumentSans.className} ${instrumentSans.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <Head>
        <ColorSchemeScript defaultColorScheme="light" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
