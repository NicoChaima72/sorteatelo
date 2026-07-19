/**
 * Allowlist de Content-Type de imagen (ADR-0013 / catálogo-v2 F08), en un módulo PURO client+server
 * safe: lo consumen el service de storage (server, para firmar), el input Zod de `PageAsset` (server) y
 * el picker del editor (CLIENTE, para el `accept` del file input + un chequeo local). Vivía en
 * `storagePublico.ts`, pero ese módulo arrastra el S3Client ⇒ no se puede importar desde el cliente;
 * por eso la fuente única de la allowlist se movió acá (mismo criterio que `widgets.ts` vs el loader
 * de fuentes). `storagePublico.ts` la re-exporta para no romper sus consumidores server.
 */
export const CONTENT_TYPES_IMAGEN = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type ContentTypeImagen = (typeof CONTENT_TYPES_IMAGEN)[number];

/** `true` sii `v` es un Content-Type de imagen de la allowlist (narrowing). */
export function esContentTypeImagen(v: string): v is ContentTypeImagen {
  return (CONTENT_TYPES_IMAGEN as readonly string[]).includes(v);
}
