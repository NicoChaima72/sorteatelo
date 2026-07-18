import { ColorSchemeScript } from "@mantine/core";
import { Html, Head, Main, NextScript } from "next/document";

/**
 * Documento del pages router. `ColorSchemeScript` (Mantine) fija el color scheme antes del primer
 * paint y evita el flash (ADR-0011).
 *
 * ⚠️ `next/font` NO se referencia acá a propósito. En el pages router, el colector de estilos de
 * `next/font` recorre SOLO el árbol de `_app`/páginas — NUNCA `_document`. Si las fuentes se
 * instancian/aplican solo acá, Next aplica los classNames al `<html>` pero jamás inyecta el
 * `<style>` con `@font-face` ni las CSS vars → la app renderiza en la fuente serif del navegador.
 * Por eso las fuentes se instancian y cablean desde `_app.tsx` (que sí pasa por el colector).
 * Acá quedan solo el color scheme y el favicon.
 */
export default function Document() {
  return (
    <Html lang="es">
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
