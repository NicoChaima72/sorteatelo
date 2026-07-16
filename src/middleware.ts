import { NextResponse, type NextRequest } from "next/server";

import { configPlataformaDesdeEnv } from "~/server/tenancy/configPlataforma";
import { aplicarHeaderDeTenant } from "~/server/tenancy/headerTenant";
import { parsearHost } from "~/server/tenancy/parsearHost";

/**
 * Middleware de tenancy por subdominio (ADR-0007, F01 paso 3).
 *
 * ⚠️ UBICACIÓN: va en `src/middleware.ts`, NO en la raíz del repo. Este proyecto
 * tiene `src/pages`, y Next 14 solo detecta el middleware en el directorio padre
 * de `pagesDir` — o sea `src/` (`next/dist/build/index.js`: `rootDir =
 * path.join(pagesDir || appDir, "..")`). En la raíz el archivo compila, no da
 * error y **nunca corre**: falla en silencio. No lo muevas.
 *
 * Borde de cableado: lee el host, delega la decisión al parser puro
 * (`parsearHost`) y normaliza el header de tenant. Toda la política está en
 * `src/server/tenancy/` y testeada en Vitest; acá no hay reglas propias.
 *
 * Corre en el runtime **edge**, así que NO puede tocar Prisma: la resolución
 * slug → Tienda publicada (que consulta la DB) vive en el runtime Node, en el
 * contexto tRPC / `getServerSideProps` (`resolverTenantDesdeHost`). Este
 * middleware solo hace lo que el edge puede hacer bien:
 *
 * 1. Garantizar que `x-tenant-slug` es SIEMPRE server-authored (mata el spoofing
 *    de tenant por header antes de que alguien construya algo encima).
 * 2. Ser el punto donde F06 colgará el rewrite del storefront al subdominio.
 *
 * Un host que no resuelve NO se rechaza acá: sin DB no se puede distinguir
 * "slug inexistente" de "tienda suspendida", y la respuesta neutral de ADR-0007
 * exige que sean indistinguibles. Esa decisión es del runtime Node.
 */
export function middleware(req: NextRequest) {
  const zona = parsearHost(req.headers.get("host"), configPlataformaDesdeEnv());

  return NextResponse.next({
    request: { headers: aplicarHeaderDeTenant(req.headers, zona) },
  });
}

export const config = {
  /**
   * Todo lo que sirve la app, salvo assets estáticos. Incluye `/api/*` a
   * propósito: el saneo del header debe cubrir también al borde tRPC y a los
   * webhooks; si un path quedara fuera del matcher, entraría con el header tal
   * como lo mandó el cliente.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
