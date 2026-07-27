import { type NextApiRequest } from "next";

/**
 * Núcleo TESTEABLE del **puente de retorno del registro de tarjeta** (F03/F10, ADR-0026) — patrón
 * «núcleo + wrapper Next» de backend-conventions § Endpoints pages/api, el mismo del webhook.
 *
 * ── Por qué existe este endpoint y no se manda a Flow directo a la página del panel ──────────────
 * Verificado contra el sandbox real (3ª pasada del `feature-tester`, blocker 2): al terminar el
 * formulario de tarjeta, **Flow devuelve el navegador con un POST cross-site** a la `url_return`,
 * con el token en el cuerpo `application/x-www-form-urlencoded`. Apuntar la `url_return` a la página
 * del panel rompe por dos lados a la vez:
 *
 * 1. La cookie de sesión de NextAuth es `SameSite=Lax`, que **no viaja en un POST cross-site** ⇒
 *    `guardPaginaAdmin` no ve sesión y responde `307 → /login`. Pasa igual en producción; no es una
 *    rareza de localhost.
 * 2. Aunque viajara, la página lee el token de `router.query` — en un POST no hay query.
 *
 * El puente resuelve las dos: recibe el POST **sin exigir sesión** (no puede exigirla: la cookie es
 * justamente lo que no llegó), saca el token del body y responde **303 See Other** a la página del
 * panel con el token en la query. El 303 obliga al navegador a rehacer la request como **GET**
 * (RFC 7231 §6.4.4), y ahí está la clave: ese GET **sigue siendo cross-site** —el iniciador de la
 * navegación es flow.cl— pero `SameSite=Lax` bloquea solo las navegaciones top-level con método
 * INSEGURO. Con un GET la cookie viaja, y la página encuentra el token donde siempre lo buscó. Es el
 * mismo truco con el que el mundo resuelve los `form_post` de OAuth.
 *
 * ── Por qué es seguro que sea público ────────────────────────────────────────────────────────────
 * Este endpoint **no autoriza ni escribe nada**: transporta un string. El token se sigue verificando
 * SERVER-SIDE contra `customer/getRegisterStatus` en la mutation del panel (I3), que además exige que
 * el `customerId` del registro sea el del Pagador de la sesión — un token ajeno filtrado no activa
 * nada. Y el destino del redirect es **fijo** (lo pasa el wrapper, nunca el request), así que no hay
 * superficie de redirección abierta.
 */

/**
 * Las cuatro rutas del retorno, en un solo lugar: los dos **puentes** (lo que se le pasa a Flow como
 * `url_return`) y las dos **páginas del panel** donde aterriza el navegador después del 303.
 *
 * Viven acá y no en `flowPlataformaDeEnv.ts` para que los wrappers de `pages/api/` no arrastren la
 * validación de env por un par de strings: el puente tiene que poder responder aunque la cuenta de
 * Flow no esté configurada.
 *
 * Son páginas separadas —y no un `?modo=` sobre la misma— porque cada retorno es una máquina de
 * fases con UN solo trabajo (frontend-conventions § «Salir de la app a un proveedor externo y
 * volver»): una activa el plan y publica, la otra solo reemplaza el plástico.
 */
export const PATH_API_RETORNO_PLAN = "/api/facturacion/retorno-plan";
export const PATH_API_RETORNO_TARJETA = "/api/facturacion/retorno-tarjeta";
export const PATH_RETORNO_PLAN = "/admin/plan/retorno";
export const PATH_RETORNO_TARJETA = "/admin/plan/retorno-tarjeta";

/** Lo que el wrapper devuelve al navegador: un redirect, o el rechazo del gate de método. */
export interface ResultadoRetorno {
  status: number;
  /** Path RELATIVO del panel. Relativo a propósito: garantiza no salir del subdominio de la Tienda. */
  location?: string;
  body?: unknown;
}

export interface ManejarRetornoDeRegistroArgs {
  req: Pick<NextApiRequest, "method"> & {
    body?: unknown;
    query?: Partial<Record<string, string | string[]>>;
  };
  /** Página del panel que hace el trabajo real. La elige el wrapper; el request no opina. */
  destino: string;
}

export function manejarRetornoDeRegistro({
  req,
  destino,
}: ManejarRetornoDeRegistroArgs): ResultadoRetorno {
  // Flow vuelve con POST; el GET se acepta por si alguna vez cambia (y para poder reintentar a mano).
  if (req.method !== "POST" && req.method !== "GET") {
    return { status: 405, body: { error: "method_not_allowed" } };
  }

  const token = extraerToken(req.body, req.query);
  if (!token) {
    // Sin token igual se aterriza en el panel: la página ya sabe explicar qué pasó, con la marca y
    // un camino de vuelta. Un JSON de error crudo dejaría al Organizador en una pantalla muerta.
    return { status: 303, location: destino };
  }

  return {
    status: 303,
    location: `${destino}?token=${encodeURIComponent(token)}`,
  };
}

/**
 * El token del registro, mirando los dos lugares donde puede venir: el body (POST de Flow, parseado
 * por Next a objeto o crudo si el `Content-Type` no era el esperado) y la query (GET).
 *
 * Del request no se toma NADA más — ni el `url_return` que Flow eco-devuelve ni ningún otro campo.
 */
function extraerToken(
  body: unknown,
  query: Partial<Record<string, string | string[]>> | undefined,
): string | null {
  if (typeof body === "string") {
    const v = new URLSearchParams(body).get("token");
    if (v) return v;
  } else if (body && typeof body === "object") {
    const v = (body as Record<string, unknown>).token;
    if (typeof v === "string" && v.length > 0) return v;
  }

  const enQuery = query?.token;
  if (typeof enQuery === "string" && enQuery.length > 0) return enQuery;

  return null;
}
