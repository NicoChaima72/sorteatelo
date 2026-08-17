import { runDomain } from "~/server/api/runDomain";
import { createTRPCRouter, tenantProcedure } from "~/server/api/trpc";
import { cotizarCarrito } from "~/server/domain/checkout/cotizarCarrito";
import { getEstadoOrden } from "~/server/domain/checkout/getEstadoOrden";
import { getSorteoActivoStorefront } from "~/server/domain/checkout/getSorteoActivoStorefront";
import { getSorteoResumenStorefront } from "~/server/domain/checkout/getSorteoResumenStorefront";
import { iniciarCheckout } from "~/server/domain/checkout/iniciarCheckout";
import { listarProductos } from "~/server/domain/checkout/listarProductos";
import { resolverCatalogo } from "~/server/domain/checkout/resolverCatalogo";
import {
  cotizarCarritoInput,
  getEstadoOrdenInput,
  getSorteoResumenStorefrontInput,
  iniciarCheckoutInput,
  listarProductosDeCatalogoInput,
  verificarTicketsInput,
} from "~/server/domain/checkout/schemas";
import { verificarTickets } from "~/server/domain/checkout/verificarTickets";
import { env } from "~/env";
import { crearFlowServiceDeTenant } from "~/server/pago/flowDeTenant";
import { construirUrlRetorno } from "~/server/pago/urlRetorno";
import { crearLimitadorDeIntentos } from "~/server/security/limiteDeIntentos";

/**
 * Cuota del verificador público de tickets (F01/D5): 10 búsquedas por minuto y por `tenant+IP`.
 * Vive a nivel de MÓDULO —una instancia por proceso— porque su estado es la memoria del proceso;
 * en Vercel eso significa «por lambda», y está aceptado a propósito (ver el módulo del limitador).
 * Diez por minuto no molesta a nadie corrigiendo un typo en su correo y sí le arruina el día a un
 * script que quiera barrer direcciones.
 */
const limiteVerificarTickets = crearLimitadorDeIntentos({ limite: 10, ventanaMs: 60_000 });

/**
 * Cuota de `estadoOrden` (F03/D3 de `entrega-postpago-retorno-y-reacceso`): 240 por minuto y por
 * `tenant+IP`. Es la más holgada de las tres superficies, por lejos, y a propósito.
 *
 * El plan proponía 90 como default explícitamente ajustable «con criterio documentado». Se sube a 240
 * por el peor caso realista: el retorno sondea cada 2,5 s (~24 req/min por compra), y detrás de un
 * CGNAT móvil chileno pueden caer MUCHAS compras de la misma tienda en la misma IP durante un
 * lanzamiento. Con 90 el cupo se agota con menos de 4 compradores simultáneos; con 240 hacen falta
 * más de 10.
 *
 * El intercambio no está parejo: del lado del abuso, lo único que hay detrás de esta query es el
 * estado de una orden y sus Números —públicos por diseño (ADR-0024), sin PII (I-T6)—, keyeados por un
 * token de Flow de 40 caracteres que nadie adivina; o sea el techo protege COSTO, no un secreto. Del
 * lado del falso positivo, en cambio, hay alguien que acaba de pagar mirando una pantalla que se
 * quedaría clavada en «estamos confirmando» (I8). Ante esa asimetría, holgado.
 */
const limiteEstadoOrden = crearLimitadorDeIntentos({ limite: 240, ventanaMs: 60_000 });

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
        getEstadoOrden({
          db: ctx.db,
          tenantId: ctx.tenant.id,
          token: input.token,
          // Misma clave que el verificador (`tenant:ip`, y solo-tenant sin IP resoluble): sin el
          // tenant, el lanzamiento de una tienda grande le comería la cuota a las demás de la misma
          // lambda. La clave se arma acá, en el borde, porque la IP es del transporte.
          permitirIntento: () =>
            limiteEstadoOrden.permitirIntento(
              ctx.ip ? `${ctx.tenant.id}:${ctx.ip}` : ctx.tenant.id,
            ),
        }),
      ),
    ),

  /*
    Verificador público de tickets (`storefront-verificador-tickets` F01): el Comprador entra a
    `/verificar`, tipea su correo y ve sus Números del sorteo ACTIVO. Sin cuenta (ADR-0004): el
    correo ES la identidad. Tenant-scoped por el contexto (I1) y sin PII en la respuesta (I2).

    Es una QUERY porque no escribe nada, y el rate limit no lo cambia: contar intentos no es un
    efecto de dominio. La CLAVE de la cuota se arma acá, en el borde, porque la IP es del transporte
    y el use case no la conoce — recibe un gate ya cerrado sobre esta clave.

    La clave lleva el `tenantId` SIEMPRE: sin él, el tráfico de una tienda grande le comería la
    cuota a las demás en la misma lambda. Sin IP resoluble (proxy que no la declara) la clave queda
    solo-tenant: todos esos requests comparten un balde, que es lo conservador — es preferible a
    dejar sin cuota a quien no trae cabecera.
  */
  verificarTickets: tenantProcedure
    .input(verificarTicketsInput)
    .query(({ ctx, input }) =>
      runDomain(() =>
        verificarTickets({
          db: ctx.db,
          tenantId: ctx.tenant.id,
          email: input.email,
          permitirIntento: () =>
            limiteVerificarTickets.permitirIntento(
              ctx.ip ? `${ctx.tenant.id}:${ctx.ip}` : ctx.tenant.id,
            ),
        }),
      ),
    ),

  /*
    Cotización del carrito (F01 de `storefront-carrito-total-y-drawer`): el total que el drawer y el
    resumen del checkout MUESTRAN, calculado en `Decimal` server-side sobre los precios vigentes.

    Es una QUERY y no una mutation porque no escribe nada: no hay Order, no hay Flow, no hay efecto
    (I3). Y no se llama `getX` a pesar de la convención de prefijos porque el principio rector es
    espejar el nombre del use case, y este es un CÓMPUTO sobre lo que el cliente trae —cotizar— y no
    la lectura de una entidad que ya existe.

    El `tenantId` sale del contexto (I1) y el cliente no aporta ni un peso: el input son
    `{productId, cantidad}` y nada más, el MISMO schema que consume `iniciarCheckout`.
  */
  cotizarCarrito: tenantProcedure
    .input(cotizarCarritoInput)
    .query(({ ctx, input }) =>
      runDomain(() =>
        cotizarCarrito({ db: ctx.db, tenantId: ctx.tenant.id, items: input.items }),
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
