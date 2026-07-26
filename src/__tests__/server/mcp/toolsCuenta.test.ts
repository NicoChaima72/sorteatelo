import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { TOOLS } from "~/server/mcp/tools/registro";
import { db } from "~/server/db";

/**
 * Tools de CUENTA (F08) contra DB real: crear una Tienda y cargar las credenciales de Flow.
 *
 * Son las dos tools que más lejos llegan del resto, y por razones opuestas:
 *
 * - `crear_tienda` es la ÚNICA que precede a toda membresía (no recibe `tienda`, no hay tienda que
 *   recibir). Su guard vive en el use case y se recuenta dentro de la `$transaction`, no en el
 *   snapshot del contexto — este test lo prueba llamando dos veces con el MISMO contexto viejo.
 * - `guardar_credencial_flow` es la excepción de D8: el secreto ENTRA por el MCP. Lo que se verifica
 *   acá es que solo entre — que la columna quede cifrada y que ni la respuesta de la tool ni el
 *   estado que el agente puede leer contengan el secreto en ninguna forma.
 */

const PREFIJO = "test-mcp-cuenta-";
/**
 * Marcadores reconocibles: si aparecen en una respuesta, en la columna o en el audit, el secreto se
 * filtró. Buscar la cadena exacta es la única forma honesta de probar una ausencia.
 */
const API_KEY = `${PREFIJO}APIKEY-NO-DEBE-APARECER`;
const SECRET_KEY = `${PREFIJO}SECRETO-NO-DEBE-APARECER`;

async function limpiar() {
  await db.flowCredential.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.storefrontPage.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenantMembership.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenant.deleteMany({ where: { slug: { startsWith: PREFIJO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

function tool(nombre: string) {
  const t = TOOLS.find((x) => x.nombre === nombre);
  if (!t) throw new Error(`La tool "${nombre}" no está en el registro.`);
  return t;
}

async function usuarioSinTienda() {
  const user = await db.user.create({
    data: { email: `${PREFIJO}org@example.cl`, name: "Org" },
    select: { id: true, email: true },
  });
  const ctx: ContextoMcp = {
    db,
    userId: user.id,
    email: user.email,
    clientId: `${PREFIJO}cli`,
    scopes: ["mcp"],
    membresias: [], // sin membresías: es el estado de quien recién se registró
  };
  return { user, ctx };
}

describe("mcp/tools de cuenta (DB-backed)", () => {
  // mcp.tools.060 — el alta completa en una transacción, y el guard que la limita
  it("crear_tienda deja la Tienda en CONFIGURACION con su membresía y su página", async () => {
    const { user, ctx } = await usuarioSinTienda();

    await tool("crear_tienda").manejar(
      { direccion: `${PREFIJO}mia`, nombre: "Mi tienda nueva" },
      ctx,
    );

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { slug: `${PREFIJO}mia` },
      select: {
        id: true,
        nombre: true,
        estado: true,
        memberships: { select: { userId: true } },
        storefrontPages: { select: { slug: true, publishedJson: true } },
      },
    });
    expect(tenant.nombre).toBe("Mi tienda nueva");
    // Nace SIN publicar: el MCP no puede publicarla (no existe la tool) y tampoco la crea publicada.
    expect(tenant.estado).toBe("CONFIGURACION");
    // La membresía es del dueño del TOKEN, no de un userId de input (no hay tal argumento).
    expect(tenant.memberships.map((m) => m.userId)).toEqual([user.id]);
    // Y nace con su página, en la misma transacción del use case.
    expect(tenant.storefrontPages.map((p) => p.slug)).toEqual(["home"]);

    // Segunda vez con el MISMO contexto (membresías vacías, como las cargó la request anterior):
    // el guard autoritativo recuenta DENTRO de la tx, así que un snapshot viejo no lo esquiva.
    await expect(
      tool("crear_tienda").manejar(
        { direccion: `${PREFIJO}otra`, nombre: "Otra más" },
        ctx,
      ),
    ).rejects.toThrow();
    expect(await db.tenant.count({ where: { slug: `${PREFIJO}otra` } })).toBe(0);

    // Una dirección que no es un subdominio válido se rechaza con un error legible.
    await expect(
      tool("crear_tienda").manejar(
        { direccion: "Mi Tienda!", nombre: "Inválida" },
        ctx,
      ),
    ).rejects.toThrow();
  });

  // mcp.tools.061 — D8/I2: el secreto entra, se cifra, y no vuelve a salir por ninguna puerta
  it("guardar_credencial_flow cifra at-rest y ninguna respuesta contiene el secreto", async () => {
    const { user, ctx } = await usuarioSinTienda();
    await tool("crear_tienda").manejar(
      { direccion: `${PREFIJO}mia`, nombre: "Mi tienda" },
      ctx,
    );
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { slug: `${PREFIJO}mia` },
      select: { id: true, slug: true },
    });
    // El contexto de la request SIGUIENTE ya trae la membresía recién creada.
    const ctxConTienda: ContextoMcp = {
      ...ctx,
      membresias: [{ tenantId: tenant.id, slug: tenant.slug }],
    };
    expect(user.id).toBe(ctxConTienda.userId);

    const respuesta = await tool("guardar_credencial_flow").manejar(
      {
        tienda: tenant.slug,
        apiKey: API_KEY,
        secretKey: SECRET_KEY,
        modoPruebas: true,
      },
      ctxConTienda,
    );

    // 1) La columna quedó CIFRADA: el ciphertext no contiene el marcador en claro.
    const cred = await db.flowCredential.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      select: { apiKeyCifrada: true, secretKeyCifrada: true, sandbox: true },
    });
    expect(cred.sandbox).toBe(true);
    expect(cred.apiKeyCifrada).not.toContain(API_KEY);
    expect(cred.secretKeyCifrada).not.toContain(SECRET_KEY);
    expect(cred.apiKeyCifrada.length).toBeGreaterThan(0);

    // 2) La respuesta de la tool tampoco: es lo único que vuelve al contexto del LLM.
    const serializada = JSON.stringify(respuesta);
    expect(serializada).not.toContain(API_KEY);
    expect(serializada).not.toContain(SECRET_KEY);

    // 3) Ni el estado que el agente puede consultar después (ni en claro ni cifrado).
    const estado = JSON.stringify(
      await tool("estado_flow").manejar({ tienda: tenant.slug }, ctxConTienda),
    );
    expect(estado).not.toContain(API_KEY);
    expect(estado).not.toContain(SECRET_KEY);
    expect(estado).not.toContain(cred.apiKeyCifrada);
    expect(estado).not.toContain(cred.secretKeyCifrada);
    expect(estado).toContain("true"); // sí dice que está configurada
  });
});
