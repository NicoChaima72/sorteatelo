import { ColorSchemeScript } from "@mantine/core";
import { GeistSans } from "geist/font/sans";
import { Html, Head, Main, NextScript } from "next/document";

/**
 * Documento del pages router. `ColorSchemeScript` (Mantine) va acá para fijar el color
 * scheme antes del primer paint y evitar el flash (ADR-0011). Geist se aplica al `<html>`
 * (`.className` = font-family directo + `.variable` = define `--font-geist-sans` para las
 * utilities `font-sans` de Tailwind), así todo hereda la tipografía sin depender de un
 * wrapper por página.
 */
export default function Document() {
  return (
    <Html lang="es" className={`${GeistSans.className} ${GeistSans.variable}`}>
      <Head>
        <ColorSchemeScript defaultColorScheme="light" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
