import type { NextApiRequest, NextApiResponse } from "next";

import { getServerAuthSession } from "~/server/auth";
import { db } from "~/server/db";
import { emitirCodigoAutorizacion } from "~/server/mcp/codigosAutorizacion";
import { redirectUriVerificada } from "~/server/mcp/decidirAuthorize";

/**
 * Procesa la decisión del Organizador en `/mcp-consent` (ADR-0025 F02). Es el ÚNICO lugar donde
 * nace un authorization code, y solo después de que un humano logueado apretó "Autorizar".
 *
 * Todo se re-valida acá aunque `/authorize` ya lo haya hecho: el form es HTML del browser y pudo
 * ser manipulado. Defensa en profundidad — sesión viva, cliente existente y `redirect_uri`
 * verificada contra el cliente + la política D9.
 *
 * El `userId` que queda pegado al code sale de la SESIÓN, jamás del form.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const body = req.body as Record<string, string | undefined>;
  const decision = body.decision;
  const clientId = body.client_id;
  const redirectUri = body.redirect_uri;
  const codeChallenge = body.code_challenge;
  const codeChallengeMethod = body.code_challenge_method ?? "S256";
  const scope = body.scope ?? "mcp";
  const state = body.state ?? "";

  if (!clientId || !redirectUri || !codeChallenge || !decision) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  // I5: el método se re-chequea acá porque este endpoint es el que PERSISTE el challenge.
  if (codeChallengeMethod !== "S256") {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const sesion = await getServerAuthSession({ req, res });
  const userId = sesion?.user?.id;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const cliente = await db.mcpClient.findUnique({
    where: { clientId },
    select: { redirectUris: true },
  });
  if (!cliente) {
    res.status(400).json({ error: "invalid_client" });
    return;
  }
  if (!redirectUriVerificada(cliente.redirectUris, redirectUri)) {
    res.status(400).json({ error: "invalid_redirect_uri" });
    return;
  }

  // Rechazo explícito del humano: el cliente se entera por su propio callback (RFC 6749 §4.1.2.1).
  if (decision === "deny") {
    res.redirect(302, urlConError(redirectUri, "access_denied", state));
    return;
  }
  if (decision !== "approve") {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const { code } = await emitirCodigoAutorizacion({
    db,
    clientId,
    userId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scopes: scope,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

function urlConError(redirectUri: string, error: string, state: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
