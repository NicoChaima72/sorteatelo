import { type NextApiRequest, type NextApiResponse } from "next";

import { HEADER_TENANT_SLUG } from "~/server/tenancy/headerTenant";

/**
 * Endpoint DEV throwaway (F01, paso 9 del integrador — muere con la dev page en F06).
 *
 * Existe para VERIFICAR EMPÍRICAMENTE que `src/middleware.ts` corre (el blocker
 * de [F01-B] era que en la raíz compilaba y nunca corría): ecoa el header
 * `x-tenant-slug` tal como llega al runtime Node.
 *
 * - `curl -H "x-tenant-slug: forjado" localhost:3000/api/dev/echo-tenant`
 *   ⇒ `null` si el middleware corre (el saneo borra el header spoofeado).
 * - `curl autora.localhost:3000/api/dev/echo-tenant` ⇒ `"autora"`.
 *
 * No filtra nada: el valor deriva del host del propio request (lo que está en la
 * barra de direcciones). El contexto tRPC NO usa este header (re-parsea el host);
 * esto solo observa el borde edge, que Vitest no puede cubrir.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    tenantSlugHeader: req.headers[HEADER_TENANT_SLUG] ?? null,
  });
}
