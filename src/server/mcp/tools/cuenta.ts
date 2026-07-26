import { z } from "zod";

import { guardarCredencialFlow } from "~/server/domain/panel/guardarCredencialFlow";
import { guardarCredencialFlowInput } from "~/server/domain/panel/schemas";
import { crearTienda } from "~/server/domain/tenants/crearTienda";
import { crearTiendaInput } from "~/server/domain/tenants/schemas";
import { claveDeCifradoDeEnv } from "~/server/pago/flowDeTenant";
import {
  definirToolDeCuenta,
  definirToolDeTienda,
  type ToolMcp,
} from "~/server/mcp/tools/definirTool";

/**
 * Tools de CUENTA (F08): las dos que salen del molde «operar una Tienda que ya existe».
 *
 * `crear_tienda` es la única tool que **precede a toda membresía**: no recibe `tienda` porque
 * todavía no hay ninguna que recibir. Por eso usa `definirToolDeCuenta`, cuyo `AccesoPanel` tiene
 * `tenantIdDelHost: null` — si alguien la cambiara por una tool que necesita Tienda, fallaría
 * fail-closed en vez de agarrar una al azar. El `userId` de la membresía nueva sale del token; no
 * existe un argumento para elegir a nombre de quién crear.
 *
 * `guardar_credencial_flow` es la **excepción D8**, empujada por el usuario: es el único punto donde
 * un secreto ENTRA por el MCP. La frontera se sostiene en que sea write-only —
 * - se cifra at-rest con el mismo use case del panel (ADR-0006);
 * - no existe ninguna tool que devuelva credenciales, en ninguna forma (ni cifradas);
 * - el audit las tacha (F10);
 * - y la `description` **advierte del riesgo residual que no podemos cerrar**: el secreto viaja por
 *   el contexto del LLM y queda en el historial de conversación DEL usuario. Eso no lo arregla el
 *   cifrado; lo único honesto es decirlo y recomendar el panel.
 *
 * Una tool cuya description omite su propio riesgo empuja al agente a usarla sin mencionarlo.
 */

const crearTiendaTool = definirToolDeCuenta({
  nombre: "crear_tienda",
  titulo: "Crear una tienda",
  descripcion:
    "Crea una tienda nueva a nombre de quien está conectado. La tienda nace SIN publicar, con su página inicial lista para editar, y queda a tu nombre. En esta versión cada cuenta administra una sola tienda: si ya tienes una, esto falla. Publicarla es un paso que haces tú desde el panel, cuando el checklist esté completo (mira estado_tienda).",
  entrada: {
    direccion: z
      .string()
      .describe(
        'Dirección de la tienda: será su subdominio ("<direccion>.sorteatelo.cl"). Solo minúsculas, números y guiones.',
      ),
    nombre: z
      .string()
      .describe("Nombre de la tienda tal como lo verán los compradores."),
  },
  manejar: async (args, ctx, acceso) =>
    crearTienda({
      db: ctx.db,
      acceso,
      // El esquema del dominio normaliza (trim + minúsculas) y acota; la forma exacta del subdominio
      // y los slugs reservados los valida el use case, con mensajes que el agente puede accionar.
      input: crearTiendaInput.parse({
        slug: args.direccion,
        nombre: args.nombre,
      }),
    }),
});

const guardarCredencialFlowTool = definirToolDeTienda({
  nombre: "guardar_credencial_flow",
  titulo: "Cargar las credenciales de Flow de la tienda",
  descripcion:
    "Guarda las credenciales de Flow (la pasarela con la que cobra la tienda). Se guardan cifradas y no hay forma de volver a leerlas: ni esta tool ni ninguna otra las devuelve. AVISO IMPORTANTE que debes darle a la persona antes de que las escriba acá: al pasarlas por este chat, sus claves quedan en el historial de la conversación, que no controlamos. Lo más seguro es cargarlas en el panel, en Configuración → Pagos; usa esta tool solo si la persona, avisada, prefiere hacerlo por acá.",
  entrada: {
    apiKey: z.string().describe("API Key de la cuenta de Flow del organizador."),
    secretKey: z.string().describe("Secret Key de la cuenta de Flow del organizador."),
    modoPruebas: z
      .boolean()
      .describe(
        "true para el ambiente de pruebas de Flow (sandbox, no cobra de verdad); false para cobrar en producción.",
      ),
  },
  manejar: async (args, ctx, acceso) =>
    guardarCredencialFlow({
      db: ctx.db,
      acceso,
      input: guardarCredencialFlowInput.parse({
        apiKey: args.apiKey,
        secretKey: args.secretKey,
        sandbox: args.modoPruebas,
      }),
      // Igual que en el router del panel: la clave se resuelve acá dentro, así que si falta
      // `CREDENTIALS_ENCRYPTION_KEY` el error es interno (log del servidor) y no viaja al contexto
      // del LLM — un problema de configuración nuestro no es algo que el agente pueda corregir.
      clave: claveDeCifradoDeEnv(),
    }),
});

export const TOOLS_DE_CUENTA: ToolMcp[] = [
  crearTiendaTool,
  guardarCredencialFlowTool,
];
