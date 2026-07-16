import { env } from "~/env";
import { type ConfigPlataforma } from "~/server/tenancy/parsearHost";

/**
 * De dónde sale el **dominio raíz de la plataforma** (el que distingue apex de
 * subdominio de tienda).
 *
 * El núcleo (`parsearHost` / `resolverTenantDesdeHost`) lo recibe INYECTADO y no
 * conoce `env`: este módulo es el único punto de cableado.
 */

/**
 * Dominio raíz en dev. NO es una respuesta a la decisión abierta #4 (dominio de
 * la plataforma, que sigue ABIERTA): es el supuesto **S1** del roadmap — dev
 * multi-tenant vía `*.localhost`, que los browsers resuelven sin DNS.
 */
export const DOMINIO_RAIZ_DEV = "localhost";

/**
 * Decisión pura de qué dominio raíz rige. Separada del acceso a `env` para
 * testear el fail-fast sin manosear `process.env`.
 *
 * - Con dominio configurado ⇒ ese, normalizado (tolera protocolo/puerto/barra
 *   pegados: es un valor que se copia y pega a mano en un `.env`).
 * - Sin configurar y fuera de producción ⇒ `localhost` (S1).
 * - Sin configurar EN producción ⇒ **throw**. Adivinar el dominio en prod sería
 *   peor que caerse: sin él, `a.dominio` no se distingue del apex y el
 *   aislamiento por subdominio deja de significar algo (I1). Mismo criterio de
 *   fail-fast que la factory de credenciales (backend-conventions § Fail-fast).
 */
export function resolverConfigPlataforma({
  dominioPlataforma,
  nodeEnv,
}: {
  dominioPlataforma: string | undefined;
  nodeEnv: string | undefined;
}): ConfigPlataforma {
  const configurado = normalizarDominio(dominioPlataforma);
  if (configurado) return { dominioRaiz: configurado };

  if (nodeEnv === "production") {
    throw new Error(
      "Falta NEXT_PUBLIC_PLATFORM_DOMAIN: sin el dominio raíz de la plataforma no " +
        "se puede distinguir el apex de un subdominio de Tienda (ADR-0007).",
    );
  }

  return { dominioRaiz: DOMINIO_RAIZ_DEV };
}

/** `https://plataforma.test:3000/` ⇒ `plataforma.test`. Vacío ⇒ `null`. */
function normalizarDominio(valor: string | undefined): string | null {
  const limpio = valor
    ?.trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  // `?? null` no serviría: hay que mapear también el string vacío a null
  // (`FOO=` en un .env llega como "", no como undefined).
  if (!limpio) return null;
  return limpio;
}

/**
 * Config real de la app, leída del entorno (vía `~/env`, backend-conventions
 * § Env vars; declarada en `src/env.js` + `.env.example`).
 *
 * Es `NEXT_PUBLIC_` (no una var de server): la lee el middleware, que corre en
 * el runtime edge, donde Next inlinea las vars públicas en build. No es un
 * secreto — es literalmente lo que se ve en la barra de direcciones.
 */
export function configPlataformaDesdeEnv(): ConfigPlataforma {
  return resolverConfigPlataforma({
    dominioPlataforma: env.NEXT_PUBLIC_PLATFORM_DOMAIN,
    nodeEnv: env.NODE_ENV,
  });
}
