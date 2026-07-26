import { esRedirectUriPermitida } from "~/server/mcp/redirectUris";

/**
 * Núcleo puro del endpoint `/api/mcp/oauth/authorize` (OAuth 2.1, RFC 6749 §4.1.1). El wrapper
 * busca el cliente en DB, lee la sesión NextAuth y escribe la respuesta; la política vive acá
 * (patrón núcleo+wrapper del repo, igual que `manejarDescarga` y el webhook de Flow).
 *
 * Regla anti-hijacking que ordena todo el archivo: **mientras el `redirect_uri` no esté
 * verificado contra el cliente registrado, el AS no redirige a él**. Devolverle un error a una
 * URI sin verificar es entregarle el `state` y confirmarle qué `client_id` existe a quien la
 * puso en el query. Una vez verificada, los errores sí viajan al cliente como manda el RFC.
 *
 * I8: acá NO se autentica a nadie. El AS se monta sobre la sesión Google de NextAuth que ya
 * existe (ADR-0019): sin sesión, al `/login` del apex con el consent como `callbackUrl`.
 */

export interface ParamsAuthorize {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
}

export type DecisionAuthorize =
  /** Error del AS con su propia respuesta: el cliente todavía no es confiable. */
  | { tipo: "error_json"; status: number; error: string; descripcion?: string }
  /** Error devuelto al cliente en su redirect_uri YA verificado (RFC 6749 §4.1.2.1). */
  | { tipo: "redirect_error"; redirectUri: string; error: string; state: string }
  /** Falta la sesión NextAuth: al login del apex, retomando el dance al volver. */
  | { tipo: "login"; destino: string }
  /** Todo válido: a la página de consentimiento brandeada. */
  | { tipo: "consent"; destino: string };

/** Params del flow que viajan al consent y de ahí, en hidden inputs, al endpoint de decisión. */
export interface FlowConsent {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  state: string;
}

export function urlConsent(flow: FlowConsent): string {
  return `/mcp-consent?${new URLSearchParams({ ...flow }).toString()}`;
}

/**
 * ¿El `redirect_uri` es usable para ESTE cliente? Dos condiciones, no una:
 * (a) el cliente lo registró (exact-match, RFC 6749 §3.1.2.2) y
 * (b) sigue cumpliendo la política D9 HOY — si la allowlist se recortó después del DCR, lo
 *     registrado deja de valer (fail-closed, sin necesidad de limpiar la tabla).
 *
 * Lo usan `/authorize`, el endpoint de decisión y el `getServerSideProps` del consent: los tres
 * verifican lo mismo, así que la definición es una sola.
 */
export function redirectUriVerificada(
  redirectUrisDelCliente: string[],
  redirectUri: string,
): boolean {
  return (
    redirectUrisDelCliente.includes(redirectUri) &&
    esRedirectUriPermitida(redirectUri)
  );
}

export function decidirAuthorize({
  params,
  redirectUrisDelCliente,
  haySesion,
}: {
  params: ParamsAuthorize;
  /** URIs registradas del `client_id`, o `null` si el cliente no existe. */
  redirectUrisDelCliente: string[] | null;
  /** ¿Hay sesión NextAuth viva? (la resuelve el wrapper con `getServerAuthSession`). */
  haySesion: boolean;
}): DecisionAuthorize {
  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method ?? "S256";
  const scope = params.scope ?? "mcp";
  const state = params.state ?? "";

  // ── Fase 1: sin cliente verificado, todos los errores son nuestros ──────────────
  if (!clientId || !redirectUri || !codeChallenge) {
    return {
      tipo: "error_json",
      status: 400,
      error: "invalid_request",
      descripcion:
        "client_id, redirect_uri y code_challenge son obligatorios (PKCE S256).",
    };
  }

  if (redirectUrisDelCliente === null) {
    return { tipo: "error_json", status: 400, error: "invalid_client" };
  }

  if (!redirectUriVerificada(redirectUrisDelCliente, redirectUri)) {
    return { tipo: "error_json", status: 400, error: "invalid_redirect_uri" };
  }

  // ── Fase 2: el redirect_uri es del cliente ⇒ los errores vuelven a él ───────────
  if (codeChallengeMethod !== "S256") {
    // I5: sin S256 no hay dance. `invalid_request` es el código del RFC para un param no soportado.
    return {
      tipo: "redirect_error",
      redirectUri,
      error: "invalid_request",
      state,
    };
  }

  if (params.response_type !== "code") {
    return {
      tipo: "redirect_error",
      redirectUri,
      error: "unsupported_response_type",
      state,
    };
  }

  const destino = urlConsent({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    state,
  });

  if (!haySesion) {
    // I8: la identidad la sigue dando Google/NextAuth. Al volver del login, el dance retoma
    // exactamente en el consent (el `callbackUrl` relativo lo valida `validarCallbackUrl`).
    return {
      tipo: "login",
      destino: `/login?callbackUrl=${encodeURIComponent(destino)}`,
    };
  }

  return { tipo: "consent", destino };
}
