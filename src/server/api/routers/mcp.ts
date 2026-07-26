import { createTRPCRouter, panelProcedure } from "~/server/api/trpc";
import { runDomain } from "~/server/api/runDomain";
import {
  listarConexionesDeUsuario,
  revocarConexion,
  revocarConexionInput,
} from "~/server/mcp/tokens";

/**
 * Router de las **Conexiones MCP** del usuario logueado (F09) — la pantalla «Conexiones IA» del
 * panel. Adapter fino: los dos procedures delegan en `~/server/mcp/tokens`, el único módulo que
 * toca las tablas de tokens.
 *
 * Es un router **per-usuario, no per-Tienda**: una Conexión MCP pertenece a la persona y cruza sus
 * Tiendas (con un solo token se configura una y se crea otra). Por eso usa `ctx.acceso.userId` y
 * NUNCA `tenantIdDelHost` — la sección vive dentro de Configuración de una Tienda solo porque es
 * donde el Organizador la va a buscar, no porque el dato dependa de esa Tienda.
 *
 * `panelProcedure` alcanza como gate: exige sesión y resuelve el `userId` server-side. No hace falta
 * membresía — un usuario sin Tienda igual puede tener conexiones (con `crear_tienda` es justamente
 * lo primero que haría), y tiene el mismo derecho a cortarlas.
 */
export const mcpRouter = createTRPCRouter({
  listarConexiones: panelProcedure.query(({ ctx }) =>
    runDomain(() =>
      listarConexionesDeUsuario({ db: ctx.db, userId: ctx.acceso.userId }),
    ),
  ),

  revocarConexion: panelProcedure
    .input(revocarConexionInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () => {
        // Idempotente y sin oráculo (RFC 7009): revocar una conexión ajena o inexistente no falla ni
        // delata nada — el `where` incluye el `userId` de la sesión, así que simplemente no toca
        // ninguna fila. El clientId sale de la lista, que ya es del propio usuario.
        await revocarConexion({
          db: ctx.db,
          userId: ctx.acceso.userId,
          clientId: input.clientId,
        });
        return { revocada: true as const };
      }),
    ),
});
