/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { type CreateNextContextOptions } from "@trpc/server/adapters/next";
import { type Session } from "next-auth";
import superjson from "superjson";
import { ZodError } from "zod";

import { env } from "~/env";
import { getServerAuthSession } from "~/server/auth";
import {
  type AccesoPanel,
  esOperador,
  parsearAllowlist,
} from "~/server/authPolicy";
import { db } from "~/server/db";
import { origenDeRequest } from "~/server/pago/urlRetorno";
import { cargarMembresiasCanonicas } from "~/server/panel/membresias";
import { configPlataformaDesdeEnv } from "~/server/tenancy/configPlataforma";
import {
  crearRepoTenants,
  repoTenantsMemoizado,
} from "~/server/tenancy/repoTenants";
import {
  resolverTenantDesdeHost,
  type TenantDeContexto,
} from "~/server/tenancy/resolverTenant";
import { resolverTenantAdminDesdeHost } from "~/server/tenancy/resolverTenantAdmin";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 */

interface CreateContextOptions {
  session: Session | null;
  /**
   * La Tienda del storefront, resuelta SERVER-SIDE desde el host del request
   * (ADR-0007). `null` = zona plataforma o host que no resuelve una Tienda
   * publicada. NUNCA se completa desde el input de un procedure: ese fue el bug
   * H1 de datawalt-app (IDOR cross-tenant). Ver `src/server/tenancy/`.
   */
  tenant: TenantDeContexto | null;
  /**
   * La Tienda que administra el HOST del request, resuelta SERVER-SIDE del subdominio SIN exigir
   * que esté publicada (ADR-0022). Es la gemela de `tenant` para el borde del PANEL: una Tienda en
   * CONFIGURACION no tiene storefront pero sí panel. `null` en el apex o en un host que no resuelve.
   *
   * Igual que `tenant`, JAMÁS se completa desde el input de un procedure (I1).
   */
  tenantDelHost: TenantDeContexto | null;
  /**
   * Origen (`<proto>://<host>`) del request, o `null`. Lo usa SOLO el checkout para armar la
   * URL de retorno de Flow del subdominio (D6) — NUNCA para scopear queries (eso es `tenant`).
   */
  origin: string | null;
}

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 * - tRPC's `createSSGHelpers`, where we don't have req/res
 *
 * @see https://create.t3.gg/en/usage/trpc#-serverapitrpcts
 */
const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    db,
    tenant: opts.tenant,
    tenantDelHost: opts.tenantDelHost,
    origin: opts.origin,
  };
};

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;

  // Sesión del servidor (cookie NextAuth real). En dev con el override de subdominio (F09d) el
  // storefront y el panel viven en UN solo host (`localhost`), así que la cookie host-only del login
  // real de Google alcanza sin trucos — no hace falta simular sesión.
  const session = await getServerAuthSession({ req, res });

  // NO hay service Flow global en el contexto: con BYO-Flow (ADR-0006) cada
  // operación de pago instancia el Flow del tenant dueño vía
  // `crearFlowServiceDeTenant` (checkout) o el enrutador del webhook. Un
  // `ctx.flow` global invitaría a un procedure futuro a cobrar con credenciales
  // que no son del tenant — violación silenciosa de BYO-Flow.

  // Tenant resuelto SERVER-SIDE desde el host, ANTES de que corra procedure
  // alguno (I1 / ADR-0007). Se re-parsea el host en vez de leer el header que
  // pone el middleware: así la resolución no depende de que el `matcher` del
  // middleware cubra este path (defensa en profundidad). En la zona plataforma
  // no consulta la DB.
  //
  // El MISMO host se resuelve con las DOS políticas: la del storefront (exige PUBLICADA, respuesta
  // neutral) y la del PANEL (ADR-0022: una Tienda en CONFIGURACION o SUSPENDIDA se sigue
  // administrando). El repo va memoizado ⇒ una sola query a la DB, dos lecturas de la política.
  const config = configPlataformaDesdeEnv();
  const repo = repoTenantsMemoizado(crearRepoTenants(db));

  const resolucion = await resolverTenantDesdeHost({
    host: req.headers.host,
    config,
    repo,
  });
  const resolucionAdmin = await resolverTenantAdminDesdeHost({
    host: req.headers.host,
    config,
    repo,
  });

  return createInnerTRPCContext({
    session,
    tenant: resolucion.zona === "storefront" ? resolucion.tenant : null,
    tenantDelHost:
      resolucionAdmin.zona === "tienda" ? resolucionAdmin.tenant : null,
    // Origen del request para la URL de retorno de Flow (D6). Server-side, solo lo usa el checkout.
    origin: origenDeRequest({
      host: req.headers.host,
      forwardedProto: req.headers["x-forwarded-proto"],
    }),
  });
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session || !ctx.session.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Storefront (tenant) procedure
 *
 * Para el borde de cara al Comprador, que vive SIEMPRE en el subdominio de una
 * Tienda publicada (catálogo, carrito, inicio de checkout). Garantiza
 * `ctx.tenant` no-null, resuelto del host server-side: un use case que lo reciba
 * de acá tiene el `tenantId` con el que scopear TODA query (I1 / ADR-0005), sin
 * que ningún `tenantId` del input pueda intervenir.
 *
 * No lleva sesión: el Comprador no tiene cuenta (ADR-0004).
 *
 * `NOT_FOUND` (y no `FORBIDDEN`) cuando no hay tenant: es la respuesta neutral
 * de ADR-0007 — no delata si la Tienda no existe o existe suspendida.
 */
export const tenantProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.tenant) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return next({
      ctx: {
        // infiere `tenant` como no-nullable
        tenant: ctx.tenant,
      },
    });
  });

/**
 * Panel (Organizador / Operador) procedure — el borde del panel de administración
 * (ADR-0005, F05). Exige sesión NextAuth (Google OAuth) y carga SERVER-SIDE el
 * `acceso`: quién es, si es Operador de plataforma (env `PLATFORM_OPERATOR_EMAILS`,
 * D4), y las Tiendas de las que es miembro (`TenantMembership`). Los use cases del
 * panel resuelven sobre qué Tienda operan con `resolverTenantDelPanel(ctx.acceso)`
 * — el `tenantId` con el que scopean TODA query sale del cruce entre el HOST
 * (server-authored) y la MEMBRESÍA, JAMÁS del input (I1; lección H1 de datawalt-app).
 * El flag `esOperador` NO autoriza acá (D11/ADR-0022): solo habilita el panel propio
 * del Operador (`operadorProcedure`), que es otra superficie.
 *
 * NO gatea por membresía: un usuario logueado SIN membresía y sin rol Operador pasa el
 * procedure pero cualquier use case tira `FORBIDDEN` (fail-closed en la capa de datos,
 * D2/I2) y la UI muestra el empty state "sin tienda". Así `getAccesoActual` puede
 * decidir qué renderizar sin tirar el request.
 */
export const panelProcedure = t.procedure
  .use(timingMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    // Membresías en el ORDEN CANÓNICO (D5/I5, ADR-0022): mismo origen ordenado que usa el guard
    // de las páginas admin para elegir la PRIMERA tienda. Antes era un `findMany` sin `orderBy`
    // (orden crudo) mientras el chip del header ordenaba por `nombre asc` — dos órdenes paralelos.
    const membresias = await cargarMembresiasCanonicas({
      db: ctx.db,
      userId: ctx.session.user.id,
    });
    const acceso: AccesoPanel = {
      userId: ctx.session.user.id,
      email: ctx.session.user.email ?? null,
      esOperador: esOperador(
        ctx.session.user.email,
        parsearAllowlist(env.PLATFORM_OPERATOR_EMAILS),
      ),
      tenantIds: membresias.map((m) => m.tenantId),
      // La Tienda del SUBDOMINIO (ADR-0022): es la selección de tenant del panel, y es
      // server-authored (host + middleware), no input del cliente ⇒ no viola I1. Los use cases
      // la consumen vía `resolverTenantDelPanel`; sin ella (apex) fallan fail-closed.
      tenantIdDelHost: ctx.tenantDelHost?.id ?? null,
    };
    return next({
      ctx: {
        // infiere `session.user` como no-nullable + expone el acceso resuelto
        session: { ...ctx.session, user: ctx.session.user },
        acceso,
      },
    });
  });
