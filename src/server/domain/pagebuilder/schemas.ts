import { z } from "zod";

/**
 * Inputs Zod de los use cases del page builder (F04, ADR-0016). El shape FINO de las props de cada
 * widget NO se valida acá (depende del `tipo`): la mutación se aplica y el documento COMPLETO se
 * revalida contra `PageDocumentSchema` server-side (el borde de seguridad, I3) — props inválidas ⇒
 * el documento no parsea ⇒ `INVALID`, sin escribir. Por eso `props` acá es un record laxo.
 */

/** Props laxas de entrada (el shape real lo impone la revalidación del documento completo). */
const propsLaxas = z.record(z.string(), z.unknown());

/**
 * Mutación direccionada del borrador (D10). Union discriminada por `accion`; el MCP (F06) mapea una
 * tool por acción. El lock optimista (`expectedVersion`, I10) NO viaja dentro de esta union: es un
 * parámetro HERMANO en `aplicarMutacionPagina({ mutacion, expectedVersion })` — cada tool del MCP lo
 * recibe aparte y lo pasa al use case, no lo embebe en el input de la mutación.
 */
export const mutacionPaginaSchema = z.discriminatedUnion("accion", [
  // Agregar una sección de `tipo` (validado contra el registro en el transform) con sus defaultProps
  // + overrides; `posicion` la inserta (clamp), ausente ⇒ al final.
  z.object({
    accion: z.literal("add_section"),
    tipo: z.string().min(1),
    posicion: z.number().int().min(0).optional(),
    props: propsLaxas.optional(),
  }),
  // Mover una sección (por `id`) a otra posición del array (clamp).
  z.object({
    accion: z.literal("move_section"),
    id: z.string().min(1),
    aPosicion: z.number().int().min(0),
  }),
  // Quitar una sección por `id`.
  z.object({
    accion: z.literal("remove_section"),
    id: z.string().min(1),
  }),
  // Actualizar (merge shallow) las props de una sección por `id`.
  z.object({
    accion: z.literal("update_section_props"),
    id: z.string().min(1),
    props: propsLaxas,
  }),
  // Setear el tema (root.props). LEGACY (F04): equivale a `set_page_theme` — ambos escriben
  // root.props y el documento completo revalida contra `TemaSchema`. Se conserva por compat.
  z.object({
    accion: z.literal("set_theme"),
    props: propsLaxas,
  }),
  // Escribir el ESTILO de una sección por `id` (catálogo-v2 F01/D2). El `estilo` va al ENVELOPE del
  // nodo (hermano de `props`), no dentro de `props`. Shape laxo acá; la revalidación del documento
  // completo contra `EstiloSeccionSchema` es el borde (I3): estilo inválido ⇒ INVALID sin mutar.
  z.object({
    accion: z.literal("set_section_style"),
    id: z.string().min(1),
    estilo: propsLaxas,
  }),
  // Escribir el TemaPagina (root.props) por intención (catálogo-v2 F01/D3). Nombre espejo de la
  // tool MCP `set_page_theme` (F07). El documento completo revalida contra `TemaSchema` (I3).
  z.object({
    accion: z.literal("set_page_theme"),
    tema: propsLaxas,
  }),
  // Reemplazo TOTAL del borrador desde un documento crudo (primer volcado desde foto). Se parsea
  // entero contra PageDocumentSchema.
  z.object({
    accion: z.literal("apply_page"),
    documento: z.unknown(),
  }),
]);
export type MutacionPagina = z.infer<typeof mutacionPaginaSchema>;

/** Cuál de los dos documentos leer: el Borrador (editar) o el Publicado (render). */
export const cualDocumento = z.enum(["draft", "published"]);
export type CualDocumento = z.infer<typeof cualDocumento>;

// ── Inputs del editor visual (catálogo-v2 F09/D10) ────────────────────────────────────────────
// Los procedures del editor (router `pagebuilder`) delegan 1:1 en los MISMOS use cases que el MCP; el
// `tenantId` sale del gate de membresía (I1), jamás del input. El `expectedVersion` (lock optimista,
// I10) viaja hermano de la mutación.

/** Aplicar una mutación al Borrador con el lock optimista. */
export const editarBorradorInput = z.object({
  mutacion: mutacionPaginaSchema,
  expectedVersion: z.number().int(),
});
export type EditarBorradorInput = z.infer<typeof editarBorradorInput>;

/** Publicar el Borrador (acción humana explícita, I6); `expectedVersion` opcional. */
export const publicarBorradorInput = z.object({
  expectedVersion: z.number().int().optional(),
});
export type PublicarBorradorInput = z.infer<typeof publicarBorradorInput>;

/** Revertir el Borrador a una revisión publicada vieja (rollback, D4). */
export const revertirBorradorInput = z.object({
  revision: z.number().int().positive(),
});
export type RevertirBorradorInput = z.infer<typeof revertirBorradorInput>;
