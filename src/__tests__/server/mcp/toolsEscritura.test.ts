import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { TOOLS } from "~/server/mcp/tools/registro";
import { db } from "~/server/db";

/**
 * Tools de ESCRITURA (F05 configuración + F06 productos y sorteo) contra DB real.
 *
 * Dos cosas se verifican acá y en ningún otro lado:
 *
 * 1. **`configurar_tienda` hace MERGE, no reemplazo.** El use case del panel escribe las 7
 *    columnas de una (el formulario siempre las manda todas). Si la tool se lo pasara tal cual,
 *    "cámbiame el color" borraría el Instagram, el WhatsApp y la descripción, y el agente
 *    respondería "listo". Es el riesgo de pérdida de datos más concreto de todo el MCP.
 * 2. **El precio viaja como string y aterriza como `Decimal` exacto.** Un número generado por un
 *    LLM que pase por el double de JSON es precisamente lo que la regla de oro prohíbe.
 */

const PREFIJO = "test-mcp-escritura-";

async function limpiar() {
  await db.checkoutField.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.product.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.raffle.deleteMany({
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
      descripcion: "La descripción original",
      instagramUrl: "https://instagram.com/original",
      contactoEmail: "hola@original.cl",
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
  return { ctx, tenant };
}

describe("mcp/tools de escritura (DB-backed)", () => {
  // mcp.tools.040 — el merge: cambiar UN campo no puede borrar los otros seis
  it("configurar_tienda cambia solo lo que recibe y conserva el resto", async () => {
    const { ctx, tenant } = await montarEscenario();

    await tool("configurar_tienda").manejar(
      { tienda: tenant.slug, colorPrimario: "#2b3fbf" },
      ctx,
    );

    const despues = await db.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      select: {
        colorPrimario: true,
        descripcion: true,
        instagramUrl: true,
        contactoEmail: true,
      },
    });

    expect(despues.colorPrimario).toBe("#2b3fbf"); // lo pedido cambió…
    // …y NADA más se perdió. Este es el test que impide la regresión de pérdida de datos.
    expect(despues.descripcion).toBe("La descripción original");
    expect(despues.instagramUrl).toBe("https://instagram.com/original");
    expect(despues.contactoEmail).toBe("hola@original.cl");

    // Borrar sigue siendo posible, pero solo si se pide EXPLÍCITAMENTE con cadena vacía.
    await tool("configurar_tienda").manejar(
      { tienda: tenant.slug, instagramUrl: "" },
      ctx,
    );
    const trasBorrar = await db.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      select: { instagramUrl: true, colorPrimario: true },
    });
    expect(trasBorrar.instagramUrl).toBeNull();
    expect(trasBorrar.colorPrimario).toBe("#2b3fbf"); // el resto sigue intacto
  });

  // mcp.tools.041 — dinero: string en la interfaz, Decimal exacto en la columna
  it("crear_producto guarda el precio como Decimal exacto y valida server-side", async () => {
    const { ctx, tenant } = await montarEscenario();

    await tool("crear_producto").manejar(
      {
        tienda: tenant.slug,
        titulo: "Libro digital",
        descripcion: "Un PDF precioso",
        precio: "19990",
        participaEnSorteo: true,
      },
      ctx,
    );

    const producto = await db.product.findFirstOrThrow({
      where: { tenantId: tenant.id },
      select: { precio: true, titulo: true, participaEnSorteo: true, pdfPath: true },
    });
    expect(producto.precio).toBeInstanceOf(Prisma.Decimal);
    expect(producto.precio.equals(new Prisma.Decimal("19990"))).toBe(true);
    expect(producto.participaEnSorteo).toBe(true);
    // Nace SIN archivo: no hay tool que suba binarios, el PDF se sube desde el panel.
    expect(producto.pdfPath).toBeNull();

    // Un precio basura lo rechaza la MISMA validación del panel, no una del borde.
    await expect(
      tool("crear_producto").manejar(
        {
          tienda: tenant.slug,
          titulo: "Malo",
          descripcion: "x",
          precio: "diecinueve mil",
          participaEnSorteo: false,
        },
        ctx,
      ),
    ).rejects.toThrow();
  });

  // mcp.tools.042 — el guard 1-ACTIVO del dominio aplica igual desde el MCP
  it("crear_sorteo respeta el guard de un solo sorteo activo y editar_sorteo resuelve el vigente", async () => {
    const { ctx, tenant } = await montarEscenario();

    await tool("crear_sorteo").manejar(
      {
        tienda: tenant.slug,
        nombre: "Sorteo de lanzamiento",
        premio: "Un póster firmado",
        fechaFin: "2027-01-31T23:59:00.000Z",
      },
      ctx,
    );

    // Un segundo sorteo activo no se puede: el guard vive en el use case y el MCP no lo esquiva.
    await expect(
      tool("crear_sorteo").manejar(
        {
          tienda: tenant.slug,
          nombre: "Otro más",
          premio: "Otra cosa",
          fechaFin: "2027-02-28T23:59:00.000Z",
        },
        ctx,
      ),
    ).rejects.toThrow();

    // `editar_sorteo` no recibe id: resuelve solo el sorteo vigente de la tienda.
    await tool("editar_sorteo").manejar(
      {
        tienda: tenant.slug,
        nombre: "Sorteo de lanzamiento (editado)",
        premio: "Un póster firmado y dedicado",
        fechaFin: "2027-03-15T23:59:00.000Z",
      },
      ctx,
    );

    const raffles = await db.raffle.findMany({
      where: { tenantId: tenant.id },
      select: { nombre: true, premio: true, ejecutadoAt: true },
    });
    expect(raffles).toHaveLength(1);
    expect(raffles[0]?.nombre).toBe("Sorteo de lanzamiento (editado)");
    expect(raffles[0]?.ejecutadoAt).toBeNull(); // el MCP no puede ejecutarlo, y no lo hizo
  });

  // mcp.tools.043 — los campos de checkout pasan por las validaciones del panel
  it("crear_campo_checkout aplica las reglas del panel y desactivar no pierde el campo", async () => {
    const { ctx, tenant } = await montarEscenario();

    // Un SELECT sin opciones es un campo imposible de responder: lo rechaza el schema del panel.
    await expect(
      tool("crear_campo_checkout").manejar(
        {
          tienda: tenant.slug,
          etiqueta: "Talla",
          tipo: "SELECT",
          obligatorio: true,
          opciones: [],
        },
        ctx,
      ),
    ).rejects.toThrow();

    await tool("crear_campo_checkout").manejar(
      {
        tienda: tenant.slug,
        etiqueta: "Talla",
        tipo: "SELECT",
        obligatorio: true,
        opciones: ["S", "M", "L"],
      },
      ctx,
    );

    const campo = await db.checkoutField.findFirstOrThrow({
      where: { tenantId: tenant.id },
      select: { id: true, clave: true, activo: true, opciones: true },
    });
    // La clave la DERIVA el server desde la etiqueta: el agente no la elige (ni podría).
    expect(campo.clave.length).toBeGreaterThan(0);
    expect(campo.opciones).toEqual(["S", "M", "L"]);

    // Desactivar es reversible y conserva la fila: es la alternativa a borrar (que no existe).
    await tool("activar_campo_checkout").manejar(
      { tienda: tenant.slug, campoId: campo.id, activo: false },
      ctx,
    );
    const trasDesactivar = await db.checkoutField.findUniqueOrThrow({
      where: { id: campo.id },
      select: { activo: true },
    });
    expect(trasDesactivar.activo).toBe(false);
  });
});
