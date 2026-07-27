import { type NextApiRequest, type NextApiResponse } from "next";
import { describe, expect, it, vi } from "vitest";

import retornoPlan from "~/pages/api/facturacion/retorno-plan";
import retornoTarjeta from "~/pages/api/facturacion/retorno-tarjeta";
import { manejarRetornoDeRegistro } from "~/server/facturacion/retornoDeRegistro";

/**
 * Puente del retorno del registro de tarjeta (F03/F10, blocker 2 de la 3ª pasada del E2E).
 *
 * **El contrato real de Flow**: al terminar el formulario de tarjeta NO devuelve el navegador con un
 * GET, sino con un **POST cross-site** a la `url_return`, con el token en el cuerpo
 * form-urlencoded. Dos cosas se rompen con eso si la `url_return` apunta directo a la página del
 * panel: (a) la cookie de sesión de NextAuth es `SameSite=Lax` y **no viaja en un POST cross-site**,
 * así que el guard del panel bota al login; (b) aunque viajara, la página lee el token de
 * `router.query`, que en un POST no existe.
 *
 * Este endpoint público es el puente: recibe el POST, saca el token del body y responde **303** a la
 * página del panel con el token en la query. El 303 convierte el POST en un GET, y ese GET ya es una
 * navegación top-level hacia nuestro propio sitio ⇒ la cookie `Lax` sí viaja y la página encuentra su
 * token donde siempre lo buscó.
 *
 * No autoriza nada: el token se sigue verificando SERVER-SIDE contra `customer/getRegisterStatus`
 * (I3). Acá solo se transporta.
 */

const DESTINO = "/admin/plan/retorno";

describe("facturacion/retornoDeRegistro — puente del POST de Flow al panel", () => {
  // facturacion.retorno.001 — el caso REAL: POST form-urlencoded crudo
  it("convierte el POST form-urlencoded de Flow en un 303 GET al panel con el token", () => {
    const r = manejarRetornoDeRegistro({
      req: { method: "POST", body: "token=TOK-abc123" },
      destino: DESTINO,
    });

    // 303 y no 302: obliga al navegador a rehacer la request como GET (RFC 7231 §6.4.4). Con un 307
    // conservaría el POST y volveríamos a perder la cookie.
    expect(r.status).toBe(303);
    expect(r.location).toBe("/admin/plan/retorno?token=TOK-abc123");
  });

  // facturacion.retorno.002 — Next parsea el form-urlencoded a objeto según el Content-Type
  it("acepta el mismo token cuando el body ya viene parseado como objeto", () => {
    const r = manejarRetornoDeRegistro({
      req: { method: "POST", body: { token: "TOK-abc123" } },
      destino: DESTINO,
    });

    expect(r.location).toBe("/admin/plan/retorno?token=TOK-abc123");
  });

  // facturacion.retorno.003 — si Flow alguna vez vuelve por GET, el puente sigue sirviendo
  it("acepta también el token en la query de un GET", () => {
    const r = manejarRetornoDeRegistro({
      req: { method: "GET", query: { token: "TOK-abc123" } },
      destino: DESTINO,
    });

    expect(r.status).toBe(303);
    expect(r.location).toBe("/admin/plan/retorno?token=TOK-abc123");
  });

  // facturacion.retorno.004 — sin token igual se aterriza en el panel, no en un 500
  it("sin token redirige a la página del panel igual, para que explique el problema con la marca", () => {
    const r = manejarRetornoDeRegistro({
      req: { method: "POST", body: {} },
      destino: DESTINO,
    });

    // La página ya sabe decir «Flow no devolvió el registro de tu tarjeta»: dejarla hablar es mejor
    // que un JSON de error crudo en la cara del Organizador.
    expect(r.status).toBe(303);
    expect(r.location).toBe("/admin/plan/retorno");
  });

  // facturacion.retorno.005 — el destino es FIJO: el request no elige a dónde se va (no open-redirect)
  it("ignora cualquier destino propuesto por el request y escapa el token", () => {
    const r = manejarRetornoDeRegistro({
      req: {
        method: "POST",
        body: { token: "a b&c=d", url_return: "https://evil.example/phish" },
        query: { destino: "https://evil.example/phish" },
      },
      destino: DESTINO,
    });

    // Path fijo (el que le pasó el wrapper) + token escapado: ni redirección abierta ni parámetros
    // inyectados en la query del panel.
    expect(r.location).toBe("/admin/plan/retorno?token=a%20b%26c%3Dd");
  });

  // facturacion.retorno.006 — gate de método
  it("rechaza cualquier método que no sea el retorno de Flow", () => {
    const r = manejarRetornoDeRegistro({
      req: { method: "DELETE", body: { token: "TOK" } },
      destino: DESTINO,
    });

    expect(r.status).toBe(405);
    expect(r.location).toBeUndefined();
  });
});

/**
 * Los dos wrappers son 8 líneas cada uno y su ÚNICA decisión es a qué página del panel aterrizan.
 * Es justo el tipo de línea que se copia y se olvida de cambiar: un `retorno-tarjeta` que mandara a
 * la página de activación intentaría crear una suscripción nueva sobre un plan que ya existe.
 */
describe("pages/api/facturacion — cada puente aterriza en SU página del panel", () => {
  function fakeRes() {
    const redirect = vi.fn();
    return {
      res: { redirect, status: vi.fn(), json: vi.fn() } as unknown as NextApiResponse,
      redirect,
    };
  }

  const req = {
    method: "POST",
    body: "token=TOK-abc123",
    query: {},
  } as unknown as NextApiRequest;

  // facturacion.retorno.007 — el puente de la ACTIVACIÓN va a la página que activa y publica
  it("retorno-plan manda a /admin/plan/retorno", () => {
    const { res, redirect } = fakeRes();
    retornoPlan(req, res);
    expect(redirect).toHaveBeenCalledWith(
      303,
      "/admin/plan/retorno?token=TOK-abc123",
    );
  });

  // facturacion.retorno.008 — el puente del CAMBIO de tarjeta va a la página que solo cambia la tarjeta
  it("retorno-tarjeta manda a /admin/plan/retorno-tarjeta", () => {
    const { res, redirect } = fakeRes();
    retornoTarjeta(req, res);
    expect(redirect).toHaveBeenCalledWith(
      303,
      "/admin/plan/retorno-tarjeta?token=TOK-abc123",
    );
  });
});
