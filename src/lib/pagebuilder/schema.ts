import { z } from "zod";

import {
  ANCHO_CONTENIDO,
  avisoBarraProps,
  bannerCtaProps,
  beneficiosGridProps,
  bloqueTicketPromoProps,
  botonesSocialesProps,
  catalogoProps,
  comoFuncionaProps,
  compartirSorteoProps,
  contadorTicketsProps,
  embedSocialProps,
  espaciadorProps,
  ESQUEMAS_FONDO,
  estadisticasProps,
  EstiloSeccionSchema,
  faqProps,
  galeriaProps,
  ganadoresProps,
  garantiasSorteoProps,
  heroProps,
  imagenDestacadaProps,
  logosConfianzaProps,
  metaProgresoSorteoProps,
  MODO_COLOR,
  PARES_TIPOGRAFICOS,
  RADIO_GLOBAL,
  separadorProps,
  sorteoVitrinaProps,
  testimoniosProps,
  textoRicoProps,
  urgenciaCountdownProps,
  VIBE,
  videoProps,
  whatsappFlotanteProps,
} from "~/lib/pagebuilder/widgets";

/**
 * Schema del Documento de Página (ADR-0016, F02). Es el **borde de validación** por el que pasa
 * TODA escritura del documento (MCP, use cases, backfill) server-side (I3): tipos/props desconocidos,
 * campos extra o límites excedidos ⇒ rechazo. Puro (solo Zod), client+server safe.
 *
 * Estructura de DOS niveles, sin recursión (ADR-0016):
 *   PageDocument = { schemaVersion, root:{props: tema}, secciones:[Nodo], overlays:[Nodo] }
 *   Nodo = { id (estable), tipo, v, props }   — el `id` direcciona las mutaciones del MCP (F04/F06).
 *
 * Las secciones se ordenan por POSICIÓN en el array (no hay campo `orden`). La union es discriminada
 * por `tipo` ⇒ el render tiene el `props` narrowed por rama (switch exhaustivo, F05). Los tipos de
 * widget peligrosos (`html`/`embedCode`/`iframeSrc`) simplemente NO existen en la union (ADR-0018).
 */

/** Versión del CONTINENTE (el documento). Distinta de la `v` por nodo (migrate-on-read, F05). */
export const SCHEMA_VERSION = 1;

/** Tope de secciones por página (cordura anti-abuso; el LLM del MCP no infla el jsonb). */
const MAX_SECCIONES = 50;
/** Tope de overlays por página. */
const MAX_OVERLAYS = 10;

/**
 * Construye el schema de un nodo tipado: `{ id, tipo: literal, v, props }`, estricto (rechaza campos
 * extra, ADR-0018). El `id` es un string estable (dirección del nodo); `v` acepta cualquier entero
 * positivo (un nodo con `v` viejo se migra ANTES de parsear, F05).
 */
function nodo<T extends string, P extends z.ZodTypeAny>(tipo: T, props: P) {
  return z
    .object({
      id: z.string().min(1).max(64),
      tipo: z.literal(tipo),
      v: z.number().int().positive(),
      props,
    })
    .strict();
}

/**
 * Como `nodo()`, pero el envelope admite un `estilo` OPCIONAL (catálogo-v2 F01/D2): el
 * `EstiloSeccionSchema` (fondo/spacing/ancho/divisor/entrada) vive JUNTO a `id/tipo/v/props`, no
 * dentro de `props` (que está discriminado por tipo). `estilo` ausente ⇒ el render usa los defaults
 * actuales (migración no-op, I-H). Los OVERLAYS siguen con `nodo()` pelado (no llevan estilo de
 * sección). `.strict()` en el envelope ⇒ un campo extra hermano de `estilo` no parsea (I-A).
 */
function nodoSeccion<T extends string, P extends z.ZodTypeAny>(tipo: T, props: P) {
  return z
    .object({
      id: z.string().min(1).max(64),
      tipo: z.literal(tipo),
      v: z.number().int().positive(),
      props,
      estilo: EstiloSeccionSchema.optional(),
    })
    .strict();
}

/**
 * Union discriminada de SECCIONES (widgets del flujo vertical). Enumerada explícitamente con
 * literales para que `z.infer` narrowe `props` por `tipo` (tipos precisos en el render). Debe
 * cubrir EXACTAMENTE los `TIPOS_SECCION` del registro — la exhaustividad se testea (F02).
 */
export const SeccionNodeSchema = z.discriminatedUnion("tipo", [
  nodoSeccion("hero", heroProps),
  nodoSeccion("catalogo", catalogoProps),
  nodoSeccion("sorteo_vitrina", sorteoVitrinaProps),
  nodoSeccion("como_funciona", comoFuncionaProps),
  nodoSeccion("contador_tickets", contadorTicketsProps), // F10
  nodoSeccion("urgencia_countdown", urgenciaCountdownProps), // F10
  nodoSeccion("testimonios", testimoniosProps), // F11
  nodoSeccion("ganadores", ganadoresProps), // F11
  nodoSeccion("faq", faqProps), // F11
  nodoSeccion("video", videoProps), // F11
  nodoSeccion("embed_social", embedSocialProps), // F11
  nodoSeccion("beneficios_grid", beneficiosGridProps), // catálogo-v2 F04
  nodoSeccion("texto_rico", textoRicoProps), // catálogo-v2 F04
  nodoSeccion("imagen_destacada", imagenDestacadaProps), // catálogo-v2 F04
  nodoSeccion("separador", separadorProps), // catálogo-v2 F04
  nodoSeccion("espaciador", espaciadorProps), // catálogo-v2 F04
  nodoSeccion("banner_cta", bannerCtaProps), // catálogo-v2 F04
  nodoSeccion("estadisticas", estadisticasProps), // catálogo-v2 F05
  nodoSeccion("botones_sociales", botonesSocialesProps), // catálogo-v2 F05
  nodoSeccion("logos_confianza", logosConfianzaProps), // catálogo-v2 F05
  nodoSeccion("bloque_ticket_promo", bloqueTicketPromoProps), // catálogo-v2 F06
  nodoSeccion("meta_progreso_sorteo", metaProgresoSorteoProps), // catálogo-v2 F06
  nodoSeccion("garantias_sorteo", garantiasSorteoProps), // catálogo-v2 F06
  nodoSeccion("compartir_sorteo", compartirSorteoProps), // catálogo-v2 F06
  nodoSeccion("galeria", galeriaProps), // catálogo-v2 F08
]);
export type SeccionNode = z.infer<typeof SeccionNodeSchema>;

/**
 * Union de OVERLAYS (widgets fuera del flujo vertical: barra de aviso arriba, botón flotante FAB).
 * F10 la pobló con `aviso_barra` + `whatsapp_flotante`. El array `overlays[]` solo admite estos tipos;
 * un tipo de sección metido como overlay ⇒ rechazo.
 */
export const OverlayNodeSchema = z.discriminatedUnion("tipo", [
  nodo("aviso_barra", avisoBarraProps),
  nodo("whatsapp_flotante", whatsappFlotanteProps),
]);
export type OverlayNode = z.infer<typeof OverlayNodeSchema>;

/**
 * Tema del documento (`root.props`, catálogo-v2 F01/D3, síntesis §3.2). ADITIVO-OPCIONAL: todos los
 * campos con `.default()` ⇒ un `root.props:{}` viejo parsea y Zod rellena los defaults (migración
 * no-op, sin bump de `schemaVersion`, I-H). `colorPrimario` NO se duplica acá — sigue como columna
 * de `Tenant` (fuente única, I2 del plan padre): el tema solo aporta lo que hoy no existe (modo
 * claro/oscuro, radio, vibe, par tipográfico, ancho por defecto, fondo de página).
 */
export const TemaSchema = z
  .object({
    modo: z.enum(MODO_COLOR).default("claro"), // aplica vía colorScheme Mantine
    radio: z.enum(RADIO_GLOBAL).default("m"), // override defaultRadius storefront
    vibe: z.enum(VIBE).default("suave"),
    tipografia: z.enum(PARES_TIPOGRAFICOS).default("plataforma"),
    anchoContenido: z.enum(ANCHO_CONTENIDO).default("contenido"), // default heredado por secciones
    fondoPagina: z.enum(ESQUEMAS_FONDO).default("superficie"), // pinta el <body>/shell
  })
  .strict();
export type Tema = z.infer<typeof TemaSchema>;

/** El Documento de Página completo. `.strict()` en cada nivel (sin campos extra, ADR-0018). */
export const PageDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    root: z.object({ props: TemaSchema }).strict(),
    secciones: z.array(SeccionNodeSchema).max(MAX_SECCIONES),
    overlays: z.array(OverlayNodeSchema).max(MAX_OVERLAYS).default([]),
  })
  .strict();
export type PageDocument = z.infer<typeof PageDocumentSchema>;
