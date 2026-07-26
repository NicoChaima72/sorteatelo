// Orden de estilos = patrón datawalt-app (ADR-0011 / frontend-conventions): globals.css
// (Tailwind) PRIMERO, luego los estilos de Mantine, para que estos ganen al preflight de
// Tailwind. No reordenar.
import "~/styles/globals.css";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";

import {
  ColorSchemeScript,
  MantineProvider,
  mergeThemeOverrides,
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { type AppType } from "next/app";
import Head from "next/head";

import { bricolage, fraunces, instrumentSans, PARES_FONT, plexMono } from "~/config/fonts";
import { type Tema } from "~/lib/pagebuilder/schema";
import { theme } from "~/styles/theme";
import {
  overrideDesdeBranding,
  overrideDesdeTema,
  type TenantBranding,
} from "~/styles/tenantTheme";
import { api } from "~/utils/api";

/**
 * Cableado de la tipografía de plataforma (identidad «El Talonario»). Las fuentes se INSTANCIAN
 * acá (importadas de `~/config/fonts`) para que el colector de `next/font` del pages router inyecte
 * su `@font-face` en cada página — cosa que NO ocurre si solo se referencian en `_document.tsx`
 * (bug de tipografía serif que esto corrige). Las CSS vars `--font-*` se definen en `:root` (no en
 * un wrapper) para que las herede TODO el árbol, incluidos los portales de Mantine (Modal, Menu,
 * Spotlight, Notifications) que se montan en `<body>`, fuera del árbol de React. El theme de Mantine
 * las consume vía `var(--font-instrument|display|mono)` (`theme.ts`).
 */
const FONT_VARS_CSS = `:root{--font-instrument:${instrumentSans.style.fontFamily};--font-display:${bricolage.style.fontFamily};--font-heading:${fraunces.style.fontFamily};--font-mono:${plexMono.style.fontFamily};}`;

/**
 * Theming per-tenant (F06/D2, ADR-0011). Las páginas del storefront pueblan
 * `pageProps.tenantBranding` desde su `getServerSideProps`; acá se mergea el override derivado
 * de esa marca sobre el theme base de plataforma. El panel/apex NO setean `tenantBranding` ⇒
 * theme de plataforma intacto. `overrideDesdeBranding` es puro y determinista ⇒ SSR y cliente
 * calculan el MISMO theme (sin hydration mismatch).
 */
const MyApp: AppType<{
  session: Session | null;
  tenantBranding?: TenantBranding | null;
  temaPagina?: Tema | null;
}> = ({ Component, pageProps: { session, ...pageProps } }) => {
  const tenantBranding =
    (pageProps as { tenantBranding?: TenantBranding | null }).tenantBranding ??
    null;
  // TemaPagina del documento (solo la home storefront lo puebla, catálogo-v2 F02): radio + tipografía
  // + modo claro/oscuro de la TIENDA. El apex/panel no lo setean ⇒ theme de plataforma intacto.
  const temaPagina =
    (pageProps as { temaPagina?: Tema | null }).temaPagina ?? null;

  let themeFinal = theme;
  if (tenantBranding)
    themeFinal = mergeThemeOverrides(themeFinal, overrideDesdeBranding(tenantBranding));
  if (temaPagina)
    themeFinal = mergeThemeOverrides(themeFinal, overrideDesdeTema(temaPagina));

  // Swap de las CSS vars de tipografía al par elegido (el theme las consume por var). El par
  // "plataforma" NO overridea (usa el default ya en `FONT_VARS_CSS`). El mono se mantiene siempre.
  // F13/fidelidad: el theme de headings consume `--font-heading` (Fraunces, WIP de marca del usuario),
  // NO `--font-display` (que hoy solo alimenta el Wordmark). Antes el swap escribía SOLO `--font-display`
  // ⇒ los headings del storefront ignoraban la tipografía del tenant (p.ej. `cartel`/Bebas Neue) y salían
  // en Fraunces. Ahora escribe AMBAS (`--font-heading` = lo que el theme consume hoy + `--font-display`
  // por compat con el Wordmark), y `--font-instrument` para el cuerpo.
  const par = temaPagina ? PARES_FONT[temaPagina.tipografia] : null;
  const fontOverrideCss =
    par && temaPagina && temaPagina.tipografia !== "plataforma"
      ? `:root{--font-heading:${par.display};--font-display:${par.display};--font-instrument:${par.texto};}`
      : "";
  // Escala de títulos de sección `poster` (fidelidad landing_idol): SOLO para tenants poster se inyecta la
  // regla que agranda `.st-titulo-poster` (los títulos de sección marcados) al tamaño Bebas del mockup
  // (~52px). Para el resto la clase existe pero sin regla ⇒ no-op (I-H). `!important` gana al `fz` inline.
  const escalaTitulosCss =
    temaPagina?.escalaTitulos === "poster"
      ? `.st-titulo-poster{font-size:clamp(2rem,4.6vw,3.25rem)!important;line-height:1.04!important;}`
      : "";

  return (
    <>
      <Head>
        {/* CSS vars de tipografía en :root (SSR-safe, valores deterministas de next/font). */}
        <style dangerouslySetInnerHTML={{ __html: FONT_VARS_CSS }} />
        {fontOverrideCss && (
          <style dangerouslySetInnerHTML={{ __html: fontOverrideCss }} />
        )}
        {escalaTitulosCss && (
          <style dangerouslySetInnerHTML={{ __html: escalaTitulosCss }} />
        )}
      </Head>
      {/*
       * Modo oscuro de la TIENDA (catálogo-v2 F02, BUG modo:oscuro): el `ColorSchemeScript` del
       * `_document` fija `light` por defecto (admin/apex/tiendas claras). Acá, SOLO cuando el
       * TemaPagina de la tienda pide `oscuro`, un 2º script FUERZA `data-mantine-color-scheme=dark`.
       * Va al INICIO del <body> (no en <Head>): así corre DESPUÉS del script de `_document`
       * (que `next/head` emite antes del Head estático), ganándole sin race. Es SSR-safe (viaja en
       * el HTML, no depende del efecto cliente de `MantineProvider`) y NO toca `_document`
       * (compartido). El apex/admin nunca setean `temaPagina` ⇒ jamás emiten este script ⇒ claro.
       */}
      {temaPagina?.modo === "oscuro" && (
        <ColorSchemeScript forceColorScheme="dark" />
      )}
      <SessionProvider session={session}>
        <MantineProvider
          theme={themeFinal}
          defaultColorScheme="light"
          forceColorScheme={temaPagina?.modo === "oscuro" ? "dark" : undefined}
        >
          <ModalsProvider>
            <Notifications />
            <Component {...pageProps} />
          </ModalsProvider>
        </MantineProvider>
      </SessionProvider>
    </>
  );
};

export default api.withTRPC(MyApp);
