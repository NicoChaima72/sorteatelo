import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emitirParDeTokens,
  listarConexionesDeUsuario,
  revocarConexion,
  validarAccessToken,
} from "~/server/mcp/tokens";
import { db } from "~/server/db";

/**
 * Panel «Conexiones IA» (F09) — la parte de servidor. Es la salida del usuario: lo que le permite
 * cortar el acceso de un cliente de IA sin depender de que el cliente coopere.
 *
 * Dos propiedades:
 *
 * 1. **La lista es por Conexión, no por token.** Un cliente conectado renueva su access token cada
 *    hora: listar tokens le mostraría al Organizador cientos de filas idénticas en un mes y haría
 *    ilegible la única pantalla donde puede revocar. La [[Conexión MCP]] (par usuario+cliente) es
 *    la unidad que él reconoce ("Claude Desktop") y la que el botón revoca.
 * 2. **Solo lo suyo**: el `userId` sale de la sesión, nunca del input — si viniera del cliente,
 *    esta pantalla sería un revocador de conexiones ajenas.
 */

const PREFIJO = "test-mcp-conexiones-";

async function limpiar() {
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

describe("mcp/conexiones del panel (DB-backed)", () => {
  // mcp.conexiones.010 — agrupa por cliente, muestra solo lo del usuario de la sesión, y revocar
  // corta el acceso de verdad (el token deja de validar)
  it("lista las conexiones del usuario agrupadas por cliente y revocar corta el acceso", async () => {
    const [ana, beto] = await Promise.all([
      db.user.create({
        data: { email: `${PREFIJO}ana@example.cl`, name: "Ana" },
        select: { id: true },
      }),
      db.user.create({
        data: { email: `${PREFIJO}beto@example.cl`, name: "Beto" },
        select: { id: true },
      }),
    ]);
    const [escritorio, consola] = await Promise.all([
      db.mcpClient.create({
        data: {
          clientId: `${PREFIJO}escritorio`,
          clientName: "Claude Desktop",
          redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
        },
        select: { clientId: true },
      }),
      db.mcpClient.create({
        data: {
          clientId: `${PREFIJO}consola`,
          clientName: "Claude Code",
          redirectUris: ["http://127.0.0.1:8976/callback"],
        },
        select: { clientId: true },
      }),
    ]);

    // Ana usó Claude Desktop DOS veces (dos pares de tokens: es lo que pasa al refrescar) y Claude
    // Code una. Beto tiene su propia conexión al mismo cliente.
    const primerParDeAna = await emitirParDeTokens({
      db,
      userId: ana.id,
      clientId: escritorio.clientId,
    });
    const segundoParDeAna = await emitirParDeTokens({
      db,
      userId: ana.id,
      clientId: escritorio.clientId,
    });
    await emitirParDeTokens({ db, userId: ana.id, clientId: consola.clientId });
    const parDeBeto = await emitirParDeTokens({
      db,
      userId: beto.id,
      clientId: escritorio.clientId,
    });

    const conexiones = await listarConexionesDeUsuario({ db, userId: ana.id });

    // DOS filas, no cuatro tokens: la unidad es la Conexión.
    expect(conexiones).toHaveLength(2);
    expect(conexiones.map((c) => c.nombre).sort()).toEqual([
      "Claude Code",
      "Claude Desktop",
    ]);
    expect(conexiones.every((c) => c.activa)).toBe(true);
    // Nada de tokens ni hashes en lo que sale del servidor (I2).
    const serializado = JSON.stringify(conexiones);
    expect(serializado).not.toContain(primerParDeAna.accessToken);
    expect(serializado).not.toContain(segundoParDeAna.refreshToken);
    expect(serializado.toLowerCase()).not.toContain("tokenhash");

    // Revocar la conexión de Claude Desktop: se lleva LOS DOS pares de Ana de ese cliente…
    await revocarConexion({ db, userId: ana.id, clientId: escritorio.clientId });

    expect(
      (await validarAccessToken({ db, rawToken: primerParDeAna.accessToken }))
        .estado,
    ).toBe("revocado");
    expect(
      (await validarAccessToken({ db, rawToken: segundoParDeAna.accessToken }))
        .estado,
    ).toBe("revocado");

    // …y NO toca la de Beto al mismo cliente, ni la otra conexión de Ana.
    expect(
      (await validarAccessToken({ db, rawToken: parDeBeto.accessToken })).estado,
    ).toBe("ok");

    const trasRevocar = await listarConexionesDeUsuario({ db, userId: ana.id });
    // La fila NO desaparece: sigue siendo historial de que ese cliente estuvo conectado.
    expect(trasRevocar).toHaveLength(2);
    expect(
      trasRevocar.find((c) => c.nombre === "Claude Desktop")?.activa,
    ).toBe(false);
    expect(trasRevocar.find((c) => c.nombre === "Claude Code")?.activa).toBe(true);

    // Y la lista de Beto sigue intacta y es SOLO suya.
    const deBeto = await listarConexionesDeUsuario({ db, userId: beto.id });
    expect(deBeto).toHaveLength(1);
    expect(deBeto[0]?.activa).toBe(true);
  });

  // mcp.conexiones.011 — un token vencido no se muestra como conexión viva, aunque nadie lo revocó
  it("marca inactiva la conexión cuyos tokens vencieron", async () => {
    const user = await db.user.create({
      data: { email: `${PREFIJO}vencida@example.cl`, name: "Vencida" },
      select: { id: true },
    });
    const client = await db.mcpClient.create({
      data: {
        clientId: `${PREFIJO}viejo`,
        clientName: "Cliente viejo",
        redirectUris: ["http://127.0.0.1:9000/cb"],
      },
      select: { clientId: true },
    });

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.mcpAccessToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-access`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: ayer,
      },
    });
    await db.mcpRefreshToken.create({
      data: {
        tokenHash: `${PREFIJO}hash-refresh`,
        clientId: client.clientId,
        userId: user.id,
        scopes: "mcp",
        expiresAt: ayer,
      },
    });

    const [conexion] = await listarConexionesDeUsuario({ db, userId: user.id });
    expect(conexion?.nombre).toBe("Cliente viejo");
    // Sin revocar nada: simplemente caducó. El panel no puede decir "activa" de algo que no puede
    // llamar — el Organizador decidiría en base a un dato falso.
    expect(conexion?.activa).toBe(false);
  });
});
