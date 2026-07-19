import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";
import { DomainError } from "~/server/domain/errors";
import { verificarBearer } from "~/server/mcp/auth";
import {
  mcpGetPage,
  mcpListProducts,
  mcpListStyleOptions,
  mcpListVersions,
  mcpListWidgetTypes,
  mcpMutar,
  mcpPublishPage,
  mcpRollback,
} from "~/server/mcp/tools";

/**
 * Editor MCP del page builder (F06/PD5/D10/R4, ADR-0016). PRIMERA ruta App Router del repo (Next 14
 * permite `app/` junto a `pages/`); SOLO esta ruta usa app router. Streamable HTTP stateless
 * (`disableSse`, sin Redis). Auth: Bearer `MCP_OPERADOR_TOKEN` (Operador god-mode, elige `storeSlug`).
 *
 * Este archivo es BORDE de transporte: NO tiene lógica de negocio. Cada tool cabla mcp-handler a las
 * funciones de `~/server/mcp/tools` (que resuelven tenant server-side por `storeSlug` y delegan en
 * los use cases de F04). Un `DomainError` se devuelve como resultado ESTRUCTURADO (isError) para que
 * el LLM se autocorrija sin dejar el borrador inválido; el borrador solo cambia si la mutación fue
 * válida. El MCP escribe SOLO el Borrador; `publish_page` es el checkpoint humano (I6).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Envuelve una tool: éxito ⇒ JSON del resultado; `DomainError` ⇒ error estructurado (isError). */
async function responder(fn: () => unknown): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    if (e instanceof DomainError) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: { code: e.code, message: e.message } }, null, 2),
          },
        ],
        isError: true,
      };
    }
    throw e; // errores no-dominio: que mcp-handler los maneje
  }
}

const mcpHandler = createMcpHandler(
  (server) => {
    // ── Lecturas ──────────────────────────────────────────────────────────
    server.tool(
      "get_page",
      "Lee la Página de tienda (borrador por defecto, o 'published') con un outline numerado, el JSON del documento y la version (usá esa version como expectedVersion en las mutaciones).",
      { storeSlug: z.string(), cual: z.enum(["draft", "published"]).optional() },
      (a) => responder(() => mcpGetPage({ db, storeSlug: a.storeSlug, cual: a.cual })),
    );

    server.tool(
      "list_widget_types",
      "Lista los tipos de sección disponibles con sus props por defecto (para add_section).",
      {},
      () => responder(() => mcpListWidgetTypes()),
    );

    server.tool(
      "list_products",
      "Lista los productos de la tienda (id/titulo/precio/activo) para referenciarlos en un catálogo modo 'seleccion'.",
      { storeSlug: z.string() },
      (a) => responder(() => mcpListProducts({ db, storeSlug: a.storeSlug })),
    );

    server.tool(
      "list_style_options",
      "Lista TODAS las opciones de estilo (fondo/spacing/ancho/divisor/entrada por sección) y de tema (modo/radio/vibe/tipografía/ancho/fondo por página) con su descripción — elegí por intención nombrada, NUNCA hex ni CSS. Usalas en set_section_style y set_page_theme.",
      {},
      () => responder(() => mcpListStyleOptions()),
    );

    // ── Mutaciones del borrador (direccionadas por id) ────────────────────
    server.tool(
      "add_section",
      "Agrega una sección de `tipo` (ver list_widget_types) al borrador, opcionalmente en `posicion` y con `props` override.",
      {
        storeSlug: z.string(),
        tipo: z.string(),
        posicion: z.number().int().min(0).optional(),
        props: z.record(z.string(), z.unknown()).optional(),
        expectedVersion: z.number().int(),
      },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "add_section", tipo: a.tipo, posicion: a.posicion, props: a.props },
          }),
        ),
    );

    server.tool(
      "move_section",
      "Mueve una sección (por `id`) a la posición `aPosicion`.",
      {
        storeSlug: z.string(),
        id: z.string(),
        aPosicion: z.number().int().min(0),
        expectedVersion: z.number().int(),
      },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "move_section", id: a.id, aPosicion: a.aPosicion },
          }),
        ),
    );

    server.tool(
      "remove_section",
      "Quita una sección por `id`.",
      { storeSlug: z.string(), id: z.string(), expectedVersion: z.number().int() },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "remove_section", id: a.id },
          }),
        ),
    );

    server.tool(
      "update_section_props",
      "Actualiza (merge) las props de una sección por `id`.",
      {
        storeSlug: z.string(),
        id: z.string(),
        props: z.record(z.string(), z.unknown()),
        expectedVersion: z.number().int(),
      },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "update_section_props", id: a.id, props: a.props },
          }),
        ),
    );

    server.tool(
      "set_theme",
      "Setea el tema (root.props) del documento.",
      { storeSlug: z.string(), props: z.record(z.string(), z.unknown()), expectedVersion: z.number().int() },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "set_theme", props: a.props },
          }),
        ),
    );

    // ── Estilo por sección + tema por página (catálogo-v2 F07; ver list_style_options) ────
    server.tool(
      "set_section_style",
      "Setea el ESTILO de una sección (por `id`): fondo/spacing/ancho/divisor/entrada. Usá SOLO valores de list_style_options (nunca hex ni CSS). Objeto completo (reemplaza el estilo del nodo).",
      {
        storeSlug: z.string(),
        id: z.string(),
        estilo: z.record(z.string(), z.unknown()),
        expectedVersion: z.number().int(),
      },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "set_section_style", id: a.id, estilo: a.estilo },
          }),
        ),
    );

    server.tool(
      "set_page_theme",
      "Setea el TEMA de la página (root.props): modo/radio/vibe/tipografía/ancho/fondo. Usá SOLO valores de list_style_options. Objeto `tema` COMPLETO (reemplaza el tema; los campos ausentes vuelven a su default).",
      {
        storeSlug: z.string(),
        tema: z.record(z.string(), z.unknown()),
        expectedVersion: z.number().int(),
      },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "set_page_theme", tema: a.tema },
          }),
        ),
    );

    server.tool(
      "apply_page",
      "Reemplaza TODO el borrador por un documento nuevo (primer volcado desde una foto). Se valida entero.",
      { storeSlug: z.string(), documento: z.unknown(), expectedVersion: z.number().int() },
      (a) =>
        responder(() =>
          mcpMutar({
            db,
            storeSlug: a.storeSlug,
            expectedVersion: a.expectedVersion,
            mutacion: { accion: "apply_page", documento: a.documento },
          }),
        ),
    );

    // ── Publicación (checkpoint humano, I6) ───────────────────────────────
    server.tool(
      "publish_page",
      "Publica el borrador (lo hace visible en el storefront) y guarda un snapshot de revisión. Acción explícita: usala SOLO cuando el humano lo pida.",
      { storeSlug: z.string(), expectedVersion: z.number().int().optional() },
      (a) =>
        responder(() =>
          mcpPublishPage({ db, storeSlug: a.storeSlug, expectedVersion: a.expectedVersion }),
        ),
    );

    // ── Historial + rollback (F12) ────────────────────────────────────────
    server.tool(
      "list_versions",
      "Lista el historial de publicaciones (revisiones) de la página, de la más reciente a la más vieja.",
      { storeSlug: z.string() },
      (a) => responder(() => mcpListVersions({ db, storeSlug: a.storeSlug })),
    );

    server.tool(
      "rollback_page",
      "Copia una revisión publicada vieja (por su número) al BORRADOR. NO la hace visible: hay que publicar (publish_page) después de revisarla.",
      { storeSlug: z.string(), revision: z.number().int().positive() },
      (a) => responder(() => mcpRollback({ db, storeSlug: a.storeSlug, revision: a.revision })),
    );
  },
  { serverInfo: { name: "sorteatelo-pagebuilder", version: "1.0.0" } },
  { basePath: "/api/mcp", disableSse: true, verboseLogs: false },
);

/** 401 fail-closed (sin/mal Bearer): ninguna tool ejecuta. */
function noAutorizado(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "No autorizado" },
      id: null,
    }),
    {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    },
  );
}

/** Gate Bearer ANTES de delegar a mcp-handler: si falla, 401 sin ejecutar tool alguna. */
async function handler(req: Request): Promise<Response> {
  if (!verificarBearer(req.headers.get("authorization"), env.MCP_OPERADOR_TOKEN)) {
    return noAutorizado();
  }
  return mcpHandler(req);
}

export { handler as GET, handler as POST, handler as DELETE };
