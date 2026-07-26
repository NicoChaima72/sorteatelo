import { type PrismaClient } from "@prisma/client";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import { WIDGET_META, type WidgetTipo } from "~/lib/pagebuilder/widgets";
import { DomainError } from "~/server/domain/errors";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import {
  listarOpcionesEstilo,
  listarTiposWidget,
  outlineDe,
} from "~/server/domain/pagebuilder/catalogoDelEditor";
import { getPagina } from "~/server/domain/pagebuilder/getPagina";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";

/**
 * Asistente de IA del editor (Tanda 3 F14/D21). Traduce lenguaje natural a las MISMAS mutaciones del
 * Documento de Página que el editor — NUNCA HTML/CSS libre, NUNCA publicar, NUNCA efectos fuera
 * del documento de la página abierta (I-U6). El `LanguageModel` se INYECTA desde el composition root
 * (`~/server/ai/gateway`): este módulo jamás lee la env ni ve la API key (patrón FlowCredential ADR-0006).
 *
 * Guardrails (D21/I-U6):
 *  - Solo muta el BORRADOR (aplicarMutacionPagina); publicar sigue siendo humano (I6) — no hay tool.
 *  - El toolset NO contiene chrome/páginas/colorAcento (viven fuera del documento, I12/D12).
 *  - Máx `MAX_PASOS_ASISTENTE` pasos por turno (loop acotado).
 *  - Cada tool-call de mutación pasa por el MISMO borde Zod + use case que el editor (I3): un error de
 *    validación VUELVE al modelo como resultado (no lanza) ⇒ el modelo se autocorrige.
 */

type DbAsistente = Pick<PrismaClient, "storefrontPage" | "product">;

/** Tope de pasos (llamadas a tool) por turno del asistente (loop acotado, guardrail D21). */
export const MAX_PASOS_ASISTENTE = 8;

/**
 * Nombres EXACTOS de las tools del asistente (whitelist). Deliberadamente NO incluye `publicar`,
 * `chrome`, `paginas`/`crear_pagina`, ni `color_acento` — esos efectos viven fuera del documento (I-U6/
 * D12). El test verifica esta lista contra los prohibidos.
 */
export const NOMBRES_TOOLS_ASISTENTE = [
  "ver_pagina",
  "listar_widgets",
  "listar_estilos",
  "agregar_seccion",
  "actualizar_props",
  "mover_seccion",
  "eliminar_seccion",
  "duplicar_seccion",
  "set_estilo",
  "set_tema",
  "set_nav",
] as const;

/** Un mensaje del historial del chat (entrada del procedure). */
export interface MensajeAsistente {
  rol: "user" | "assistant";
  texto: string;
}

/** Resultado del turno: texto del asistente + acciones aplicadas + el documento/version nuevos. */
export interface ResultadoAsistente {
  texto: string;
  acciones: string[];
  documento: PageDocument;
  version: number;
}

/** Estado mutable compartido por las tools durante el loop (versión + documento + bitácora de acciones). */
interface EstadoAsistente {
  version: number;
  documento: PageDocument;
  acciones: string[];
}

/** Props/estilo/tema laxos (el borde real es la revalidación del documento completo, I3). */
const recordLaxo = z.record(z.string(), z.unknown());

/** Etiqueta humana de una mutación aplicada (para la lista de "acciones" que ve el Organizador). */
function etiquetaAccion(mut: MutacionPagina): string {
  switch (mut.accion) {
    case "add_section":
      return `Agregó "${WIDGET_META[mut.tipo as WidgetTipo]?.titulo ?? mut.tipo}"`;
    case "update_section_props":
      return "Editó una sección";
    case "move_section":
      return "Reordenó una sección";
    case "remove_section":
      return "Quitó una sección";
    case "duplicate_section":
      return "Duplicó una sección";
    case "set_section_style":
      return "Cambió el estilo de una sección";
    case "set_page_theme":
    case "set_theme":
      return "Cambió el tema de la página";
    case "set_section_nav":
      return "Actualizó el menú de una sección";
    case "apply_page":
      return "Reemplazó la página";
  }
}

/**
 * Construye el toolset del asistente sobre un `estado` mutable. Las tools de mutación aplican por el use
 * case `aplicarMutacionPagina` (lock optimista + revalidación completa + referencias, I3/I10/I2) con la
 * `version` actual; un `DomainError` VUELVE como resultado (no lanza) ⇒ el modelo se autocorrige. PURO
 * respecto de la env (recibe `db`/`tenantId`/`slug`). Exportado para testear el borde sin llamar al modelo.
 */
export function construirHerramientas({
  db,
  tenantId,
  slug,
  estado,
}: {
  db: DbAsistente;
  tenantId: string;
  slug: string;
  estado: EstadoAsistente;
}) {
  /** Aplica una mutación por el use case; en éxito avanza el estado, en `DomainError` lo devuelve al modelo. */
  const aplicar = async (mut: MutacionPagina) => {
    try {
      const res = await aplicarMutacionPagina({
        db,
        tenantId,
        mutacion: mut,
        expectedVersion: estado.version,
        slug,
      });
      estado.version = res.version;
      estado.documento = res.documento;
      estado.acciones.push(etiquetaAccion(mut));
      return { ok: true as const, version: res.version, outline: outlineDe(res.documento) };
    } catch (e) {
      if (e instanceof DomainError) return { ok: false as const, error: e.message };
      throw e;
    }
  };

  return {
    // ── Lecturas (contexto para el modelo) ──
    ver_pagina: tool({
      description: "Muestra el estado actual de la página: outline de secciones y sus props/estilo.",
      inputSchema: z.object({}),
      execute: () => ({
        outline: outlineDe(estado.documento),
        secciones: estado.documento.secciones.map((s) => ({
          id: s.id,
          tipo: s.tipo,
          props: s.props,
          estilo: s.estilo,
        })),
        tema: estado.documento.root.props,
      }),
    }),
    listar_widgets: tool({
      description: "Lista los tipos de sección disponibles y sus props por defecto.",
      inputSchema: z.object({}),
      execute: () => listarTiposWidget(),
    }),
    listar_estilos: tool({
      description: "Lista todas las opciones de estilo (fondos/espaciado/etc.) y de tema, con descripción.",
      inputSchema: z.object({}),
      execute: () => listarOpcionesEstilo(),
    }),

    // ── Mutaciones del DOCUMENTO (whitelist; nunca publicar/chrome/páginas) ──
    agregar_seccion: tool({
      description: "Agrega una sección de `tipo` (ver listar_widgets) con props opcionales; posición opcional.",
      inputSchema: z.object({
        tipo: z.string().min(1),
        posicion: z.number().int().min(0).optional(),
        props: recordLaxo.optional(),
      }),
      execute: ({ tipo, posicion, props }) =>
        aplicar({ accion: "add_section", tipo, posicion, props }),
    }),
    actualizar_props: tool({
      description: "Actualiza (merge) las props de una sección por `id`.",
      inputSchema: z.object({ id: z.string().min(1), props: recordLaxo }),
      execute: ({ id, props }) => aplicar({ accion: "update_section_props", id, props }),
    }),
    mover_seccion: tool({
      description: "Mueve una sección (por `id`) a otra posición del listado.",
      inputSchema: z.object({ id: z.string().min(1), aPosicion: z.number().int().min(0) }),
      execute: ({ id, aPosicion }) => aplicar({ accion: "move_section", id, aPosicion }),
    }),
    eliminar_seccion: tool({
      description: "Quita una sección por `id`.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => aplicar({ accion: "remove_section", id }),
    }),
    duplicar_seccion: tool({
      description: "Duplica una sección por `id` (inserta la copia debajo).",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => aplicar({ accion: "duplicate_section", id }),
    }),
    set_estilo: tool({
      description: "Reemplaza el estilo (fondo/espaciado/ancho/divisor/entrada) de una sección por `id`.",
      inputSchema: z.object({ id: z.string().min(1), estilo: recordLaxo }),
      execute: ({ id, estilo }) => aplicar({ accion: "set_section_style", id, estilo }),
    }),
    set_tema: tool({
      description: "Cambia el tema de la página (modo/radio/vibe/tipografía/ancho/fondo/ambiente).",
      inputSchema: z.object({ tema: recordLaxo }),
      execute: ({ tema }) => aplicar({ accion: "set_page_theme", tema }),
    }),
    set_nav: tool({
      description: "Incluye o quita una sección del menú (nav) por `id`; `nav:null` la quita.",
      inputSchema: z.object({ id: z.string().min(1), nav: recordLaxo.nullable() }),
      execute: ({ id, nav }) => aplicar({ accion: "set_section_nav", id, nav }),
    }),
  };
}

/** Prompt de sistema: rol, página actual, selección, y los guardrails (solo borrador, nunca publicar). */
function construirSystemPrompt(estado: EstadoAsistente, seleccionId?: string): string {
  const sel = seleccionId
    ? `La sección seleccionada por el Organizador es id=${seleccionId}.`
    : "No hay ninguna sección seleccionada.";
  return [
    "Eres el asistente del editor visual de una tienda. Ayudas al Organizador a editar la página",
    "usando SOLO las tools disponibles — jamás inventas HTML, CSS ni colores hex.",
    "Trabajas únicamente sobre el BORRADOR: NUNCA publicas (eso lo hace el humano) y no tocas el chrome,",
    "otras páginas ni la marca. Elige estilos por su nombre semántico (usa listar_estilos si dudas).",
    "Cuando termines, responde en español con un resumen breve de lo que hiciste.",
    "",
    "Estado actual de la página:",
    outlineDe(estado.documento),
    sel,
  ].join("\n");
}

/**
 * Ejecuta un turno del asistente (F14/D21). Carga el borrador, arma el toolset sobre un estado mutable,
 * corre el loop de tool-calling con el modelo INYECTADO (máx `MAX_PASOS_ASISTENTE` pasos), y devuelve el
 * texto + las acciones aplicadas + el documento/version nuevos (el cliente patchea el preview con eso).
 * `modelo` null (sin API key) ⇒ `DomainError` limpio (sin volcar secretos, I-U6).
 */
export async function asistente({
  db,
  tenantId,
  slug = "home",
  mensajes,
  seleccionId,
  modelo,
  maxPasos = MAX_PASOS_ASISTENTE,
}: {
  db: DbAsistente;
  tenantId: string;
  slug?: string;
  mensajes: MensajeAsistente[];
  seleccionId?: string;
  modelo: LanguageModel | null;
  maxPasos?: number;
}): Promise<ResultadoAsistente> {
  if (!modelo) {
    throw new DomainError("INVALID", "El asistente de IA no está disponible en esta tienda.");
  }

  const inicial = await getPagina({ db, tenantId, cual: "draft", slug });
  const estado: EstadoAsistente = {
    version: inicial.version,
    documento: inicial.documento,
    acciones: [],
  };
  const herramientas = construirHerramientas({ db, tenantId, slug, estado });

  const res = await generateText({
    model: modelo,
    system: construirSystemPrompt(estado, seleccionId),
    messages: mensajes.map((m) => ({ role: m.rol, content: m.texto })),
    tools: herramientas,
    stopWhen: stepCountIs(maxPasos),
  });

  return {
    texto: res.text,
    acciones: estado.acciones,
    documento: estado.documento,
    version: estado.version,
  };
}
