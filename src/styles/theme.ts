import { createTheme, type MantineColor } from "@mantine/core";

/**
 * Theme base de la PLATAFORMA Sortéatelo (ADR-0011). Instancia la identidad **«El Talonario»**
 * (blanco + azul cobalto + amarillo lotería + tinta), elegida por el usuario tras 4 rondas de
 * prototipos en código (`.scratch/rediseno-ui/direccion-talonario.md`). SUPERSEDE la ruta violeta
 * «En Vivo» que instanciaba el carril admin-marca. La paleta vive SOLO acá (design.md §2/§9, I1):
 * cambiar un color = editar este archivo, jamás hex inline en componentes.
 *
 * El storefront per-tenant mergea SU override (solo el `colorPrimario` del tenant) sobre este base
 * con `mergeThemeOverrides` — hereda estos neutrales y la tipografía. El panel monta este base SIN
 * override (seam D13/I3). Con la base cobalto en el índice 6 + `primaryShade: 6`, el `filled`
 * per-tenant sale EXACTO en el hex del tenant (alineado con `tenantTheme.generarEscalaColor`, D4).
 *
 * NO importa `next/font` acá a propósito: las familias entran por CSS var (`--font-instrument`,
 * `--font-display`, `--font-mono`, las define `_document.tsx` vía `next/font/google`). Así este
 * módulo es importable desde Vitest y desde el cliente sin arrastrar el loader de fuentes (I9).
 */

/** Texto de sistema: Instrument Sans + fallbacks. */
const FUENTE_TEXTO =
  'var(--font-instrument), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Display / headings: Bricolage Grotesque (peso 800) sobre el fallback de texto. */
const FUENTE_DISPLAY =
  'var(--font-display), var(--font-instrument), ui-sans-serif, system-ui, sans-serif';
/** Números / montos / etiquetas: IBM Plex Mono (tabular). */
const FUENTE_MONO =
  'var(--font-mono), ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

export const theme = createTheme({
  fontFamily: FUENTE_TEXTO,
  fontFamilyMonospace: FUENTE_MONO,
  headings: { fontFamily: FUENTE_DISPLAY },

  // Cobalto de plataforma (#2b3fbf) — el azul-tinta del talonario, separa "plataforma" de
  // "tienda" (seam D13). Base en el índice 6 = `primaryShade` (D4, alineado con tenantTheme),
  // contraste ≈ 8:1 con blanco (AAA).
  primaryColor: "sorteatelo",
  primaryShade: 6,
  // Margen de accesibilidad: en tonos claros (p. ej. amarillo filled) Mantine invierte el texto
  // a tinta automáticamente (dirección §3, autoContrast del talonario).
  autoContrast: true,

  // Tinta (#191b22) — texto casi-negro azulado, el registro serio del talonario (no negro puro).
  black: "#191b22",
  white: "#ffffff",

  colors: {
    // ── Primario: cobalto «El Talonario» (base en índice 6, hover profundo #2333a0 en el 7) ──
    sorteatelo: [
      "#eaecf9", // 0
      "#d0d5f1", // 1
      "#aeb5e7", // 2
      "#8893db", // 3
      "#6675d1", // 4
      "#495ac8", // 5
      "#2b3fbf", // 6  ← base / primaryShade (cobalto, AAA con blanco)
      "#2333a0", // 7  ← hover profundo
      "#1c2a7e", // 8
      "#151e5c", // 9
    ],
    // ── Acento: amarillo lotería (base en índice 6, hover #f5b814 en el 7) ───────────────────
    // Con autoContrast los filled amarillos salen con texto tinta (el número «TÚ» del talonario).
    amarillo: [
      "#fff9ea", // 0
      "#fff2d1", // 1
      "#ffe9b0", // 2
      "#ffdf8b", // 3
      "#ffd56a", // 4
      "#ffcd4d", // 5
      "#ffc530", // 6  ← base amarillo de marca
      "#f5b814", // 7  ← hover
      "#a88220", // 8
      "#7a5f17", // 9
    ],
    // ── Semántica de comercio (D3, design.md §5): color funcional, no decorativo ─────────────
    // Pagado / éxito / dinero confirmado: teal (evita el "verde-banco", conserva verde≈aprobado).
    exito: [
      "#e8f2f1", // 0
      "#cde2e0", // 1
      "#a9ccc9", // 2
      "#80b5af", // 3
      "#5c9f98", // 4
      "#3d8d84", // 5
      "#1d7a70", // 6  ← teal del talonario (sello «pagado»)
      "#18665e", // 7
      "#13514a", // 8
      "#0e3b36", // 9
    ],
    // Premio / ganaste: el amarillo de marca — el momento de triunfo del talonario ES el amarillo
    // (el número «TÚ»). Re-anclado al amarillo (D3): mismo hex que la tupla `amarillo`.
    premio: [
      "#fff9ea", // 0
      "#fff2d1", // 1
      "#ffe9b0", // 2
      "#ffdf8b", // 3
      "#ffd56a", // 4
      "#ffcd4d", // 5
      "#ffc530", // 6  ← amarillo premio (= amarillo de marca)
      "#f5b814", // 7
      "#a88220", // 8
      "#7a5f17", // 9
    ],
    // Pendiente / en proceso: ámbar oscuro/apagado — espera ≠ celebración (distinto del amarillo).
    pendiente: [
      "#f6f0e6", // 0
      "#eadec9", // 1
      "#dbc7a1", // 2
      "#caac75", // 3
      "#bb944d", // 4
      "#ad802b", // 5
      "#a06b08", // 6  ← ámbar pendiente del talonario (sello «pendiente»)
      "#865a07", // 7
      "#6a4705", // 8
      "#4d3304", // 9
    ],
    // Fallido / destructivo (I4, `red` reservado): rojo-ladrillo del talonario (sello «fallido»),
    // más oscuro que cualquier acento cálido para no confundirse con un CTA. Override del `red`.
    red: [
      "#f9ecea", // 0
      "#f1d5d1", // 1
      "#e7b6b0", // 2
      "#dc938a", // 3
      "#d27469", // 4
      "#c9594b", // 5
      "#c03e2e", // 6  ← ladrillo del talonario (filled destructivo + texto de badge)
      "#a13427", // 7
      "#7f291e", // 8
      "#5c1e16", // 9
    ],
    // Neutrales FRÍOS: escala azul-grisácea del talonario (tinta-suave #565b68 en el índice 6 =
    // `dimmed`, tinta-tenue #9aa0ad como tono medio, gris banda #eef0f5 en los índices claros).
    gray: [
      "#f4f6f9", // 0
      "#eef0f5", // 1  ← gris banda (fondo de sección clara)
      "#dfe2ea", // 2
      "#c7ccd7", // 3
      "#9aa0ad", // 4  ← tinta-tenue (texto muy suave)
      "#757b88", // 5
      "#565b68", // 6  ← tinta-suave / dimmed (texto secundario)
      "#40444f", // 7
      "#2b2e37", // 8
      "#191b22", // 9  ← tinta
    ],
    // Celeste hundido (fondo del chrome del panel/login) — nunca blanco puro de fondo; cards en
    // blanco. Renombrado desde `crema` (D2): el token dejó de ser crema, ahora es celeste frío.
    hundido: [
      "#f7f9fd", // 0
      "#eef2fb", // 1  ← fondo del chrome (light-dark del panel/login)
      "#dde4f4", // 2
      "#c4d0ea", // 3
      "#a6b6dc", // 4
      "#8298cb", // 5
      "#5f78b8", // 6
      "#4a5f96", // 7
      "#3a4a75", // 8
      "#2b3757", // 9
    ],
  },

  // Radio por defecto ~0.5rem (design.md §4). El chrome del panel mantiene su patrón (bordes); la
  // gramática suave de las superficies de marca (radios 12/18, sombras difusas) vive en sus
  // componentes (F02), no en el default global.
  defaultRadius: "md",
  // design.md §7: respetar prefers-reduced-motion globalmente (I5).
  respectReducedMotion: true,
});

/**
 * Estado de una Orden/Pago (enum `OrderStatus` de Prisma), declarado local (string union) para
 * no arrastrar `@prisma/client` al bundle del cliente.
 */
export type EstadoOrden = "PENDIENTE" | "PAGADO" | "FALLIDO";

/** Estado del ciclo de vida de una Tienda (enum `TenantStatus` de Prisma). */
export type EstadoTienda = "ALTA" | "CONFIGURACION" | "PUBLICADA" | "SUSPENDIDA";

/**
 * Semántica de color de comercio (D3, design.md §5): fuente ÚNICA del token de color por estado.
 * Los badges (`EstadoBadge`/`EstadoTiendaBadge`) consumen estos mapas — cero hex inline. Cada
 * clave apunta a un token del theme (arriba). Exhaustivos contra los enums de Prisma (test).
 */
export const ESTADO_ORDEN_COLOR: Record<EstadoOrden, MantineColor> = {
  PAGADO: "exito",
  PENDIENTE: "pendiente",
  FALLIDO: "red",
};

export const ESTADO_TIENDA_COLOR: Record<EstadoTienda, MantineColor> = {
  ALTA: "gray",
  CONFIGURACION: "pendiente",
  PUBLICADA: "exito",
  SUSPENDIDA: "red",
};
