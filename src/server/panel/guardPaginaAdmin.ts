import { type GetServerSidePropsContext } from "next";

import { getServerAuthSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  decidirAccesoAdmin,
  origenDeHostAdmin,
  type DecisionAdmin,
} from "~/server/panel/guardAdmin";
import { cargarMembresiasCanonicas } from "~/server/panel/membresias";
import { configPlataformaDesdeEnv } from "~/server/tenancy/configPlataforma";
import { crearRepoTenants } from "~/server/tenancy/repoTenants";
import { resolverTenantAdminDesdeHost } from "~/server/tenancy/resolverTenantAdmin";

/**
 * Guard imperativo de las páginas del panel (admin-multi-tienda F02/F04, ADR-0022) — el borde de
 * CABLEADO: junta los hechos (host → Tienda, sesión, membresías) y delega la política a
 * `decidirAccesoAdmin`, que es pura y testeada. Acá no hay reglas propias.
 *
 * No hay rol de plataforma que participe (D11, 2026-07-25; ADR-0023): el panel de Organizador se
 * administra por membresía y nada más — no existe env var ni flag de rol que este borde pudiera leer.
 *
 * Reemplaza a `requireSession` en las 5 páginas de `src/pages/admin/`: con el panel scopeado por
 * subdominio, "hay sesión" ya no alcanza — hay que saber QUÉ tienda administra este host y si esta
 * persona puede. `requireSession` sobrevive para páginas que solo necesiten sesión.
 *
 * Uso (patrón imperativo de backend-conventions § Guard, no HOC):
 *
 * ```ts
 * export const getServerSideProps: GetServerSideProps = async (ctx) => {
 *   const guard = await guardPaginaAdmin(ctx);
 *   if (!("ok" in guard)) return guard; // redirect | notFound
 *   return { props: {} };
 * };
 * ```
 *
 * El `tenantId` de la rama `ok` queda disponible para la página que lo necesite; el chrome del panel
 * lo vuelve a resolver server-side vía `getAccesoActual` (misma fuente).
 */
export type ResultadoGuardAdmin =
  | { redirect: { destination: string; permanent: false } }
  | { notFound: true }
  | {
      ok: true;
      /**
       * Tienda del HOST, de la que el usuario ES miembro (null en el apex, donde la página es el
       * alta de Tienda).
       */
      tenantId: string | null;
    };

export async function guardPaginaAdmin(
  ctx: GetServerSidePropsContext,
): Promise<ResultadoGuardAdmin> {
  const config = configPlataformaDesdeEnv();

  const resolucion = await resolverTenantAdminDesdeHost({
    host: ctx.req.headers.host,
    config,
    repo: crearRepoTenants(db),
  });

  const session = await getServerAuthSession(ctx);
  const userId = session?.user?.id ?? null;

  // Las membresías solo se cargan si hay sesión (sin ella no hay a quién consultarle nada).
  const membresias = userId
    ? await cargarMembresiasCanonicas({ db, userId })
    : [];

  const decision = decidirAccesoAdmin({
    zona:
      resolucion.zona === "plataforma"
        ? { tipo: "apex" }
        : resolucion.zona === "tienda"
          ? {
              tipo: "tienda",
              tenantId: resolucion.tenant.id,
              slug: resolucion.tenant.slug,
            }
          : { tipo: "sin-tienda" },
    haySesion: session !== null,
    membresias,
    // `resolvedUrl` incluye la query string; para el destino del panel solo interesa la RUTA
    // (D4: el switcher aterriza en el dashboard; D8: el apex preserva la subruta, no el query).
    ruta: rutaDe(ctx.resolvedUrl),
    origen: origenDeHostAdmin({
      host: ctx.req.headers.host,
      forwardedProto: ctx.req.headers["x-forwarded-proto"],
      dominioRaiz: config.dominioRaiz,
    }),
  });

  return traducir(decision);
}

/** `/admin/productos?x=1` ⇒ `/admin/productos`. Fail-closed a `/admin` si viniera algo raro. */
function rutaDe(resolvedUrl: string): string {
  const sinQuery = resolvedUrl.split("?")[0] ?? "";
  return sinQuery.startsWith("/admin") ? sinQuery : "/admin";
}

/** Traduce la decisión pura a la forma que espera `getServerSideProps`. */
function traducir(decision: DecisionAdmin): ResultadoGuardAdmin {
  switch (decision.tipo) {
    case "redirect":
      return { redirect: { destination: decision.destino, permanent: false } };
    case "no-encontrado":
      return { notFound: true };
    case "alta":
      return { ok: true, tenantId: null };
    case "panel":
      return { ok: true, tenantId: decision.tenantId };
  }
}
