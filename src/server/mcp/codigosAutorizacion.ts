import { createHash, randomBytes } from "node:crypto";
import { type PrismaClient } from "@prisma/client";

/**
 * Authorization Codes del dance OAuth 2.1 (RFC 6749 §4.1 + PKCE RFC 7636). ÚNICO módulo del
 * código que toca `McpAuthCode` — la seguridad del canje está concentrada acá y en ningún otro
 * lado (ADR-0025, I5).
 *
 * Tres reglas que no se negocian:
 * 1. **PKCE S256 obligatorio**: el canje exige un `code_verifier` cuyo SHA-256 en base64url
 *    coincida con el `codeChallenge` guardado. El verifier JAMÁS se persiste. Por eso el code
 *    puede vivir en claro en DB: robarlo no alcanza para canjearlo.
 * 2. **Single-use ATÓMICO**: el `usedAt` se marca con `updateMany({ where: { code, usedAt: null }})`
 *    exigiendo `count === 1`. Un `findUnique` + `update` no sirve: dos canjes concurrentes del
 *    mismo code pasarían los dos el chequeo antes de que cualquiera escriba.
 * 3. **Exact-match de `clientId` y `redirectUri`** contra lo que se guardó al emitirlo: el code
 *    solo se canjea desde donde nació.
 *
 * TTL corto (10 min): el code es un pase de un solo uso entre el browser y el cliente, no una
 * credencial. Los vencidos se limpian de forma perezosa al iniciar un dance nuevo del mismo
 * cliente — sin cron ni job (el volumen es mínimo).
 */

const TTL_CODIGO_MS = 10 * 60 * 1000; // 10 minutos

function generarCodigo(): string {
  // 32 bytes = 256 bits de entropía; base64url ≈ 43 chars.
  return randomBytes(32).toString("base64url");
}

/** Challenge S256 del verifier, tal como lo calcula el cliente (RFC 7636 §4.2). */
function calcularChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Borra los codes vencidos de un cliente. Best-effort e idempotente; se llama al arrancar un
 * dance nuevo para que la tabla no crezca con basura de dances abandonados.
 */
export async function limpiarCodigosVencidos({
  db,
  clientId,
}: {
  db: PrismaClient;
  clientId: string;
}): Promise<void> {
  await db.mcpAuthCode.deleteMany({
    where: { clientId, expiresAt: { lte: new Date() } },
  });
}

/**
 * Emite el code DESPUÉS del consentimiento explícito del Organizador (nunca antes). El `userId`
 * viene de la sesión NextAuth del borde, jamás de un input del cliente.
 */
export async function emitirCodigoAutorizacion({
  db,
  clientId,
  userId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  scopes,
}: {
  db: PrismaClient;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string;
}): Promise<{ code: string; expiresAt: Date }> {
  const code = generarCodigo();
  const expiresAt = new Date(Date.now() + TTL_CODIGO_MS);

  await db.mcpAuthCode.create({
    data: {
      code,
      clientId,
      userId,
      scopes,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      expiresAt,
    },
  });

  return { code, expiresAt };
}

export type ResultadoCanje =
  | { estado: "ok"; userId: string; scopes: string }
  | { estado: "invalido" }
  | { estado: "vencido" }
  | { estado: "ya_usado" }
  | { estado: "pkce_no_coincide" }
  | { estado: "redirect_uri_no_coincide" }
  | { estado: "cliente_no_coincide" };

/**
 * Canjea el code en el token endpoint. Devuelve el `userId` que consintió — la identidad que
 * quedará dentro del Token MCP (D2).
 *
 * El orden de los chequeos importa poco para la seguridad (todos son fail-closed) pero mucho
 * para el diagnóstico: se responde el motivo REAL al log/desarrollador y un `invalid_grant`
 * genérico al cliente (lo arma el endpoint).
 */
export async function canjearCodigoAutorizacion({
  db,
  code,
  codeVerifier,
  clientId,
  redirectUri,
  ahora = new Date(),
}: {
  db: PrismaClient;
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  /** Reloj inyectable (default: ahora). Permite testear el vencimiento sin esperar 10 min. */
  ahora?: Date;
}): Promise<ResultadoCanje> {
  // Sin verifier no hay canje posible: PKCE no es opcional (I5).
  if (!code || !codeVerifier) return { estado: "invalido" };

  const fila = await db.mcpAuthCode.findUnique({ where: { code } });
  if (!fila) return { estado: "invalido" };
  if (fila.usedAt !== null) return { estado: "ya_usado" };
  if (fila.expiresAt.getTime() <= ahora.getTime()) return { estado: "vencido" };
  if (fila.clientId !== clientId) return { estado: "cliente_no_coincide" };
  if (fila.redirectUri !== redirectUri) {
    return { estado: "redirect_uri_no_coincide" };
  }
  // Defensa explícita: el método se fijó al emitir; cualquier cosa que no sea S256 no se canjea.
  if (fila.codeChallengeMethod !== "S256") return { estado: "pkce_no_coincide" };
  if (calcularChallenge(codeVerifier) !== fila.codeChallenge) {
    return { estado: "pkce_no_coincide" };
  }

  // Single-use ATÓMICO: el `usedAt: null` del WHERE es lo que serializa dos canjes en carrera.
  // Sin esto, un code robado podría canjearse en paralelo con el legítimo.
  const marcado = await db.mcpAuthCode.updateMany({
    where: { code, usedAt: null },
    data: { usedAt: ahora },
  });
  if (marcado.count === 0) return { estado: "ya_usado" };

  return { estado: "ok", userId: fila.userId, scopes: fila.scopes };
}
