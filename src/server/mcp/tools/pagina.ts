import { z } from "zod";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import { WIDGET_META, TIPOS_SECCION } from "~/lib/pagebuilder/widgets";
import { resolverTenantDelPanel, type AccesoPanel } from "~/server/authPolicy";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import {
  listarOpcionesEstilo,
  outlineDe,
} from "~/server/domain/pagebuilder/catalogoDelEditor";
import { getPagina } from "~/server/domain/pagebuilder/getPagina";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { DomainError } from "~/server/domain/errors";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import {
  definirToolDeCuenta,
  definirToolDeTienda,
  type ToolMcp,
} from "~/server/mcp/tools/definirTool";

/**
 * Tools de PÁGINA (F07): el agente edita el **Borrador** de la Página de tienda.
 *
 * Que el MCP pueda tocar la página y ADR-0018 (checkpoint humano contra editores automáticos)
 * convivan se sostiene en una sola cosa: **estas tools escriben `draftJson` y nada más**. El
 * storefront público lee `publishedJson`, así que ninguna cantidad de mutaciones por chat cambia lo
 * que ve un comprador hasta que una persona aprieta Publicar en el panel. No hay tool que publique
 * (el registro es la whitelist, I3) y hay un test que lo verifica por inventario.
 *
 * Las tres piezas prestadas del editor visual (I4 — cero lógica de dominio acá):
 * - `aplicarMutacionPagina` — lock optimista por `version` + revalidación del documento COMPLETO
 *   contra el Registro de widgets + validación de referencias tenant-scoped.
 * - `getPagina` — lectura del Borrador.
 * - `listarOpcionesEstilo` / `WIDGET_META` — el catálogo, para que el agente elija por intención
 *   nombrada y no invente hex, CSS ni nombres de props.
 *
 * **Una tool por acción** y no una sola con una unión discriminada: un `oneOf` en el JSON Schema es
 * justo la forma que los modelos arman mal, y el costo de equivocarse acá se paga en el documento
 * de una tienda real.
 */

/**
 * Argumentos comunes: qué página y sobre qué versión. `version` es OBLIGATORIA a propósito.
 *
 * La tentación es leerla sola adentro (el agente ya tuvo que llamar `ver_pagina`, es un paso más).
 * Pero el lock optimista existe para detectar que ALGUIEN MÁS movió el borrador entremedio — y ese
 * alguien es, típicamente, el propio Organizador en el editor visual mientras le pide cambios al
 * chat. Si el borde resolviera la versión por su cuenta, el lock siempre coincidiría consigo mismo
 * y el conflicto se resolvería pisando el trabajo del humano en silencio.
 */
const ARGS_PAGINA = {
  pagina: z
    .string()
    .optional()
    .describe('Dirección de la página dentro de la tienda. Por omisión, "home".'),
  version: z
    .number()
    .int()
    .describe(
      "Número de versión del borrador, tal como lo devolvió ver_pagina (o la tool anterior). Si no coincide con el borrador actual la edición se rechaza, para no pisar cambios hechos en el panel.",
    ),
};

/** Props/estilo/tema como objeto libre: el shape fino lo impone el Registro de widgets server-side. */
const objetoLibre = z.record(z.string(), z.unknown());

/**
 * Recordatorio en CADA respuesta de mutación, no solo en la `description`: el agente lee la
 * `description` una vez y el resultado siempre. Es lo que hace que le diga a la persona "listo,
 * quedó en el borrador" en vez de "listo, ya está en tu tienda" — que sería falso.
 */
const NOTA_BORRADOR =
  "El cambio quedó en el borrador. Para que lo vean los compradores hay que publicar desde el panel.";

/** Aplica una mutación al Borrador. Devuelve el documento resultante para que cada tool resuma. */
async function aplicar({
  ctx,
  acceso,
  args,
  mutacion,
}: {
  ctx: ContextoMcp;
  acceso: AccesoPanel;
  args: { pagina?: string; version: number };
  mutacion: MutacionPagina;
}): Promise<{ pagina: string; version: number; documento: PageDocument }> {
  const tenantId = resolverTenantDelPanel(acceso);
  const slug = args.pagina ?? "home";

  const { version, documento } = await aplicarMutacionPagina({
    db: ctx.db,
    tenantId,
    mutacion,
    expectedVersion: args.version,
    slug,
  });

  return { pagina: slug, version, documento };
}

/**
 * Respuesta de las tools que cambian SECCIONES: versión nueva (para encadenar la edición siguiente)
 * + el esquema numerado con los ids. Nunca el documento crudo: son miles de tokens de props que el
 * modelo no necesita para razonar sobre la estructura, y que le costaría no alucinar si los tuviera.
 */
async function mutar(params: {
  ctx: ContextoMcp;
  acceso: AccesoPanel;
  args: { pagina?: string; version: number };
  mutacion: MutacionPagina;
}) {
  const { pagina, version, documento } = await aplicar(params);
  return {
    pagina,
    version,
    secciones: outlineDe(documento),
    borradorSinPublicar: true,
    nota: NOTA_BORRADOR,
  };
}

/** Lee el Borrador para poder MERGEAR sobre lo que ya hay (ver `cambiar_estilo_seccion`). */
async function leerBorrador({
  ctx,
  acceso,
  args,
}: {
  ctx: ContextoMcp;
  acceso: AccesoPanel;
  args: { pagina?: string };
}): Promise<PageDocument> {
  const tenantId = resolverTenantDelPanel(acceso);
  const { documento } = await getPagina({
    db: ctx.db,
    tenantId,
    cual: "draft",
    slug: args.pagina ?? "home",
  });
  return documento;
}

const verCatalogo = definirToolDeCuenta({
  nombre: "ver_catalogo_de_secciones",
  titulo: "Catálogo de secciones y estilos",
  descripcion:
    "Los tipos de sección que se pueden agregar a una página, con su nombre y para qué sirve cada uno, más las opciones de estilo de sección y de tema de página con la descripción de cada valor. Léelo ANTES de agregar o estilar una sección: los tipos y los valores son cerrados, y uno inventado se rechaza. Los colores se eligen por intención (por ejemplo «marca» o «tinta»), nunca por código hexadecimal.",
  // No pide tienda: es el catálogo de la plataforma, el mismo para todas. Pedir un slug para leer
  // una lista estática sería mentir sobre el scope de la tool.
  entrada: {},
  manejar: async () => {
    const opciones = listarOpcionesEstilo();
    return {
      secciones: TIPOS_SECCION.map((tipo) => ({
        tipo,
        nombre: WIDGET_META[tipo].titulo,
        paraQueSirve: WIDGET_META[tipo].descripcion,
        categoria: WIDGET_META[tipo].categoria,
      })),
      estiloDeSeccion: opciones.estiloSeccion,
      temaDePagina: opciones.temaPagina,
      comoAveriguarLasProps:
        "Los nombres de las props de cada sección salen de las que ya tiene la página: mira una sección del mismo tipo con ver_pagina. Una prop que no existe se rechaza.",
    };
  },
});

const agregarSeccion = definirToolDeTienda({
  nombre: "agregar_seccion",
  titulo: "Agregar una sección a la página",
  descripcion:
    "Agrega una sección del tipo indicado al borrador de la página, con sus valores por defecto. Los tipos válidos salen de ver_catalogo_de_secciones. Devuelve el esquema actualizado con los ids: de ahí sacas el id de la sección nueva para editarla. El cambio queda en el borrador; publicar es un paso que haces tú desde el panel.",
  entrada: {
    tipo: z
      .string()
      .describe("Tipo de sección, de ver_catalogo_de_secciones (ej. \"faq\", \"catalogo\")."),
    posicion: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Posición donde insertarla (0 = arriba de todo). Por omisión, al final."),
    props: objetoLibre
      .optional()
      .describe(
        "Valores iniciales, encima de los por defecto. Solo props que el tipo reconozca: una inventada se rechaza y no se guarda nada.",
      ),
    ...ARGS_PAGINA,
  },
  manejar: async (args, ctx, acceso) =>
    mutar({
      ctx,
      acceso,
      args,
      mutacion: {
        accion: "add_section",
        tipo: args.tipo,
        ...(args.posicion !== undefined ? { posicion: args.posicion } : {}),
        ...(args.props !== undefined ? { props: args.props } : {}),
      },
    }),
});

const editarSeccion = definirToolDeTienda({
  nombre: "editar_seccion",
  titulo: "Editar el contenido de una sección",
  descripcion:
    "Cambia el contenido (props) de una sección del borrador. Solo hay que mandar las props que cambian: las demás se conservan. Los nombres de las props son los que ya tiene la sección (los ves con ver_pagina); una que no exista se rechaza sin guardar nada. Los textos son texto plano: no se acepta HTML.",
  entrada: {
    id: z.string().describe("Id de la sección, del esquema que devuelve ver_pagina."),
    props: objetoLibre.describe("Solo las props que quieres cambiar."),
    ...ARGS_PAGINA,
  },
  manejar: async (args, ctx, acceso) =>
    // El merge de props lo hace el transform del dominio (`update_section_props` es shallow merge),
    // así que acá no hay nada que reconstruir.
    mutar({
      ctx,
      acceso,
      args,
      mutacion: { accion: "update_section_props", id: args.id, props: args.props },
    }),
});

const moverSeccion = definirToolDeTienda({
  nombre: "mover_seccion",
  titulo: "Mover una sección",
  descripcion:
    "Cambia el orden: mueve la sección a otra posición del borrador (0 = arriba de todo). El resto se corre solo.",
  entrada: {
    id: z.string().describe("Id de la sección, de ver_pagina."),
    aPosicion: z.number().int().min(0).describe("Posición destino (0 = arriba de todo)."),
    ...ARGS_PAGINA,
  },
  manejar: async (args, ctx, acceso) =>
    mutar({
      ctx,
      acceso,
      args,
      mutacion: { accion: "move_section", id: args.id, aPosicion: args.aPosicion },
    }),
});

const quitarSeccion = definirToolDeTienda({
  nombre: "quitar_seccion",
  titulo: "Quitar una sección de la página",
  descripcion:
    "Saca una sección del borrador de la página. Es reversible mientras no se publique: lo que está publicado no cambia, y el panel guarda las versiones publicadas anteriores. Aun así, confirma con la persona antes de quitar contenido que ella escribió.",
  entrada: {
    id: z.string().describe("Id de la sección, de ver_pagina."),
    ...ARGS_PAGINA,
  },
  manejar: async (args, ctx, acceso) =>
    mutar({
      ctx,
      acceso,
      args,
      mutacion: { accion: "remove_section", id: args.id },
    }),
});

const cambiarEstiloSeccion = definirToolDeTienda({
  nombre: "cambiar_estilo_seccion",
  titulo: "Cambiar el estilo de una sección",
  descripcion:
    "Cambia cómo se ve una sección: fondo, aire arriba y abajo, ancho, divisor, animación de entrada. Los valores válidos y qué hace cada uno salen de ver_catalogo_de_secciones. Solo hay que mandar lo que cambia. No se aceptan colores en hexadecimal ni CSS: se elige por intención (por ejemplo fondoEsquema \"marca\").",
  entrada: {
    id: z.string().describe("Id de la sección, de ver_pagina."),
    estilo: objetoLibre.describe("Solo las opciones de estilo que quieres cambiar."),
    ...ARGS_PAGINA,
  },
  manejar: async (args, ctx, acceso) => {
    // `set_section_style` REEMPLAZA el estilo completo del nodo (el editor visual siempre manda el
    // objeto entero, como un formulario). Vía agente eso es una trampa: "ponle fondo de marca a
    // esta sección" borraría el espaciado, el ancho y el divisor que la persona ya había elegido, y
    // el agente contestaría "listo". Se superpone sobre el estilo actual — mismo criterio que
    // `configurar_tienda` (F05): reconstrucción de argumentos, no lógica de negocio.
    const documento = await leerBorrador({ ctx, acceso, args });
    const seccion = documento.secciones.find((s) => s.id === args.id);
    if (!seccion) {
      throw new DomainError(
        "NOT_FOUND",
        `No hay una sección con el id «${args.id}» en el borrador. Usa ver_pagina para ver los ids actuales.`,
      );
    }

    return mutar({
      ctx,
      acceso,
      args,
      mutacion: {
        accion: "set_section_style",
        id: args.id,
        estilo: { ...(seccion.estilo ?? {}), ...args.estilo },
      },
    });
  },
});

const cambiarTemaPagina = definirToolDeTienda({
  nombre: "cambiar_tema_pagina",
  titulo: "Cambiar el tema de la página",
  descripcion:
    "Cambia el aspecto general de la página: modo claro u oscuro, redondeo, tipografía, ancho del contenido, fondo y ambiente. Los valores válidos y qué hace cada uno salen de ver_catalogo_de_secciones. Solo hay que mandar lo que cambia. El color de la tienda no se toca acá: eso es configurar_tienda.",
  entrada: {
    tema: objetoLibre.describe("Solo las opciones del tema que quieres cambiar."),
    ...ARGS_PAGINA,
  },
  manejar: async (args, ctx, acceso) => {
    // Mismo caso que el estilo de sección: `set_page_theme` reemplaza `root.props` completo, y los
    // campos ausentes vuelven a su valor por defecto. Cambiar el vibe no puede apagar el modo
    // oscuro que la persona eligió antes.
    const documento = await leerBorrador({ ctx, acceso, args });
    const temaPedido = { ...documento.root.props, ...args.tema };

    // El outline de secciones no aporta nada cuando el cambio fue del tema: se devuelve el tema
    // COMO QUEDÓ (el del documento revalidado, no el que se pidió), que es lo que el agente
    // necesita para confirmar sin suponer.
    const resultado = await aplicar({
      ctx,
      acceso,
      args,
      mutacion: { accion: "set_page_theme", tema: temaPedido },
    });
    return {
      pagina: resultado.pagina,
      version: resultado.version,
      tema: resultado.documento.root.props,
      borradorSinPublicar: true,
      nota: NOTA_BORRADOR,
    };
  },
});

export const TOOLS_DE_PAGINA: ToolMcp[] = [
  verCatalogo,
  agregarSeccion,
  editarSeccion,
  moverSeccion,
  quitarSeccion,
  cambiarEstiloSeccion,
  cambiarTemaPagina,
];
