import { type ResultadoCanje } from "~/server/mcp/codigosAutorizacion";
import { type ParDeTokens, type ResultadoRefresh } from "~/server/mcp/tokens";

/**
 * Cuerpos de respuesta del token endpoint (RFC 6749 §5.1 y §5.2). Puros y testeados aparte
 * porque acá vive una propiedad de seguridad, no un formato.
 *
 * **Anti-oráculo (I5)**: el servidor sabe exactamente por qué falló un canje —el code no existe,
 * existe pero ya se usó, existe pero el `code_verifier` no calza, es de otro cliente— y NADA de
 * eso puede salir al cable. Distinguir "no existe" de "existe pero falta el verifier correcto"
 * es precisamente lo que PKCE le niega a quien intercepta un authorization code de un cliente
 * público; devolverlo en el `error_description` regalaría esa distinción. Hacia afuera: un solo
 * `invalid_grant` idéntico para todos los casos. El motivo fino se loguea server-side.
 */

/** Estados finos de rechazo, del canje del code o del refresh. Nunca viajan al cliente. */
export type EstadoRechazo =
  | Exclude<ResultadoCanje["estado"], "ok">
  | Exclude<ResultadoRefresh["estado"], "ok">;

export interface CuerpoErrorGrant {
  error: "invalid_grant";
  error_description: string;
}

/**
 * Respuesta ÚNICA de rechazo. Toma el estado fino solo para que el llamador no tenga que
 * acordarse de tirarlo: la función lo ignora a propósito (y el test verifica que la salida sea
 * byte-idéntica para todos los estados).
 */
export function respuestaGrantRechazado(
  _estado: EstadoRechazo,
): CuerpoErrorGrant {
  return {
    error: "invalid_grant",
    error_description: "El grant no es válido, ya se usó o expiró.",
  };
}

export interface CuerpoTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** Respuesta exitosa (RFC 6749 §5.1). `expires_in` en segundos, nunca negativo. */
export function respuestaDeTokens(
  par: ParDeTokens,
  scopes: string,
  ahora: Date = new Date(),
): CuerpoTokens {
  return {
    access_token: par.accessToken,
    token_type: "Bearer",
    expires_in: Math.max(
      0,
      Math.floor((par.accessExpiresAt.getTime() - ahora.getTime()) / 1000),
    ),
    refresh_token: par.refreshToken,
    scope: scopes,
  };
}
