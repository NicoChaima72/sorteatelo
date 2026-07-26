import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";

/**
 * Tests DB-backed del SCHEMA del MCP del Organizador (F01, ADR-0025). Se ejercen contra la DB real
 * porque lo que se verifica vive en Postgres/Prisma, no en un use case: el `tokenHash @unique` de los
 * dos modelos de token, el `onDelete: Cascade` de codes/tokens hacia `McpClient(clientId)` (la FK
 * apunta al `@unique` público, no a la PK) y hacia `User`, y —el punto de D11/I7— que `McpAuditLog`
 * NO tiene FK: sobrevive intacto al borrado del cliente Y del usuario, con su snapshot `userEmail`
 * todavía legible.
 *
 * Prefijos `test-mcp-schema-*` scopeados y limpiados antes/después (FK-safe: hijos antes que padres).
 */

const PREFIJO = "test-mcp-schema-";

async function limpiar() {
  // Los codes/tokens caen por Cascade al borrar el cliente y el user, pero se borran explícito
  // para que la limpieza no dependa de lo que este mismo test verifica.
  await db.mcpAuthCode.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpAccessToken.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpRefreshToken.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpAuditLog.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpClient.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

async function crearUser(nombre: string) {
  return db.user.create({
    data: { email: `${PREFIJO}${nombre}@example.cl`, name: nombre },
    select: { id: true, email: true },
  });
}

async function crearClient(nombre: string) {
  return db.mcpClient.create({
    data: {
      clientId: `${PREFIJO}${nombre}`,
      clientName: `Cliente ${nombre}`,
      redirectUris: ["http://127.0.0.1:33418/callback"],
    },
    select: { id: true, clientId: true, redirectUris: true, scopes: true },
  });
}

describe("schema/Mcp* (DB-backed)", () => {
  // mcp.schema.001 — los 5 modelos existen, `tokenHash` es único y `redirectUris` es text[] nativo
  it("persiste los 5 modelos; tokenHash es @unique en access y refresh", async () => {
    const user = await crearUser("uno");
    const client = await crearClient("uno");

    // `redirectUris` vuelve como string[] tipado (no JsonValue): no hay que castear para el
    // exact-match de I5.
    expect(client.redirectUris).toEqual(["http://127.0.0.1:33418/callback"]);
    expect(client.scopes).toBe("mcp"); // default del schema (scope único v1, D10)

    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000);

    await db.mcpAuthCode.create({
      data: {
        code: `${PREFIJO}code-1`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        redirectUri: "http://127.0.0.1:33418/callback",
        codeChallenge: "challenge-1",
        expiresAt: enUnaHora,
      },
    });
    const code = await db.mcpAuthCode.findUnique({
      where: { code: `${PREFIJO}code-1` },
      select: { codeChallengeMethod: true, usedAt: true },
    });
    expect(code?.codeChallengeMethod).toBe("S256"); // default: PKCE S256 obligatorio (I5)
    expect(code?.usedAt).toBeNull(); // nace sin usar (single-use)

    await db.mcpAccessToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-access`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: enUnaHora,
      },
    });
    await db.mcpRefreshToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-refresh`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: enUnaHora,
      },
    });

    // El `@unique` de `tokenHash` es lo que hace del lookup por request un índice y lo que impide
    // dos tokens con el mismo hash.
    await expect(
      db.mcpAccessToken.create({
        data: {
          tokenHash: `${PREFIJO}hash-access`, // repetido
          clientId: client.clientId,
          userId: user.id,
          scopes: "mcp",
          expiresAt: enUnaHora,
        },
      }),
    ).rejects.toThrow();

    await expect(
      db.mcpRefreshToken.create({
        data: {
          tokenHash: `${PREFIJO}hash-refresh`, // repetido
          clientId: client.clientId,
          userId: user.id,
          scopes: "mcp",
          expiresAt: enUnaHora,
        },
      }),
    ).rejects.toThrow();

    await db.mcpAuditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        clientId: client.clientId,
        tool: "mis_tiendas",
        args: "{}",
        result: "OK",
      },
    });
    expect(
      await db.mcpAuditLog.count({ where: { clientId: client.clientId } }),
    ).toBe(1);
  });

  // mcp.schema.002 — borrar el McpClient arrastra codes y tokens (Cascade hacia clientId @unique)
  // y NO toca el audit (sin FK, D11/I7)
  it("borrar el cliente cascadea codes/tokens y deja el audit intacto", async () => {
    const user = await crearUser("dos");
    const client = await crearClient("dos");
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000);

    await db.mcpAuthCode.create({
      data: {
        code: `${PREFIJO}code-2`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        redirectUri: "http://127.0.0.1:33418/callback",
        codeChallenge: "challenge-2",
        expiresAt: enUnaHora,
      },
    });
    await db.mcpAccessToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-a2`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: enUnaHora,
      },
    });
    await db.mcpRefreshToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-r2`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: enUnaHora,
      },
    });
    await db.mcpAuditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        clientId: client.clientId,
        tool: "crear_producto",
        args: '{"titulo_length":12}',
        result: "ERROR",
        errorCode: "FORBIDDEN",
      },
    });

    await db.mcpClient.delete({ where: { clientId: client.clientId } });

    expect(
      await db.mcpAuthCode.count({ where: { clientId: client.clientId } }),
    ).toBe(0);
    expect(
      await db.mcpAccessToken.count({ where: { clientId: client.clientId } }),
    ).toBe(0);
    expect(
      await db.mcpRefreshToken.count({ where: { clientId: client.clientId } }),
    ).toBe(0);

    // El audit SOBREVIVE al borrado del cliente: es el punto de no tener FK (D11/I7).
    const auditados = await db.mcpAuditLog.findMany({
      where: { clientId: client.clientId },
      select: { tool: true, result: true, errorCode: true, userEmail: true },
    });
    expect(auditados).toHaveLength(1);
    expect(auditados[0]).toEqual({
      tool: "crear_producto",
      result: "ERROR",
      errorCode: "FORBIDDEN",
      userEmail: user.email,
    });
  });

  // mcp.schema.003 — borrar el User desarma sus tokens (Cascade) y el audit sigue LEGIBLE por
  // el snapshot `userEmail` (la corrección de schema-guardian: un cuid colgante no preserva historial)
  it("borrar el usuario cascadea sus tokens y el audit queda legible por userEmail", async () => {
    const user = await crearUser("tres");
    const client = await crearClient("tres");
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000);

    await db.mcpAccessToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-a3`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: enUnaHora,
      },
    });
    await db.mcpAuditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        clientId: client.clientId,
        tool: "mis_tiendas",
        args: "{}",
        result: "OK",
      },
    });

    await db.user.delete({ where: { id: user.id } });

    // Sin dueño no hay token vivo: la credencial se desarma al instante.
    expect(
      await db.mcpAccessToken.count({ where: { userId: user.id } }),
    ).toBe(0);

    // El audit sigue ahí Y sigue diciendo QUIÉN fue, aunque el User ya no exista.
    const fila = await db.mcpAuditLog.findFirst({
      where: { clientId: client.clientId },
      select: { userId: true, userEmail: true, tool: true },
    });
    expect(fila?.userId).toBe(user.id); // cuid colgante (sin FK que lo borre)
    expect(fila?.userEmail).toBe(user.email); // …y el snapshot que lo hace legible
    expect(fila?.tool).toBe("mis_tiendas");
  });
});
