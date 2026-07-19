// Orden de estilos = patrón datawalt-app (ADR-0011 / frontend-conventions): globals.css
// (Tailwind) PRIMERO, luego los estilos de Mantine, para que estos ganen al preflight de
// Tailwind. No reordenar.
import "~/styles/globals.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";

import { MantineProvider, mergeThemeOverrides } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { type AppType } from "next/app";
import Head from "next/head";

import { bricolage, instrumentSans, PARES_FONT, plexMono } from "~/config/fonts";
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
const FONT_VARS_CSS = `:root{--font-instrument:${instrumentSans.style.fontFamily};--font-display:${bricolage.style.fontFamily};--font-mono:${plexMono.style.fontFamily};}`;

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
  const par = temaPagina ? PARES_FONT[temaPagina.tipografia] : null;
  const fontOverrideCss =
    par && temaPagina && temaPagina.tipografia !== "plataforma"
      ? `:root{--font-display:${par.display};--font-instrument:${par.texto};}`
      : "";

  return (
    <>
      <Head>
        {/* CSS vars de tipografía en :root (SSR-safe, valores deterministas de next/font). */}
        <style dangerouslySetInnerHTML={{ __html: FONT_VARS_CSS }} />
        {fontOverrideCss && (
          <style dangerouslySetInnerHTML={{ __html: fontOverrideCss }} />
        )}
      </Head>
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
