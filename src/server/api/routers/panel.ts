import { runDomain } from "~/server/api/runDomain";
import { createTRPCRouter, panelProcedure } from "~/server/api/trpc";
import { actualizarProducto } from "~/server/domain/panel/actualizarProducto";
import { crearProducto } from "~/server/domain/panel/crearProducto";
import { ejecutarSorteo } from "~/server/domain/panel/ejecutarSorteo";
import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";
import { getConfiguracionTienda } from "~/server/domain/panel/getConfiguracionTienda";
import { getEstadoCredencialFlow } from "~/server/domain/panel/getEstadoCredencialFlow";
import { getResumenTienda } from "~/server/domain/panel/getResumenTienda";
import { getSorteoDelPanel } from "~/server/domain/panel/getSorteoDelPanel";
import { guardarConfiguracionTienda } from "~/server/domain/panel/guardarConfiguracionTienda";
import { guardarCredencialFlow } from "~/server/domain/panel/guardarCredencialFlow";
import { listarProductosDelPanel } from "~/server/domain/panel/listarProductosDelPanel";
import { listarVentas } from "~/server/domain/panel/listarVentas";
import {
  actualizarProductoInput,
  crearProductoInput,
  ejecutarSorteoInput,
  guardarConfiguracionTiendaInput,
  guardarCredencialFlowInput,
  listarVentasInput,
} from "~/server/domain/panel/schemas";
import { claveDeCifradoDeEnv } from "~/server/pago/flowDeTenant";

/**
 * Router del panel de Organizadores (F05, ADR-0005) — borde de administración. Todos sus
 * procedures usan `panelProcedure`: exige sesión y carga `ctx.acceso` (userId + esOperador
 * + membresías, server-side). Cada use case resuelve sobre qué Tienda opera con
 * `resolverTenantAutorizado` — el `tenantId` scopeado JAMÁS sale del input (I1/ADR-0005).
 *
 * Procedures finos: validan input Zod y delegan a `domain/panel/` vía `runDomain`.
 */
export const panelRouter = createTRPCRouter({
  // El layout consulta esto para decidir qué renderizar (Tiendas del usuario + rol).
  getAccesoActual: panelProcedure.query(({ ctx }) =>
    runDomain(() => getAccesoActual({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // ── Productos (F02) ──────────────────────────────────────────────────────
  listarProductos: panelProcedure.query(({ ctx }) =>
    runDomain(() =>
      listarProductosDelPanel({ db: ctx.db, acceso: ctx.acceso }),
    ),
  ),

  crearProducto: panelProcedure
    .input(crearProductoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() => crearProducto({ db: ctx.db, acceso: ctx.acceso, input })),
    ),

  actualizarProducto: panelProcedure
    .input(actualizarProductoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        actualizarProducto({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  // ── Ventas + dashboard (F03) ─────────────────────────────────────────────
  listarVentas: panelProcedure
    .input(listarVentasInput)
    .query(({ ctx, input }) =>
      runDomain(() => listarVentas({ db: ctx.db, acceso: ctx.acceso, input })),
    ),

  getResumenTienda: panelProcedure.query(({ ctx }) =>
    runDomain(() => getResumenTienda({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // ── Configuración: CredencialFlow + plantilla + bases (F04) ───────────────
  getEstadoCredencialFlow: panelProcedure.query(({ ctx }) =>
    runDomain(() =>
      getEstadoCredencialFlow({ db: ctx.db, acceso: ctx.acceso }),
    ),
  ),

  guardarCredencialFlow: panelProcedure
    .input(guardarCredencialFlowInput)
    .mutation(({ ctx, input }) =>
      // `claveDeCifradoDeEnv()` se evalúa dentro de runDomain (fail-fast 500 sin filtrar
      // la clave si falta CREDENTIALS_ENCRYPTION_KEY); el use case recibe la clave inyectada.
      runDomain(() =>
        guardarCredencialFlow({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          clave: claveDeCifradoDeEnv(),
        }),
      ),
    ),

  getConfiguracionTienda: panelProcedure.query(({ ctx }) =>
    runDomain(() =>
      getConfiguracionTienda({ db: ctx.db, acceso: ctx.acceso }),
    ),
  ),

  guardarConfiguracionTienda: panelProcedure
    .input(guardarConfiguracionTiendaInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        guardarConfiguracionTienda({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  // ── Sorteo (F05 interna; modelos Raffle/RaffleEntry de F02 del roadmap) ───
  getSorteo: panelProcedure.query(({ ctx }) =>
    runDomain(() => getSorteoDelPanel({ db: ctx.db, acceso: ctx.acceso })),
  ),

  ejecutarSorteo: panelProcedure
    .input(ejecutarSorteoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        ejecutarSorteo({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),
});
