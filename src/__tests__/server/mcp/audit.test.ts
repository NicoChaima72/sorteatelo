import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ejecutarToolAuditada } from "~/server/mcp/audit";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { type ToolMcp } from "~/server/mcp/tools/definirTool";
import { TOOLS } from "~/server/mcp/tools/registro";
import { db } from "~/server/db";

/**
 * `McpAuditLog` (F10, D11/I7) contra DB real: **toda** invocación de tool deja una fila, con los
 * argumentos sanitizados.
 *
 * Es el registro de qué hizo el agente en la cuenta de una persona. Dos propiedades:
 * - **Toda** invocación, no solo las exitosas: un intento rechazado (una tienda ajena, un precio
 *   inválido) es justamente lo que se quiere poder ver después.
 * - **Ni un secreto**: `guardar_credencial_flow` es la única tool por la que entra un secreto (D8),
 *   y su fila no puede ser el lugar donde ese secreto quede en claro para siempre.
 */

const PREFIJO = "test-mcp-audit-";
const API_KEY = `${PREFIJO}APIKEY-NO-DEBE-QUEDAR-EN-EL-AUDIT`;
const SECRET_KEY = `${PREFIJO}SECRETO-NO-DEBE-QUEDAR-EN-EL-AUDIT`;

async function limpiar() {
  await db.mcpAuditLog.deleteMany({ where: { clientId: { startsWith: PREFIJO } } });
  await db.flowCredential.deleteMany({
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

async function montarEscenario() {
  const user = await db.user.create({
    data: { email: `${PREFIJO}org@example.cl`, name: "Org" },
    select: { id: true, email: true },
  });
  const tenant = await db.tenant.create({
    data: {
      slug: `${PREFIJO}tienda`,
      nombre: "Tienda de prueba",
      memberships: { create: { userId: user.id } },
    },
    select: { id: true, slug: true },
  });

  const ctx: ContextoMcp = {
    db,
    userId: user.id,
    email: user.email,
    clientId: `${PREFIJO}cli`,
    scopes: ["mcp"],
    membresias: [{ tenantId: tenant.id, slug: tenant.slug }],
  };
  return { user, ctx, tenant };
}

const filas = () =>
  db.mcpAuditLog.findMany({
    where: { clientId: { startsWith: PREFIJO } },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      userEmail: true,
      clientId: true,
      tool: true,
      args: true,
      result: true,
      errorCode: true,
    },
  });

describe("mcp/audit (DB-backed)", () => {
  // mcp.audit.010 — toda invocación deja fila: la que salió bien y la que falló, con su código
  it("registra el éxito y el rechazo de cada llamada, con quién la hizo", async () => {
    const { user, ctx, tenant } = await montarEscenario();

    await ejecutarToolAuditada({
      tool: tool("estado_tienda"),
      args: { tienda: tenant.slug },
      ctx,
    });
    // Una tienda que no es suya: rechazada por el seam de autorización, y IGUAL queda registrada.
    const rechazo = await ejecutarToolAuditada({
      tool: tool("estado_tienda"),
      args: { tienda: "una-tienda-ajena" },
      ctx,
    });
    expect(rechazo.isError).toBe(true);
    // Un precio basura: rechazo de validación, otro código.
    await ejecutarToolAuditada({
      tool: tool("crear_producto"),
      args: {
        tienda: tenant.slug,
        titulo: "Malo",
        descripcion: "x",
        precio: "diecinueve mil",
        participaEnSorteo: false,
      },
      ctx,
    });

    const registro = await filas();
    expect(registro).toHaveLength(3);
    expect(registro.map((f) => [f.tool, f.result, f.errorCode])).toEqual([
      ["estado_tienda", "OK", null],
      ["estado_tienda", "ERROR", "FORBIDDEN"],
      ["crear_producto", "ERROR", "INVALID"],
    ]);
    // Cada fila dice QUIÉN, con el correo legible aunque el User se borre después (sin FK, I7).
    expect(registro.every((f) => f.userId === user.id)).toBe(true);
    expect(registro.every((f) => f.userEmail === `${PREFIJO}org@example.cl`)).toBe(true);
    // Y el slug pedido queda visible: es lo que permite ver "intentó entrar a otra tienda".
    expect(registro[1]?.args).toContain("una-tienda-ajena");
  });

  // mcp.audit.011 — D8/I2: la fila de la única tool por la que entra un secreto no lo contiene
  it("no guarda las credenciales de Flow en la fila de auditoría", async () => {
    const { ctx, tenant } = await montarEscenario();

    const r = await ejecutarToolAuditada({
      tool: tool("guardar_credencial_flow"),
      args: {
        tienda: tenant.slug,
        apiKey: API_KEY,
        secretKey: SECRET_KEY,
        modoPruebas: true,
      },
      ctx,
    });
    expect(r.isError).toBeFalsy();

    const [fila] = await filas();
    expect(fila?.tool).toBe("guardar_credencial_flow");
    expect(fila?.result).toBe("OK");

    // Ni el secreto ni la api key, en ninguna parte de la fila.
    const completa = JSON.stringify(fila);
    expect(completa).not.toContain(API_KEY);
    expect(completa).not.toContain(SECRET_KEY);
    // Pero SÍ queda constancia de que la llamada traía esos campos, y sobre qué tienda.
    expect(fila?.args).toContain("[oculto]");
    expect(fila?.args).toContain(tenant.slug);
    expect(fila?.args).toContain("modoPruebas");
  });

  // mcp.audit.012 — auditar no puede ser un modo de falla NUEVO para el Organizador
  it("devuelve el resultado de la tool aunque el INSERT del audit falle", async () => {
    // No usa la DB: la unidad bajo prueba es el envoltorio, y lo que hay que provocar es
    // justamente que la escritura del audit explote. `db` es un stub con el único método que
    // `registrarInvocacion` toca, y falla como fallaría la DB caída.
    const ctx = {
      db: {
        mcpAuditLog: {
          create: () => Promise.reject(new Error("DB caída (a propósito)")),
        },
      },
      userId: "usr_stub",
      email: "org@example.cl",
      clientId: "cli_stub",
      scopes: ["mcp"],
      membresias: [],
    } as unknown as ContextoMcp;

    // Tool falsa (no pasa por las factories, a propósito): acá no se prueba la autorización sino
    // que el efecto YA HECHO por una tool no se pierda porque su rastro no se pudo escribir.
    const tool: ToolMcp = {
      nombre: "tool_de_prueba",
      titulo: "Prueba",
      descripcion: "Solo para este test.",
      entrada: {},
      ambito: "cuenta",
      manejar: () => Promise.resolve({ hecho: true }),
    };

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const r = await ejecutarToolAuditada({ tool, args: { a: 1 }, ctx });

      // El Organizador ve su resultado: la tool ya escribió, negarle la respuesta sería lo peor
      // de los dos mundos.
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r)).toContain("hecho");
      // Y el problema NO se traga en silencio: queda en el log del servidor, que es donde
      // alguien lo va a ver (una fila faltante es invisible por definición).
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
