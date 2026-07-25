import { z } from "zod";

import { DestinoLinkSchema, type DestinoLink } from "~/lib/pagebuilder/widgets";

/**
 * Chrome GLOBAL de la Tienda (Tanda 3 F06/D10, evolución C). Vive FUERA del Documento de Página (columna
 * `Tenant.chromeJson`) porque es transversal a TODAS las páginas: el header/footer se ven igual en la home
 * y en `/sobre-mi`. `ChromeSchema` es Zod propio `.strict()`, cero hex/URL libre (I-U1). Puro,
 * client+server safe (lo consumen el render del layout y el panel Chrome del editor).
 *
 * NODOS PINNED (I-U2): el carrito + la acción de sesión (header) y la atribución neutral + el enlace a las
 * Bases del sorteo (footer, ADR-0008) NO existen en este schema — los renderiza la PLATAFORMA alrededor de
 * lo configurable. No hay input que los quite ⇒ no-borrables POR CONSTRUCCIÓN (más fuerte que un flag
 * "protegido"). El chrome solo gobierna lo que ES editable.
 *
 * `MenuItem` reusa el `DestinoLink` de los runs (F01/D1) ⇒ UN SOLO vocabulario de destinos en toda la
 * plataforma (ancla|pagina|url https validada). `chromeJson null` ⇒ el layout usa sus defaults actuales
 * (byte-idéntico, I-U8): este schema solo aporta OVERRIDES.
 */

export const CHROME_SCHEMA_VERSION = 1;

/** Fondo del header (enum táctico REVISABLE). `vidrio` (DEFAULT) = el blur translúcido ACTUAL
 *  (byte-idéntico null ⇒ no-op, I-U8); `superficie` = sólido del body; `transparente` para overlay sobre
 *  un hero de imagen. Los sólidos de marca/tinta quedan fuera del MVP (piden pairing de contraste). Cero hex. */
export const FONDO_HEADER = ["vidrio", "superficie", "transparente"] as const;
export type FondoHeader = (typeof FONDO_HEADER)[number];

/** Posición del logo/marca en el header. `izquierda` (DEFAULT) = layout actual. */
export const LAYOUT_HEADER = ["izquierda", "centro"] as const;
export type LayoutHeader = (typeof LAYOUT_HEADER)[number];

/** Comportamiento del header al hacer scroll. `fijo` (DEFAULT) = sticky actual; `estatico` = se va. */
export const STICKY_HEADER = ["fijo", "estatico"] as const;
export type StickyHeader = (typeof STICKY_HEADER)[number];

/** Cantidad de columnas del footer (hint de layout). `auto` (DEFAULT) = el layout actual. */
export const COLUMNAS_FOOTER = ["auto", "una", "dos"] as const;
export type ColumnasFooter = (typeof COLUMNAS_FOOTER)[number];

/**
 * Ítem de menú (header o footer): etiqueta ≤20 + destino tipado (`DestinoLink`: ancla|pagina|url https).
 * `.strict()` ⇒ nunca `<a href>` libre del tenant (I-U1/ADR-0018).
 */
export const MenuItemSchema = z
  .object({
    etiqueta: z.string().min(1).max(20),
    destino: DestinoLinkSchema,
  })
  .strict();
export type MenuItem = z.infer<typeof MenuItemSchema>;

/** Config del HEADER (todo con default no-op ⇒ un chrome `{}` reproduce el header actual, I-U8). */
export const ChromeHeaderSchema = z
  .object({
    layout: z.enum(LAYOUT_HEADER).default("izquierda"),
    sticky: z.enum(STICKY_HEADER).default("fijo"),
    transparenteSobreHero: z.boolean().default(false),
    fondo: z.enum(FONDO_HEADER).default("vidrio"),
    menu: z.array(MenuItemSchema).max(8).default([]),
  })
  .strict();
export type ChromeHeader = z.infer<typeof ChromeHeaderSchema>;

/** Config del FOOTER (todo default no-op). `texto` = una línea editorial opcional sobre la atribución. */
export const ChromeFooterSchema = z
  .object({
    columnas: z.enum(COLUMNAS_FOOTER).default("auto"),
    links: z.array(MenuItemSchema).max(12).default([]),
    texto: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ChromeFooter = z.infer<typeof ChromeFooterSchema>;

/**
 * Chrome completo. `.strict()` en cada nivel. `header`/`footer` con `.default({})` ⇒ un `chromeJson: {}`
 * (o `{ schemaVersion: 1 }`) parsea y rellena TODOS los defaults (header/footer actuales, no-op I-U8).
 */
export const ChromeSchema = z
  .object({
    schemaVersion: z.literal(CHROME_SCHEMA_VERSION).default(CHROME_SCHEMA_VERSION),
    header: ChromeHeaderSchema.default({}),
    footer: ChromeFooterSchema.default({}),
  })
  .strict();
export type Chrome = z.infer<typeof ChromeSchema>;

/**
 * Lectura TOLERANTE del chrome para el RENDER (espejo de `leerDocumentoParaRender`, I9): `chromeJson` null
 * ⇒ `null` (el layout usa sus defaults actuales, byte-idéntico). Un chrome PODRIDO ⇒ el chrome DEFAULT
 * (`ChromeSchema.parse({})`, todos los defaults) — NUNCA un 500 (I-G). Nunca lanza.
 */
export function leerChromeParaRender(raw: unknown): Chrome | null {
  if (raw === null || raw === undefined) return null;
  const res = ChromeSchema.safeParse(raw);
  if (res.success) return res.data;
  return ChromeSchema.parse({}); // podrido ⇒ default tolerante (header/footer actuales)
}

/** El chrome DEFAULT (todos los valores actuales). Útil para sembrar el panel Chrome del editor (F07). */
export function chromeDefault(): Chrome {
  return ChromeSchema.parse({});
}

/** Resuelve un `MenuItem` a un href (mismo criterio que los links de runs). PURO. */
export function hrefMenuItem(destino: DestinoLink): string {
  switch (destino.tipo) {
    case "ancla":
      return `#${destino.ancla}`;
    case "pagina":
      return `/${destino.slug}`;
    case "url":
      return destino.url;
  }
}
