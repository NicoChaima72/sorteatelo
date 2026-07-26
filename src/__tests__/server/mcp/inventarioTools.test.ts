import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  definirToolDeTienda,
  vieneDeFactory,
} from "~/server/mcp/tools/definirTool";
import { TOOLS } from "~/server/mcp/tools/registro";

/**
 * Salud estructural del inventario de tools (I3). El registro ES la whitelist de lo que un agente
 * puede hacer en la cuenta de un Organizador, así que se audita como tal: qué hay, y sobre todo
 * qué NO puede aparecer nunca.
 */

/**
 * Los cuatro límites duros del plan (D7/I3). No son deuda: son diseño, y esta lista es el guard
 * que impide que se erosionen por descuido.
 *
 * - **publicar** (tienda o página): ADR-0018 puso un checkpoint humano justamente contra los
 *   editores automáticos; el MCP es uno.
 * - **ejecutar el sorteo**: irreversible, elige un ganador real, responsabilidad legal del
 *   Organizador (ADR-0008).
 * - **borrar**: nada se borra por chat (hay desactivar, que es reversible).
 * - **leer credenciales**: escribir Flow sí (D8, write-only); leerlo, jamás (ADR-0006).
 */
const PROHIBIDO = [
  /publicar/,
  /despublicar/,
  /ejecutar/,
  /^borrar|_borrar|eliminar/,
  /credencial.*(leer|ver)|ver_credencial|leer_credencial/,
];

describe("mcp/inventario de tools", () => {
  // mcp.tools.030 — LOS LÍMITES DUROS. Si este test se pone rojo, alguien le dio al agente una
  // capacidad que el plan decidió no darle: no lo "arregles" tocando la regex.
  it("no expone ninguna tool de publicar, ejecutar el sorteo, borrar ni leer credenciales", () => {
    for (const tool of TOOLS) {
      for (const prohibido of PROHIBIDO) {
        expect(
          prohibido.test(tool.nombre),
          `la tool "${tool.nombre}" cae en un límite duro del plan (${String(prohibido)})`,
        ).toBe(false);
      }
    }

    // Por nombre exacto, para que se lea sin interpretar regex.
    const nombres = TOOLS.map((t) => t.nombre);
    expect(nombres).not.toContain("ejecutar_sorteo");
    expect(nombres).not.toContain("publicar_tienda");
    expect(nombres).not.toContain("publicar_pagina");
    expect(nombres).not.toContain("borrar_producto");
    expect(nombres).not.toContain("borrar_campo_checkout");
    expect(nombres).not.toContain("ver_credencial_flow");
  });

  // mcp.tools.031 — inventario NOMINAL completo: agregar una capacidad es un cambio consciente
  it("expone exactamente el toolset acordado", () => {
    expect(TOOLS.map((t) => t.nombre).sort()).toEqual(
      [
        // F04 — lectura
        "mis_tiendas",
        "estado_tienda",
        "listar_ventas",
        "ver_sorteo",
        "estado_flow",
        "ver_pagina",
        // F05 — configuración
        "ver_configuracion",
        "configurar_tienda",
        "listar_campos_checkout",
        "crear_campo_checkout",
        "editar_campo_checkout",
        "activar_campo_checkout",
        "reordenar_campos_checkout",
        // F06 — productos y sorteo
        "listar_productos",
        "crear_producto",
        "actualizar_producto",
        "crear_sorteo",
        "editar_sorteo",
        // F07 — página (solo el Borrador; publicar no existe)
        "ver_catalogo_de_secciones",
        "agregar_seccion",
        "editar_seccion",
        "mover_seccion",
        "quitar_seccion",
        "cambiar_estilo_seccion",
        "cambiar_tema_pagina",
        // F08 — cuenta (Flow es write-only, D8)
        "crear_tienda",
        "guardar_credencial_flow",
      ].sort(),
    );
  });

  // mcp.tools.020 — nombres únicos: con las tools repartidas en varios archivos, un copy-paste
  // duplicado no falla hasta que el SDK revienta al registrar en runtime
  it("no tiene nombres repetidos", () => {
    const nombres = TOOLS.map((t) => t.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  // mcp.tools.021 — TODA tool pasó por una factory ⇒ TODA tool autoriza
  it("todas las tools salieron de las factories (y por lo tanto autorizan)", () => {
    const sinSellar = TOOLS.filter((t) => !vieneDeFactory(t)).map((t) => t.nombre);
    expect(sinSellar).toEqual([]);
  });

  // mcp.tools.022 — toda tool de tienda pide `tienda`; ninguna de cuenta lo pide
  it("el argumento `tienda` está exactamente en las tools de ámbito tienda", () => {
    for (const tool of TOOLS) {
      const pideTienda = "tienda" in tool.entrada;
      expect(
        pideTienda,
        `"${tool.nombre}" (ámbito ${tool.ambito}) ${pideTienda ? "pide" : "no pide"} tienda`,
      ).toBe(tool.ambito === "tienda");
    }
  });

  // mcp.tools.023 — la description es lo ÚNICO que el modelo lee: sin ella la tool es inusable
  it("todas tienen nombre snake_case, título y una descripción con sustancia", () => {
    for (const tool of TOOLS) {
      expect(tool.nombre, tool.nombre).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.titulo.length, tool.nombre).toBeGreaterThan(0);
      expect(tool.descripcion.length, tool.nombre).toBeGreaterThan(40);
    }
  });

  // mcp.tools.024 — el nombre `tienda` está reservado: colisionar revienta al definir, no en silencio
  it("rechaza una tool que declare su propio argumento `tienda`", () => {
    expect(() =>
      definirToolDeTienda({
        nombre: "colisiona",
        titulo: "Colisiona",
        descripcion: "Declara un argumento que el seam reserva.",
        entrada: { tienda: z.string() },
        manejar: async () => null,
      }),
    ).toThrow(/reserva/);
  });
});
