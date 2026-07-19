import { randomUUID } from "node:crypto";
import { type ZodError } from "zod";

import { PageDocumentSchema, type PageDocument } from "~/lib/pagebuilder/schema";
import { WIDGET_REGISTRY, type WidgetTipo } from "~/lib/pagebuilder/widgets";
import { DomainError } from "~/server/domain/errors";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";

/**
 * Transform PURO del documento (F04, ADR-0016): aplica UNA mutación direccionada por `id` a un
 * `PageDocument` ya válido y devuelve un `PageDocument` nuevo válido, o lanza `DomainError`. Sin DB,
 * sin sesión: es la lógica que el LLM del MCP (F06) y un editor futuro comparten. La validación de
 * REFERENCIAS (productoIds del tenant, D6) NO va acá (requiere DB) — la hace `aplicarMutacionPagina`.
 *
 * Contrato: cada rama construye un documento crudo y lo revalida ENTERO contra `PageDocumentSchema`
 * (I3) ⇒ props fuera de shape/límite ⇒ `INVALID` sin mutar nada; un `id` inexistente ⇒ `NOT_FOUND`.
 */

/** Nodo laxo para transformar; el parse final impone el shape estricto. */
interface NodoLaxo {
  id: string;
  tipo: string;
  v: number;
  props: Record<string, unknown>;
  /** Estilo de sección en el envelope (catálogo-v2 F01/D2); ausente ⇒ el nodo no lleva estilo. */
  estilo?: unknown;
}

/** `true` sii `tipo` es un widget de SECCIÓN del registro (no overlay, no inexistente). */
function esTipoSeccion(tipo: string): tipo is WidgetTipo {
  return (
    Object.prototype.hasOwnProperty.call(WIDGET_REGISTRY, tipo) &&
    WIDGET_REGISTRY[tipo as WidgetTipo].categoria === "seccion"
  );
}

/** Resumen corto del primer issue de Zod (para el mensaje del DomainError, útil al LLM). */
function resumenZod(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "documento inválido";
  const ruta = issue.path.join(".");
  return ruta ? `${ruta}: ${issue.message}` : issue.message;
}

function parsear(raw: unknown): PageDocument {
  const res = PageDocumentSchema.safeParse(raw);
  if (!res.success) {
    throw new DomainError("INVALID", `Documento inválido — ${resumenZod(res.error)}`);
  }
  return res.data;
}

export function aplicarMutacion(
  doc: PageDocument,
  mut: MutacionPagina,
): PageDocument {
  // Copias laxas mutables; el parse final valida. Se preserva `estilo` del envelope (catálogo-v2 F01).
  const secciones: NodoLaxo[] = doc.secciones.map((s) => ({
    id: s.id,
    tipo: s.tipo,
    v: s.v,
    props: { ...s.props },
    ...(s.estilo !== undefined ? { estilo: s.estilo } : {}),
  }));
  let root: { props: Record<string, unknown> } = { props: { ...doc.root.props } };

  switch (mut.accion) {
    case "add_section": {
      if (!esTipoSeccion(mut.tipo)) {
        throw new DomainError(
          "INVALID",
          `Tipo de sección desconocido: "${mut.tipo}".`,
        );
      }
      const def = WIDGET_REGISTRY[mut.tipo];
      const nodo: NodoLaxo = {
        id: randomUUID(),
        tipo: mut.tipo,
        v: def.v,
        props: {
          ...(def.defaultProps as Record<string, unknown>),
          ...(mut.props ?? {}),
        },
      };
      const pos =
        mut.posicion === undefined
          ? secciones.length
          : Math.min(mut.posicion, secciones.length);
      secciones.splice(pos, 0, nodo);
      break;
    }
    case "move_section": {
      const idx = secciones.findIndex((s) => s.id === mut.id);
      if (idx === -1) {
        throw new DomainError("NOT_FOUND", `Sección no encontrada: "${mut.id}".`);
      }
      const [nodo] = secciones.splice(idx, 1);
      const dest = Math.min(mut.aPosicion, secciones.length);
      secciones.splice(dest, 0, nodo!);
      break;
    }
    case "remove_section": {
      const idx = secciones.findIndex((s) => s.id === mut.id);
      if (idx === -1) {
        throw new DomainError("NOT_FOUND", `Sección no encontrada: "${mut.id}".`);
      }
      secciones.splice(idx, 1);
      break;
    }
    case "update_section_props": {
      const nodo = secciones.find((s) => s.id === mut.id);
      if (!nodo) {
        throw new DomainError("NOT_FOUND", `Sección no encontrada: "${mut.id}".`);
      }
      nodo.props = { ...nodo.props, ...mut.props }; // merge shallow
      break;
    }
    case "set_theme": {
      root = { props: { ...mut.props } };
      break;
    }
    case "set_page_theme": {
      // Espejo semántico de `set_theme` (catálogo-v2 F01/D3): escribe root.props; el parse final
      // revalida contra `TemaSchema` ⇒ tema inválido ⇒ INVALID sin mutar.
      root = { props: { ...mut.tema } };
      break;
    }
    case "set_section_style": {
      const nodo = secciones.find((s) => s.id === mut.id);
      if (!nodo) {
        throw new DomainError("NOT_FOUND", `Sección no encontrada: "${mut.id}".`);
      }
      // Reemplaza el estilo COMPLETO del nodo (el panel/MCP mandan el objeto entero). El parse final
      // revalida contra `EstiloSeccionSchema` ⇒ esquema/enum fuera de rango o hex crudo ⇒ INVALID.
      nodo.estilo = mut.estilo;
      break;
    }
    case "apply_page": {
      // Reemplazo total: se parsea el documento crudo entrante entero (I3).
      return parsear(mut.documento);
    }
  }

  return parsear({
    schemaVersion: doc.schemaVersion,
    root,
    secciones,
    overlays: doc.overlays,
  });
}
