import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  canjearCodigoAutorizacion,
  emitirCodigoAutorizacion,
} from "~/server/mcp/codigosAutorizacion";
import {
  emitirParDeTokens,
  refrescarParDeTokens,
  revocarConexion,
  revocarRefreshToken,
  validarAccessToken,
} from "~/server/mcp/tokens";

/**
 * El dance OAuth 2.1 completo contra la DB real: code → canje con PKCE → par de tokens →
 * validación del bearer. Se ejerce por la interfaz pública de los dos módulos que tocan
 * `McpAuthCode` / `McpAccessToken` / `McpRefreshToken`; el `code_verifier` se calcula como lo
 * haría un cliente real (base64url(sha256(verifier))), no leyendo internals.
 *
 * Contra DB real porque lo que importa es justamente lo transaccional: el single-use atómico
 * del code y que en las tablas de tokens NO quede jamás un token en claro (I2).
 */

const PREFIJO = "test-mcp-dance-";
const REDIRECT = "http://127.0.0.1:33418/callback";

async function limpiar() {
  await db.mcpAuthCode.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpAccessToken.deleteMany({
    where: { clientId: { startsWith: PREFIJO } },
  });
  await db.mcpRefreshToken.deleteMany({
    where: { clientId: { startsWith: PREFIJO } },
  });
  await db.mcpClient.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

/** Cliente + Organizador de prueba, como los dejaría el DCR + un login Google. */
async function montarEscenario(nombre: string) {
  const [user, client] = await Promise.all([
    db.user.create({
      data: { email: `${PREFIJO}${nombre}@example.cl`, name: nombre },
      select: { id: true, email: true },
    }),
    db.mcpClient.create({
      data: {
        clientId: `${PREFIJO}${nombre}`,
        clientName: "Claude Code",
        redirectUris: [REDIRECT],
      },
      select: { clientId: true },
    }),
  ]);
  return { user, clientId: client.clientId };
}

/** PKCE del lado del cliente: verifier aleatorio ⇒ challenge S256. */
function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

describe("mcp/dance OAuth 2.1 (DB-backed)", () => {
  // mcp.oauth.030 — el camino feliz completo, y la garantía I2: en DB solo hashes
  it("canjea el code con PKCE y emite un par de tokens que valida; en DB no hay tokens planos", async () => {
    const { user, clientId } = await montarEscenario("feliz");
    const { verifier, challenge } = pkce();

    const { code } = await emitirCodigoAutorizacion({
      db,
      clientId,
      userId: user.id,
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      scopes: "mcp",
    });

    const canje = await canjearCodigoAutorizacion({
      db,
      code,
      codeVerifier: verifier,
      clientId,
      redirectUri: REDIRECT,
    });
    expect(canje).toEqual({ estado: "ok", userId: user.id, scopes: "mcp" });

    const par = await emitirParDeTokens({
      db,
      userId: user.id,
      clientId,
      scopes: "mcp",
    });

    // El access token vale como bearer y trae la identidad del dueño (D2).
    const validacion = await validarAccessToken({ db, rawToken: par.accessToken });
    expect(validacion).toMatchObject({
      estado: "ok",
      userId: user.id,
      clientId,
      scopes: ["mcp"],
    });

    // I2: el token plano se devolvió UNA vez y no quedó en ninguna fila. Lo guardado es el
    // SHA-256 hex (64 chars) y solo sirve para comparar.
    const enDb = await db.mcpAccessToken.findMany({
      where: { clientId },
      select: { tokenHash: true },
    });
    expect(enDb).toHaveLength(1);
    expect(enDb[0]?.tokenHash).not.toBe(par.accessToken);
    expect(enDb[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const refreshEnDb = await db.mcpRefreshToken.findMany({
      where: { clientId },
      select: { tokenHash: true },
    });
    expect(refreshEnDb[0]?.tokenHash).not.toBe(par.refreshToken);
    expect(refreshEnDb[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // Un token inventado no valida.
    expect(
      await validarAccessToken({ db, rawToken: "token-inventado" }),
    ).toEqual({ estado: "invalido" });
  });

  // mcp.oauth.031 — todo lo que NO puede canjear un code. Un solo escenario compartido para
  // no pagar N round-trips a la DB por cada rechazo.
  it("rechaza el canje sin PKCE válido, con cliente/URI ajenos, vencido y en el replay", async () => {
    const { user, clientId } = await montarEscenario("adverso");

    /** Emite un code fresco del escenario (cada intento necesita el suyo: el canje lo quema). */
    const nuevoCode = async (challenge: string) =>
      (
        await emitirCodigoAutorizacion({
          db,
          clientId,
          userId: user.id,
          redirectUri: REDIRECT,
          codeChallenge: challenge,
          codeChallengeMethod: "S256",
          scopes: "mcp",
        })
      ).code;

    const { verifier, challenge } = pkce();

    // 1. Verifier equivocado ⇒ el ataque que PKCE cierra (code robado, cliente distinto).
    expect(
      await canjearCodigoAutorizacion({
        db,
        code: await nuevoCode(challenge),
        codeVerifier: pkce().verifier, // otro verifier
        clientId,
        redirectUri: REDIRECT,
      }),
    ).toEqual({ estado: "pkce_no_coincide" });

    // 2. Sin verifier: PKCE no es opcional (I5).
    expect(
      await canjearCodigoAutorizacion({
        db,
        code: await nuevoCode(challenge),
        codeVerifier: "",
        clientId,
        redirectUri: REDIRECT,
      }),
    ).toEqual({ estado: "invalido" });

    // 3. Otro client_id: el code solo se canjea desde donde nació.
    expect(
      await canjearCodigoAutorizacion({
        db,
        code: await nuevoCode(challenge),
        codeVerifier: verifier,
        clientId: `${PREFIJO}otro-cliente`,
        redirectUri: REDIRECT,
      }),
    ).toEqual({ estado: "cliente_no_coincide" });

    // 4. Otra redirect_uri que la del /authorize (RFC 6749 §4.1.3).
    expect(
      await canjearCodigoAutorizacion({
        db,
        code: await nuevoCode(challenge),
        codeVerifier: verifier,
        clientId,
        redirectUri: "http://127.0.0.1:1/otra",
      }),
    ).toEqual({ estado: "redirect_uri_no_coincide" });

    // 5. Vencido: el reloj inyectable adelanta 11 min (TTL del code = 10).
    expect(
      await canjearCodigoAutorizacion({
        db,
        code: await nuevoCode(challenge),
        codeVerifier: verifier,
        clientId,
        redirectUri: REDIRECT,
        ahora: new Date(Date.now() + 11 * 60 * 1000),
      }),
    ).toEqual({ estado: "vencido" });

    // 6. REPLAY: el mismo code dos veces. El primero pasa, el segundo NO — single-use.
    const codeUnico = await nuevoCode(challenge);
    const primero = await canjearCodigoAutorizacion({
      db,
      code: codeUnico,
      codeVerifier: verifier,
      clientId,
      redirectUri: REDIRECT,
    });
    expect(primero).toMatchObject({ estado: "ok", userId: user.id });

    expect(
      await canjearCodigoAutorizacion({
        db,
        code: codeUnico,
        codeVerifier: verifier,
        clientId,
        redirectUri: REDIRECT,
      }),
    ).toEqual({ estado: "ya_usado" });
  });

  // mcp.oauth.032 — refresh renueva sin ampliar permisos; revocar corta de verdad
  it("refresca heredando el scope y la revocación invalida los tokens al instante", async () => {
    const { user, clientId } = await montarEscenario("refresh");

    const par = await emitirParDeTokens({
      db,
      userId: user.id,
      clientId,
      scopes: "mcp",
    });

    // Refresh ⇒ par nuevo, misma identidad, MISMO scope (refrescar nunca amplía).
    const refrescado = await refrescarParDeTokens({
      db,
      rawRefreshToken: par.refreshToken,
    });
    expect(refrescado.estado).toBe("ok");
    if (refrescado.estado !== "ok") throw new Error("estado inesperado");
    expect(refrescado.scopes).toBe("mcp");
    expect(refrescado.accessToken).not.toBe(par.accessToken);

    expect(
      await validarAccessToken({ db, rawToken: refrescado.accessToken }),
    ).toMatchObject({ estado: "ok", userId: user.id });

    // Revocar el refresh CASCADEA a los access vivos del mismo (userId, clientId): quien
    // aprieta "revocar" no espera seguir operando una hora más con el access actual.
    await revocarRefreshToken({ db, rawRefreshToken: refrescado.refreshToken });

    expect(
      await validarAccessToken({ db, rawToken: refrescado.accessToken }),
    ).toEqual({ estado: "revocado" });
    expect(await validarAccessToken({ db, rawToken: par.accessToken })).toEqual({
      estado: "revocado",
    });

    // Un refresh revocado ya no sirve para resucitar la conexión.
    expect(
      await refrescarParDeTokens({ db, rawRefreshToken: refrescado.refreshToken }),
    ).toEqual({ estado: "revocado" });

    // `revocarConexion` (el botón del panel, F09) mata todo lo vivo del par usuario+cliente.
    const otro = await emitirParDeTokens({
      db,
      userId: user.id,
      clientId,
      scopes: "mcp",
    });
    await revocarConexion({ db, userId: user.id, clientId });
    expect(await validarAccessToken({ db, rawToken: otro.accessToken })).toEqual({
      estado: "revocado",
    });
    expect(
      await refrescarParDeTokens({ db, rawRefreshToken: otro.refreshToken }),
    ).toEqual({ estado: "revocado" });
  });
});
