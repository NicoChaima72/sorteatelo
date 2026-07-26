import { runDomain } from "~/server/api/runDomain";
import { createTRPCRouter, panelProcedure } from "~/server/api/trpc";
import { baseUrlApp, crearCorreoDeEnv } from "~/server/correo/correoDeEnv";
import { borrarCampoCheckout } from "~/server/domain/camposCheckout/borrarCampoCheckout";
import { cambiarActivoCampoCheckout } from "~/server/domain/camposCheckout/cambiarActivoCampoCheckout";
import { crearCampoCheckout } from "~/server/domain/camposCheckout/crearCampoCheckout";
import { editarCampoCheckout } from "~/server/domain/camposCheckout/editarCampoCheckout";
import { listarCamposCheckout } from "~/server/domain/camposCheckout/listarCamposCheckout";
import { reordenarCamposCheckout } from "~/server/domain/camposCheckout/reordenarCamposCheckout";
import {
  borrarCampoCheckoutInput,
  cambiarActivoCampoCheckoutInput,
  crearCampoCheckoutInput,
  editarCampoCheckoutInput,
  reordenarCamposCheckoutInput,
} from "~/server/domain/camposCheckout/schemas";
import { reenviarCorreoDescargaDeOrden } from "~/server/domain/correo/reenviarCorreoDescargaDeOrden";
import { actualizarProducto } from "~/server/domain/panel/actualizarProducto";
import { confirmarBasesSubidas } from "~/server/domain/panel/confirmarBasesSubidas";
import { confirmarImagenSubida } from "~/server/domain/panel/confirmarImagenSubida";
import { confirmarPdfProducto } from "~/server/domain/panel/confirmarPdfProducto";
import { crearProducto } from "~/server/domain/panel/crearProducto";
import { crearSorteo } from "~/server/domain/panel/crearSorteo";
import { crearUrlSubidaBases } from "~/server/domain/panel/crearUrlSubidaBases";
import { crearUrlSubidaImagen } from "~/server/domain/panel/crearUrlSubidaImagen";
import { crearUrlSubidaPdf } from "~/server/domain/panel/crearUrlSubidaPdf";
import { editarSorteo } from "~/server/domain/panel/editarSorteo";
import { ejecutarSorteo } from "~/server/domain/panel/ejecutarSorteo";
import { exportarVentasCsv } from "~/server/domain/panel/exportarVentasCsv";
import { getAccesoActual } from "~/server/domain/panel/getAccesoActual";
import { getConfiguracionTienda } from "~/server/domain/panel/getConfiguracionTienda";
import { getEstadoCredencialFlow } from "~/server/domain/panel/getEstadoCredencialFlow";
import { getResumenTienda } from "~/server/domain/panel/getResumenTienda";
import { getSerieVentasDiaria } from "~/server/domain/panel/getSerieVentasDiaria";
import { getSorteoDelPanel } from "~/server/domain/panel/getSorteoDelPanel";
import { guardarConfiguracionTienda } from "~/server/domain/panel/guardarConfiguracionTienda";
import { guardarCredencialFlow } from "~/server/domain/panel/guardarCredencialFlow";
import { listarProductosDelPanel } from "~/server/domain/panel/listarProductosDelPanel";
import { listarSorteosDelTenant } from "~/server/domain/panel/listarSorteosDelTenant";
import { listarVentas } from "~/server/domain/panel/listarVentas";
import { aceptarTos } from "~/server/domain/tenants/aceptarTos";
import { crearTienda } from "~/server/domain/tenants/crearTienda";
import { despublicarTienda } from "~/server/domain/tenants/despublicarTienda";
import { getEstadoPublicacion } from "~/server/domain/tenants/getEstadoPublicacion";
import { publicarTienda } from "~/server/domain/tenants/publicarTienda";
import { crearTiendaInput } from "~/server/domain/tenants/schemas";
import { TOS_TEXTO, TOS_VERSION } from "~/server/tos/tos";
import {
  actualizarProductoInput,
  confirmarBasesSubidasInput,
  confirmarImagenSubidaInput,
  confirmarPdfProductoInput,
  crearProductoInput,
  crearSorteoInput,
  crearUrlSubidaBasesInput,
  crearUrlSubidaImagenInput,
  crearUrlSubidaPdfInput,
  editarSorteoInput,
  ejecutarSorteoInput,
  guardarConfiguracionTiendaInput,
  guardarCredencialFlowInput,
  listarVentasInput,
  reenviarCorreoDescargaInput,
} from "~/server/domain/panel/schemas";
import { claveDeCifradoDeEnv } from "~/server/pago/flowDeTenant";
import { crearStorageDeEnv } from "~/server/storage/storageDeEnv";
import { crearStoragePublicoDeEnv } from "~/server/storage/storagePublicoDeEnv";

/**
 * Router del panel de Organizadores (F05, ADR-0005) — borde de administración. Todos sus
 * procedures usan `panelProcedure`: exige sesión y carga `ctx.acceso` (userId + esOperador
 * + membresías en orden canónico + `tenantIdDelHost`, server-side). Cada use case resuelve
 * sobre qué Tienda opera con `resolverTenantDelPanel` (la Tienda del subdominio, gateada por
 * membresía — ADR-0022) — el `tenantId` scopeado JAMÁS sale del input (I1/ADR-0005).
 *
 * Procedures finos: validan input Zod y delegan a `domain/panel/` vía `runDomain`.
 */
export const panelRouter = createTRPCRouter({
  // El layout consulta esto para decidir qué renderizar (Tiendas del usuario + rol).
  getAccesoActual: panelProcedure.query(({ ctx }) =>
    runDomain(() => getAccesoActual({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // ── Alta self-service de Tienda (F08/F01) ────────────────────────────────
  // Un usuario logueado SIN Tienda crea la suya (slug + nombre). El `userId` de la
  // membresía sale del acceso server-side, jamás del input (I1). Crea Tenant (CONFIGURACION)
  // + TenantMembership en una $transaction (D1/D8).
  crearTienda: panelProcedure
    .input(crearTiendaInput)
    .mutation(({ ctx, input }) =>
      runDomain(() => crearTienda({ db: ctx.db, acceso: ctx.acceso, input })),
    ),

  // ── Términos de Servicio (F08/F02, ADR-0008) ─────────────────────────────
  // El TEXTO vive versionado en el repo (D3): la UI lo renderiza antes de aceptar. `aceptarTos`
  // graba la aceptación (quién/cuándo/versión) sobre la Tienda del acceso (I1) — es requisito del
  // gate de publicación.
  getTos: panelProcedure.query(() => ({
    version: TOS_VERSION,
    texto: TOS_TEXTO,
  })),

  aceptarTos: panelProcedure.mutation(({ ctx }) =>
    runDomain(() => aceptarTos({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // ── Publicación: checklist + publicar/despublicar (F08/F03, ADR-0008) ─────
  // `getEstadoPublicacion` es la única fuente de verdad del checklist Y del gate; `publicarTienda`
  // RECOMPUTA el gate server-side (I2). Transiciones scopeadas por membresía (I1).
  getEstadoPublicacion: panelProcedure.query(({ ctx }) =>
    runDomain(() => getEstadoPublicacion({ db: ctx.db, acceso: ctx.acceso })),
  ),

  publicarTienda: panelProcedure.mutation(({ ctx }) =>
    runDomain(() => publicarTienda({ db: ctx.db, acceso: ctx.acceso })),
  ),

  despublicarTienda: panelProcedure.mutation(({ ctx }) =>
    runDomain(() => despublicarTienda({ db: ctx.db, acceso: ctx.acceso })),
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

  // ── Subida del PDF a R2 (F03/D4): presigned PUT + confirmación server-side ──
  // El storage se cabla desde env en el borde (crearStorageDeEnv, I7); el use case lo
  // recibe inyectado. El cliente NUNCA elige la key (la computa el server, I6).
  crearUrlSubidaPdf: panelProcedure
    .input(crearUrlSubidaPdfInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        crearUrlSubidaPdf({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          storage: crearStorageDeEnv(),
        }),
      ),
    ),

  confirmarPdfProducto: panelProcedure
    .input(confirmarPdfProductoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        confirmarPdfProducto({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          storage: crearStorageDeEnv(),
        }),
      ),
    ),

  // ── Subida de assets de marca al bucket PÚBLICO (plantilla-rica F03/ADR-0013) ──
  // Mismo patrón presigned PUT + confirmación server-side que el PDF, pero contra el
  // bucket PÚBLICO (crearStoragePublicoDeEnv, I7) y por destino (logo/hero/portada/premio).
  // El cliente NUNCA elige la key (la computa el server per-destino, I6).
  crearUrlSubidaImagen: panelProcedure
    .input(crearUrlSubidaImagenInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        crearUrlSubidaImagen({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),

  confirmarImagenSubida: panelProcedure
    .input(confirmarImagenSubidaInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        confirmarImagenSubida({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),

  // ── Subida del PDF de BASES del sorteo al bucket PÚBLICO (admin-bases-pdf F01/D1, ADR-0008) ──
  // MISMO patrón presigned PUT + confirmación server-side que las imágenes, contra el MISMO bucket
  // público, pero firmando `application/pdf` — la ÚNICA excepción de esa allowlist (I1: ahí jamás va
  // un PDF de PRODUCTO, que sigue en el bucket privado gated por Entitlement). El cliente NUNCA elige
  // la key (la computa el server con `keyBasesSorteo`, I6) y el Raffle se valida contra el tenant del
  // acceso (I1/I2). La confirmación persiste `Raffle.basesPdfUrl`, que alimenta el gate de F03.
  crearUrlSubidaBases: panelProcedure
    .input(crearUrlSubidaBasesInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        crearUrlSubidaBases({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),

  confirmarBasesSubidas: panelProcedure
    .input(confirmarBasesSubidasInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        confirmarBasesSubidas({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),

  // ── Ventas + dashboard (F03) ─────────────────────────────────────────────
  listarVentas: panelProcedure
    .input(listarVentasInput)
    .query(({ ctx, input }) =>
      runDomain(() => listarVentas({ db: ctx.db, acceso: ctx.acceso, input })),
    ),

  // Export CSV de TODAS las ventas de la Tienda (F07 de checkout-campos-configurables, D9). Sin
  // input: no hay nada que el cliente pueda elegir — el tenant sale de `acceso` (I1) y el archivo
  // exporta el listado completo, no la página que se está viendo.
  exportarVentasCsv: panelProcedure.query(({ ctx }) =>
    runDomain(() => exportarVentasCsv({ db: ctx.db, acceso: ctx.acceso })),
  ),

  getResumenTienda: panelProcedure.query(({ ctx }) =>
    runDomain(() => getResumenTienda({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // Serie diaria de ventas (14 días) para el gráfico del dashboard (F03).
  getSerieVentasDiaria: panelProcedure.query(({ ctx }) =>
    runDomain(() => getSerieVentasDiaria({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // ── Reenvío del correo de descarga de una orden PAGADA (F04/D9) ────────────
  // El correo y el baseUrl se cablan desde env en el borde (crearCorreoDeEnv/baseUrlApp, I6);
  // el use case los recibe inyectados. Regenera los grants expirados antes de reenviar.
  reenviarCorreoDescarga: panelProcedure
    .input(reenviarCorreoDescargaInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        reenviarCorreoDescargaDeOrden({
          db: ctx.db,
          acceso: ctx.acceso,
          input,
          correo: crearCorreoDeEnv(),
          baseUrl: baseUrlApp(),
        }),
      ),
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

  // Historial + fuente del modal de arrastre + valores iniciales del form de edición (F01/D12).
  listarSorteos: panelProcedure.query(({ ctx }) =>
    runDomain(() =>
      listarSorteosDelTenant({ db: ctx.db, acceso: ctx.acceso }),
    ),
  ),

  // Crear un sorteo ACTIVO (F01): SECUENCIAL (1-ACTIVO por Tienda, guard atómico en $tx) + arrastre
  // opcional de participantes de un sorteo pasado del mismo tenant.
  crearSorteo: panelProcedure
    .input(crearSorteoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() => crearSorteo({ db: ctx.db, acceso: ctx.acceso, input })),
    ),

  // Editar el sorteo ACTIVO y NO ejecutado (F02).
  editarSorteo: panelProcedure
    .input(editarSorteoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() => editarSorteo({ db: ctx.db, acceso: ctx.acceso, input })),
    ),

  ejecutarSorteo: panelProcedure
    .input(ejecutarSorteoInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        ejecutarSorteo({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  // ── Campos del checkout (checkout-campos-configurables F02, D5/D6/D7) ────
  // Los datos ADICIONALES que cada Tienda le pide al Comprador. El módulo de dominio es propio
  // (`domain/camposCheckout/`) pero sus procedures viven acá, en el borde del panel — mismo criterio
  // que `domain/tenants/` (crearTienda/aceptarTos/publicarTienda): el módulo agrupa la lógica, el
  // router agrupa la SUPERFICIE, y esta es la del Organizador administrando su Tienda.
  // El correo NO se administra acá: es el dato fijo del checkout (ADR-0004/I2).
  listarCamposCheckout: panelProcedure.query(({ ctx }) =>
    runDomain(() => listarCamposCheckout({ db: ctx.db, acceso: ctx.acceso })),
  ),

  // La `clave` NO viaja en el input: se deriva de la etiqueta server-side y queda inmutable (D7).
  crearCampoCheckout: panelProcedure
    .input(crearCampoCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        crearCampoCheckout({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  // Solo cosméticos: `clave` y `tipo` son inmutables tras crear (D5) y no están en el input.
  editarCampoCheckout: panelProcedure
    .input(editarCampoCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        editarCampoCheckout({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  cambiarActivoCampoCheckout: panelProcedure
    .input(cambiarActivoCampoCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        cambiarActivoCampoCheckout({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  // Hard delete (D5): las respuestas ya guardadas sobreviven autocontenidas (`fieldId` SetNull).
  borrarCampoCheckout: panelProcedure
    .input(borrarCampoCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        borrarCampoCheckout({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),

  reordenarCamposCheckout: panelProcedure
    .input(reordenarCamposCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(() =>
        reordenarCamposCheckout({ db: ctx.db, acceso: ctx.acceso, input }),
      ),
    ),
});
