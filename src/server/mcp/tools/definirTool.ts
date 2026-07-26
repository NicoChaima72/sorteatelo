import { z, type ZodRawShape } from "zod";

import { type AccesoPanel } from "~/server/authPolicy";
import {
  accesoParaTienda,
  accesoSinTienda,
  type ContextoMcp,
} from "~/server/mcp/contextoMcp";

/**
 * Definición de tools del MCP y —lo importante— el seam que hace **imposible que una tool se
 * olvide de autorizar** (D4/I1).
 *
 * El riesgo estructural de este borde: hay ~20 tools y todas las que operan una Tienda la reciben
 * por argumento. Alcanza con que UNA use ese slug directo contra la DB para abrir una fuga
 * cross-tenant — el bug H1 de datawalt-app otra vez, repartido en veinte oportunidades.
 *
 * La defensa no es la disciplina de quien escribe la tool: es que **el handler nunca ve el slug**.
 * `definirToolDeTienda` agrega el argumento `tienda` al esquema, lo consume resolviéndolo contra
 * la membresía viva, y le pasa al handler un `AccesoPanel` ya scopeado. Si la tienda no es del
 * dueño del token, el handler ni se ejecuta.
 *
 * Corolario para quien agregue una tool: si tu handler necesita un `tenantId`, sale de
 * `resolverTenantDelPanel(acceso)` — no hay otro camino, porque no tienes el slug.
 */

/** Tipo del input ya parseado por Zod a partir del shape declarado. */
type EntradaDe<TShape extends ZodRawShape> = {
  [K in keyof TShape]: z.infer<TShape[K]>;
};

/**
 * Sello que solo ponen las dos factories de este archivo. Existe porque `ToolMcp` es una interfaz
 * pública: sin el sello, alguien podría construir a mano un objeto con esa forma, leer el slug
 * crudo de `args` y auto-declararse `ambito: "cuenta"` para escaparse del test que recorre las
 * tools de tienda. Con el sello, el inventario se puede auditar: hay un test que exige que TODA
 * tool registrada haya pasado por acá (y por lo tanto por la autorización).
 *
 * Symbol y no-enumerable: no ensucia el JSON ni las comparaciones de shape en los tests.
 */
const SELLO_FACTORY = Symbol.for("sorteatelo.mcp.toolDeFactory");

function sellar(tool: ToolMcp): ToolMcp {
  Object.defineProperty(tool, SELLO_FACTORY, {
    value: true,
    enumerable: false,
  });
  return tool;
}

/** ¿La tool salió de una de las factories de este archivo (y por lo tanto autoriza)? */
export function vieneDeFactory(tool: ToolMcp): boolean {
  return (tool as unknown as Record<symbol, unknown>)[SELLO_FACTORY] === true;
}

/**
 * Tool ya lista para registrarse en el `McpServer`. `manejar` recibe el contexto crudo y devuelve
 * el dato del use case; el envoltorio de errores/audit lo pone el registro, no cada tool.
 */
export interface ToolMcp {
  nombre: string;
  titulo: string;
  descripcion: string;
  entrada: ZodRawShape;
  /** ¿Opera sobre una Tienda o a nivel cuenta? Lo usa el inventario para documentarse. */
  ambito: "tienda" | "cuenta";
  manejar: (args: Record<string, unknown>, ctx: ContextoMcp) => Promise<unknown>;
}

/**
 * Argumento común a toda tool de Tienda. La descripción es lo ÚNICO que el modelo lee para saber
 * qué poner acá, así que dice el formato y de dónde sacarlo.
 */
const ARG_TIENDA = {
  tienda: z
    .string()
    .min(1)
    .describe(
      'Dirección (slug) de la tienda, la parte antes del punto en "<tienda>.sorteatelo.cl". Usa la tool "mis_tiendas" para ver las tuyas.',
    ),
};

export function definirToolDeTienda<TShape extends ZodRawShape>(def: {
  nombre: string;
  titulo: string;
  descripcion: string;
  /** Argumentos propios de la tool. NO incluyas `tienda`: lo agrega este seam. */
  entrada: TShape;
  manejar: (
    args: EntradaDe<TShape>,
    ctx: ContextoMcp,
    acceso: AccesoPanel,
  ) => Promise<unknown>;
}): ToolMcp {
  // Fail-fast ante una colisión de nombre: si la tool declarara su propio campo `tienda`, el
  // spread de abajo lo pisaría EN SILENCIO y el handler recibiría un input distinto del que
  // documentó. Mejor reventar al cargar el módulo que depurar una tool que ignora un argumento.
  if ("tienda" in def.entrada) {
    throw new Error(
      `La tool "${def.nombre}" declara un argumento "tienda": ese nombre lo reserva definirToolDeTienda.`,
    );
  }

  return sellar({
    nombre: def.nombre,
    titulo: def.titulo,
    descripcion: def.descripcion,
    entrada: { ...def.entrada, ...ARG_TIENDA },
    ambito: "tienda",
    manejar: async (args, ctx) => {
      const { tienda, ...resto } = args as { tienda: string };
      // Autorización ANTES del handler: si el slug no está en la membresía viva, tira FORBIDDEN
      // y el handler no llega a correr.
      const acceso = accesoParaTienda(ctx, tienda);
      return def.manejar(resto as EntradaDe<TShape>, ctx, acceso);
    },
  });
}

/**
 * Tool a nivel CUENTA (crear una Tienda): precede a cualquier membresía, así que no recibe
 * `tienda`. El acceso que entrega tiene `tenantIdDelHost: null` — cualquier use case que exija
 * Tienda falla fail-closed en vez de agarrar una al azar.
 */
export function definirToolDeCuenta<TShape extends ZodRawShape>(def: {
  nombre: string;
  titulo: string;
  descripcion: string;
  entrada: TShape;
  manejar: (
    args: EntradaDe<TShape>,
    ctx: ContextoMcp,
    acceso: AccesoPanel,
  ) => Promise<unknown>;
}): ToolMcp {
  return sellar({
    nombre: def.nombre,
    titulo: def.titulo,
    descripcion: def.descripcion,
    entrada: def.entrada,
    ambito: "cuenta",
    manejar: async (args, ctx) =>
      def.manejar(args as EntradaDe<TShape>, ctx, accesoSinTienda(ctx)),
  });
}
