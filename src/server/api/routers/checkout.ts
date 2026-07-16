import { runDomain } from "~/server/api/runDomain";
import { createTRPCRouter, tenantProcedure } from "~/server/api/trpc";
import { iniciarCheckout } from "~/server/domain/checkout/iniciarCheckout";
import { listarProductos } from "~/server/domain/checkout/listarProductos";
import { iniciarCheckoutInput } from "~/server/domain/checkout/schemas";
import { crearFlowServiceDeTenant } from "~/server/pago/flowDeTenant";

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

  iniciarCheckout: tenantProcedure
    .input(iniciarCheckoutInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () => {
        const flow = await crearFlowServiceDeTenant({
          db: ctx.db,
          tenantId: ctx.tenant.id,
        });
        return iniciarCheckout({
          db: ctx.db,
          flow,
          tenantId: ctx.tenant.id,
          input,
        });
      }),
    ),
});
