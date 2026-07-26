import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  accesoParaTienda,
  autenticarLlamadaMcp,
} from "~/server/mcp/contextoMcp";
import { emitirParDeTokens, revocarConexion } from "~/server/mcp/tokens";

/**
 * El puente token ⇒ identidad ⇒ capacidad, contra la DB real (F03).
 *
 * Lo que se verifica es la propiedad central de ADR-0025: **el token dice QUIÉN es, nunca QUÉ
 * puede**. Las membresías se releen en cada llamada, así que quitarle la Tienda a alguien le
 * corta el acceso sin tocar su token, y revocar el token lo corta aunque la membresía siga viva.
 * Un test con dos usuarios y dos tiendas para que el aislamiento cruzado no sea teórico.
 */

const PREFIJO = "test-mcp-auth-";

async function limpiar() {
  await db.mcpAccessToken.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpRefreshToken.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.mcpClient.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.tenantMembership.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenant.deleteMany({ where: { slug: { startsWith: PREFIJO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

describe("mcp/autenticarLlamadaMcp (DB-backed)", () => {
  // mcp.transporte.030 — el bearer reconstruye membresías VIVAS y aísla entre organizadoras
  it("carga las membresías canónicas del dueño del token y ninguna ajena", async () => {
    const [ana, bea] = await Promise.all([
      db.user.create({
        data: { email: `${PREFIJO}ana@example.cl`, name: "Ana" },
        select: { id: true, email: true },
      }),
      db.user.create({
        data: { email: `${PREFIJO}bea@example.cl`, name: "Bea" },
        select: { id: true },
      }),
    ]);

    // Ana administra DOS tiendas; Bea una tercera que Ana no debe poder tocar.
    const tiendaDeAna1 = await db.tenant.create({
      data: {
        slug: `${PREFIJO}ana-uno`,
        nombre: "Ana Uno",
        memberships: { create: { userId: ana.id } },
      },
      select: { id: true, slug: true },
    });
    const tiendaDeAna2 = await db.tenant.create({
      data: {
        slug: `${PREFIJO}ana-dos`,
        nombre: "Ana Dos",
        memberships: { create: { userId: ana.id } },
      },
      select: { id: true, slug: true },
    });
    const tiendaDeBea = await db.tenant.create({
      data: {
        slug: `${PREFIJO}bea-uno`,
        nombre: "Bea Uno",
        memberships: { create: { userId: bea.id } },
      },
      select: { slug: true },
    });

    const client = await db.mcpClient.create({
      data: {
        clientId: `${PREFIJO}cli`,
        clientName: "Claude Code",
        redirectUris: ["http://127.0.0.1:1/cb"],
      },
      select: { clientId: true },
    });
    const par = await emitirParDeTokens({
      db,
      userId: ana.id,
      clientId: client.clientId,
    });

    const auth = await autenticarLlamadaMcp({ db, rawToken: par.accessToken });
    expect(auth.estado).toBe("ok");
    if (auth.estado !== "ok") throw new Error("estado inesperado");

    expect(auth.ctx.userId).toBe(ana.id);
    expect(auth.ctx.email).toBe(ana.email);
    expect(auth.ctx.clientId).toBe(client.clientId);
    // Orden canónico (antigüedad de la membresía, ADR-0022): la primera es la primera creada.
    expect(auth.ctx.membresias.map((m) => m.slug)).toEqual([
      tiendaDeAna1.slug,
      tiendaDeAna2.slug,
    ]);

    // Selecciona una propia: OK, con el tenant correcto.
    expect(accesoParaTienda(auth.ctx, tiendaDeAna2.slug).tenantIdDelHost).toBe(
      tiendaDeAna2.id,
    );
    // La de Bea EXISTE en la DB y aun así es inalcanzable con el token de Ana.
    expect(() => accesoParaTienda(auth.ctx, tiendaDeBea.slug)).toThrow();

    // Quitarle la membresía a Ana le corta el acceso en la llamada SIGUIENTE, sin tocar el token.
    await db.tenantMembership.deleteMany({
      where: { userId: ana.id, tenantId: tiendaDeAna1.id },
    });
    const auth2 = await autenticarLlamadaMcp({ db, rawToken: par.accessToken });
    if (auth2.estado !== "ok") throw new Error("estado inesperado");
    expect(auth2.ctx.membresias.map((m) => m.slug)).toEqual([tiendaDeAna2.slug]);
    expect(() => accesoParaTienda(auth2.ctx, tiendaDeAna1.slug)).toThrow();

    // Y revocar la conexión corta todo, aunque la membresía restante siga viva.
    await revocarConexion({ db, userId: ana.id, clientId: client.clientId });
    expect(
      await autenticarLlamadaMcp({ db, rawToken: par.accessToken }),
    ).toEqual({ estado: "revocado" });
  });
});
