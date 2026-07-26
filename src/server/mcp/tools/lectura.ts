import { z } from "zod";

import { resolverTenantDelPanel } from "~/server/authPolicy";
import { outlineDe } from "~/server/domain/pagebuilder/catalogoDelEditor";
import { getPagina } from "~/server/domain/pagebuilder/getPagina";
import { listarPaginas } from "~/server/domain/pagebuilder/paginas";
import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";
import { getEstadoCredencialFlow } from "~/server/domain/panel/getEstadoCredencialFlow";
import { getSorteoDelPanel } from "~/server/domain/panel/getSorteoDelPanel";
import { listarVentas } from "~/server/domain/panel/listarVentas";
import { getEstadoPublicacion } from "~/server/domain/tenants/getEstadoPublicacion";
import {
  definirToolDeCuenta,
  definirToolDeTienda,
  type ToolMcp,
} from "~/server/mcp/tools/definirTool";

/**
 * Tools de LECTURA del MCP del Organizador (F04). Todas invocan use cases existentes de
 * `src/server/domain/` — los mismos que usa el panel (I4). Este archivo no consulta la DB por su
 * cuenta ni deriva reglas: solo elige el use case y recorta el resultado.
 *
 * Es SU data: las mismas ventas y participaciones que ve en el panel, con la misma membresía. No
 * hay una frontera de privacidad nueva acá — la frontera es la de siempre, `TenantMembership`.
 *
 * Dos criterios de recorte que se repiten en todo el archivo:
 * - **Nunca se exponen `id` internos (cuid)** cuando hay una clave humana. La Tienda se direcciona
 *   por su slug y punto: darle cuids a un LLM lo invita a pasearlos entre tools y a inventarlos.
 * - **Los montos viajan como string** (los devuelve `Decimal`, y `ejecutarTool` los serializa
 *   exactos). Jamás se convierten a `number` en el camino.
 */

const misTiendas = definirToolDeCuenta({
  nombre: "mis_tiendas",
  titulo: "Mis tiendas",
  descripcion:
    "Lista las tiendas que administras, con su dirección (slug) y su nombre. Empieza por acá: el resto de las tools piden la dirección de la tienda. Para ver el detalle de una, usa estado_tienda.",
  entrada: {},
  manejar: async (_args, ctx, acceso) => {
    const { tenants } = await getAccesoActual({ db: ctx.db, acceso });
    return {
      tiendas: tenants.map((t) => ({ direccion: t.slug, nombre: t.nombre })),
    };
  },
});

const estadoTienda = definirToolDeTienda({
  nombre: "estado_tienda",
  titulo: "Estado de la tienda",
  descripcion:
    "Estado de publicación de una tienda y el checklist de lo que falta para publicarla (términos aceptados, Flow conectado, al menos un producto entregable, sorteo activo con bases). Devuelve también si ya cumple todo. Publicar es un paso que haces tú desde el panel: no existe una tool para eso.",
  entrada: {},
  manejar: async (_args, ctx, acceso) =>
    getEstadoPublicacion({ db: ctx.db, acceso }),
});

const listarVentasTool = definirToolDeTienda({
  nombre: "listar_ventas",
  titulo: "Ventas de la tienda",
  descripcion:
    "Últimas ventas de la tienda (más recientes primero), con su estado, total, ítems y datos del comprador. Devuelve páginas: si viene 'nextCursor', pásalo como 'cursor' para pedir la siguiente. Los montos son pesos chilenos y vienen como texto para no perder precisión: no los conviertas a número.",
  entrada: {
    cursor: z
      .string()
      .optional()
      .describe("Cursor devuelto por una llamada anterior, para seguir paginando."),
  },
  manejar: async (args, ctx, acceso) =>
    listarVentas({ db: ctx.db, acceso, input: { cursor: args.cursor } }),
});

const verSorteo = definirToolDeTienda({
  nombre: "ver_sorteo",
  titulo: "Sorteo de la tienda",
  descripcion:
    "El sorteo actual de la tienda: nombre, premio, fechas, estado, total de participaciones y los participantes agrupados por correo con sus números de ticket. Si ya se ejecutó, incluye el ganador. Ejecutar el sorteo es irreversible y solo lo haces tú desde el panel: no existe una tool para eso.",
  entrada: {},
  manejar: async (_args, ctx, acceso) =>
    getSorteoDelPanel({ db: ctx.db, acceso }),
});

const estadoFlow = definirToolDeTienda({
  nombre: "estado_flow",
  titulo: "Estado de la conexión con Flow",
  descripcion:
    "Dice si la tienda tiene configurada su cuenta de Flow (la pasarela con la que cobra), si está en modo de pruebas y cuándo se actualizó. NUNCA devuelve las credenciales: no hay forma de leerlas, ni con esta tool ni con ninguna otra. Para cambiarlas está guardar_credencial_flow.",
  entrada: {},
  manejar: async (_args, ctx, acceso) =>
    getEstadoCredencialFlow({ db: ctx.db, acceso }),
});

const verPagina = definirToolDeTienda({
  nombre: "ver_pagina",
  titulo: "Contenido de una página",
  descripcion:
    "Muestra el esquema de una página de la tienda: sus secciones numeradas con el tipo y el id de cada una, más el número de versión (lo necesitas para editarla) y qué páginas existen. Lee siempre el BORRADOR, que es lo que se puede editar; lo que está publicado no cambia hasta que tú lo publiques desde el panel.",
  entrada: {
    pagina: z
      .string()
      .optional()
      .describe('Dirección de la página dentro de la tienda. Por omisión, "home".'),
  },
  manejar: async (args, ctx, acceso) => {
    // El único lugar del archivo que necesita el tenantId: `getPagina`/`listarPaginas` lo reciben
    // directo (no `acceso`). Sale de la política, nunca de un argumento.
    const tenantId = resolverTenantDelPanel(acceso);
    const slug = args.pagina ?? "home";

    const [pagina, paginas] = await Promise.all([
      getPagina({ db: ctx.db, tenantId, cual: "draft", slug }),
      listarPaginas({ db: ctx.db, tenantId }),
    ]);

    return {
      pagina: slug,
      // Outline numerado en vez del JSON crudo: el documento entero son miles de tokens de props
      // que el modelo no necesita para razonar sobre la estructura (y que le costaría no alucinar).
      secciones: outlineDe(pagina.documento),
      version: pagina.version,
      publicadaAlgunaVez: pagina.publicado,
      publicadaEl: pagina.publishedAt,
      paginasDeLaTienda: paginas.map((p) => ({
        pagina: p.slug,
        esInicio: p.esHome,
        enMenu: p.enNav,
        publicada: p.publicado,
      })),
    };
  },
});

export const TOOLS_DE_LECTURA: ToolMcp[] = [
  misTiendas,
  estadoTienda,
  listarVentasTool,
  verSorteo,
  estadoFlow,
  verPagina,
];
