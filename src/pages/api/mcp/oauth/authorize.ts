import type { NextApiRequest, NextApiResponse } from "next";

import { getServerAuthSession } from "~/server/auth";
import { db } from "~/server/db";
import { limpiarCodigosVencidos } from "~/server/mcp/codigosAutorizacion";
import {
  decidirAuthorize,
  type ParamsAuthorize,
} from "~/server/mcp/decidirAuthorize";

/**
 * OAuth 2.1 Authorization endpoint (borde de cableado, ADR-0025 F02).
 *
 * Acá aterriza el browser del Organizador cuando su cliente de IA arranca el dance. El endpoint
 * NO decide: carga el cliente, pregunta si hay sesión NextAuth y ejecuta lo que resuelve
 * `decidirAuthorize` (núcleo puro con toda la política, incl. la regla anti-hijacking de no
 * redirigir a un `redirect_uri` sin verificar).
 *
 * I8: la identidad la sigue poniendo Google/NextAuth — el AS se monta encima, no la reemplaza.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  const params: ParamsAuthorize = {
    response_type: unParam(req.query.response_type),
    client_id: unParam(req.query.client_id),
    redirect_uri: unParam(req.query.redirect_uri),
    code_challenge: unParam(req.query.code_challenge),
    code_challenge_method: unParam(req.query.code_challenge_method),
    scope: unParam(req.query.scope),
    state: unParam(req.query.state),
  };

  const cliente = params.client_id
    ? await db.mcpClient.findUnique({
        where: { clientId: params.client_id },
        select: { redirectUris: true },
      })
    : null;

  // Limpieza perezosa de codes vencidos de este cliente: sin cron, aprovechando que ya estamos
  // en su camino. Best-effort — si falla, el dance sigue igual.
  if (cliente && params.client_id) {
    await limpiarCodigosVencidos({ db, clientId: params.client_id }).catch(
      () => undefined,
    );
  }

  const sesion = await getServerAuthSession({ req, res });

  const decision = decidirAuthorize({
    params,
    redirectUrisDelCliente: cliente?.redirectUris ?? null,
    haySesion: Boolean(sesion?.user?.id),
  });

  switch (decision.tipo) {
    case "error_json":
      res.status(decision.status).json({
        error: decision.error,
        ...(decision.descripcion
          ? { error_description: decision.descripcion }
          : {}),
      });
      return;

    case "redirect_error": {
      const url = new URL(decision.redirectUri);
      url.searchParams.set("error", decision.error);
      if (decision.state) url.searchParams.set("state", decision.state);
      res.redirect(302, url.toString());
      return;
    }

    case "login":
    case "consent":
      res.redirect(302, decision.destino);
      return;
  }
}

/** Query de Next: un param repetido llega como array; se toma el primero. */
function unParam(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}
