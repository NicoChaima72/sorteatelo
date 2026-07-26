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
  /**
   * Descriptor corto para title / meta description / OG de plataforma. Voz cercana chilena.
   * Sorteo-first (plan landing-reposicionamiento D11): la promesa es MONTAR el sorteo tú mismo y
   * rápido — el diferenciador contra las agencias que cotizan sitios de sorteo a medida.
   */
  tagline: "Monta tu sorteo online tú mismo, en un día.",
  /** Dominio raíz de la plataforma (los tenants viven en sus subdominios). */
  dominio: "sorteatelo.cl",
  /**
   * Canal de soporte de la plataforma — ÚNICA fuente para todo copy que diga "escríbele al
   * soporte". HOY es el correo personal del dueño de la plataforma (decisión 2026-07-25);
   * unificar a un correo serio + WhatsApp es tarea abierta (`.scratch/soporte-canales/`).
   */
  soporteEmail: "nikochaima72@gmail.com",
} as const;

export type AppConfig = typeof APP_CONFIG;
