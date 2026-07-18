/**
 * Identidad de la PLATAFORMA Sortéatelo (ADR-0014, design.md §1). ÚNICA fuente del nombre,
 * tagline y dominio: la UI los consume SIEMPRE de acá — nunca literal "Sortéatelo" en JSX ni
 * en `<title>` (frontend-conventions § Idioma, invariante I4 del plan admin-marca).
 *
 * Client-safe A PROPÓSITO: sin imports de `~/server` (arrastraría env vars server-only al
 * bundle). Es config estática pura — no lee `process.env`, no toca la DB.
 */
export const APP_CONFIG = {
  /** Nombre de marca de la plataforma. Derivado del dominio `sorteatelo.cl`. */
  name: "Sortéatelo",
  /** Descriptor corto para meta description / hero de plataforma. Voz cercana chilena. */
  tagline: "Vende lo que hiciste y sortéalo entre quienes te compraron.",
  /** Dominio raíz de la plataforma (los tenants viven en sus subdominios). */
  dominio: "sorteatelo.cl",
} as const;

export type AppConfig = typeof APP_CONFIG;
