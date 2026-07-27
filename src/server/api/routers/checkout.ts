import { runDomain } from "~/server/api/runDomain";
import { createTRPCRouter, tenantProcedure } from "~/server/api/trpc";
import { getEstadoOrden } from "~/server/domain/checkout/getEstadoOrden";
import { getSorteoActivoStorefront } from "~/server/domain/checkout/getSorteoActivoStorefront";
import { getSorteoResumenStorefront } from "~/server/domain/checkout/getSorteoResumenStorefront";
import { iniciarCheckout } from "~/server/domain/checkout/iniciarCheckout";
import { listarProductos } from "~/server/domain/checkout/listarProductos";
import { resolverCatalogo } from "~/server/domain/checkout/resolverCatalogo";
import {
  getEstadoOrdenInput,
  getSorteoResumenStorefrontInput,
  iniciarCheckoutInput,
  listarProductosDeCatalogoInput,
} from "~/server/domain/checkout/schemas";
import { env } from "~/env";
import { crearFlowServiceDeTenant } from "~/server/pago/flowDeTenant";
import { construirUrlRetorno } from "~/server/pago/urlRetorno";

/**
 * Router de checkout — borde de cara al Comprador, que vive SIEMPRE en el subdominio de
 * una Tienda publicada (ADR-0007). Usa `tenantProcedure` (no `publicProcedure`): garantiza
 * `ctx.tenant` no-null, resuelto server-side desde el host — el `tenantId` con el que se
 * scopea TODA query jamás sale del input (I1 / ADR-0005; lección del bug H1 de datawalt-app).
 * Sin sesión: el Comprador no tiene cuenta (ADR-0004).
 *
 * El service Flow se instancia con las credenciales de ESTA Tienda (BYO-Flow, ADR-0006):
 * el checkout cobra en la cuenta Flow del Organizador dueño, nunca una global.
 */
export const checkoutRouter = createTRPCRouter({
  listarProductos: tenantProcedure.query(({ ctx }) =>
    runDomain(() => listarProductos({ db: ctx.db, tenantId: ctx.tenant.id })),
  ),

  // Resolver de catálogo del page builder (F05): una sección `catalogo` del documento pasa su
  // `modo`+`productoIds`; el `tenantId` sale del contexto (I1), nunca del input. Referencias ajenas/
  // inactivas se descartan en silencio (D6). `modo:'todos'` es equivalente a `listarProductos`.
  listarProductosDeCatalogo: tenantProcedure
    .input(listarProductosDeCatalogoInput)
    .query(({ ctx, input }) =>
      runDomain(() =>
        resolverCatalogo({
          db: ctx.db,
          tenantId: ctx.tenant.id,
          modo: input.modo,
          productoIds: input.productoIds,
        }),
      ),
    ),

  /*
    `getProductoStorefront` existió hasta la ENMIENDA v2 (E2/F13) y murió con la página que
    alimentaba: `/producto/[id]` es hoy un redirect al home. Era la ÚLTIMA lectora de
    `ProductPackOption` en el storefront —proyectaba el menú de packs del detalle—, así que su
    muerte es también la que deja la tabla sin un solo lector de aplicación (V-I3).
  */
  getSorteoActivoStorefront: tenantProcedure.query(({ ctx }) =>
    runDomain(() =>
      getSorteoActivoStorefront({ db: ctx.db, tenantId: ctx.tenant.id }),
    ),
  ),

  // Resultado de los Raffle CERRADOS de la Tienda (catálogo-v2 F06): ganador ENMASCARADO + agregados,
  // JAMÁS el correo completo ni PII (ADR-0004). Tenant-scoped por el contexto (I1). Alimenta el widget
  // `ganadores` en modo `automatico`. `max` acota cuántos cerrados devolver (cota dura en el use case).
  getSorteoResumenStorefront: tenantProcedure
    .input(getSorteoResumenStorefrontInput)
    .query(({ ctx, input }) =>
      runDomain(() =>
        getSorteoResumenStorefront({ db: ctx.db, tenantId: ctx.tenant.id, max: input?.max }),
      ),
    ),

  // Estado de una orden por su token de Flow (builder-tanda-1 F08/D12) + sus Números del sorteo cuando
  // ya está PAGADA (F01/D1 de checkout-retorno-numeros-sorteo). Sin PII: ni correo, ni montos, ni ítems
  // (I-T6); los números son la identidad PÚBLICA del ticket (ADR-0024). La usa `checkout/retorno` para
  // pasar a celebración y dibujar los boletos cuando el webhook confirma PAGADO — esta query NO confirma
  // nada (I6/ADR-0001), solo LEE. Tenant-scoped por el contexto (I1).
  estadoOrden: tenantProcedure
    .input(getEstadoOrdenInput)
    .query(({ ctx, input }) =>
      runDomain(() =>
        getEstadoOrden({ db: ctx.db, tenantId: ctx.tenant.id, token: input.token }),
      ),
    ),

  iniciarCheckout: tenantProcedure
    .input(iniciarCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () => {
        // URL de retorno derivada del subdominio del request (D6): el comprador vuelve al
        // storefront con marca, no al apex ni a la env global. Fallback a `FLOW_URL_RETURN`.
        const flow = await crearFlowServiceDeTenant({
          db: ctx.db,
          tenantId: ctx.tenant.id,
          urlReturn: construirUrlRetorno(ctx.origin, env.FLOW_URL_RETURN),
        });
        return iniciarCheckout({
          db: ctx.db,
          flow,
          tenantId: ctx.tenant.id,
          // Registro verificable del consentimiento (F05/D5): la IP sale del CONTEXTO, derivada de
          // las cabeceras en el borde — nunca del input, que es del navegador del Comprador.
          ip: ctx.ip,
          input,
        });
      }),
    ),
});
