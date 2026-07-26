import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import {
  ESQUEMAS_FONDO,
  PARES_TIPOGRAFICOS,
  PRESETS_ENTRADA,
  TIPOS_SECCION,
  WIDGET_REGISTRY,
} from "~/lib/pagebuilder/widgets";
import {
  listarOpcionesEstilo,
  listarTiposWidget,
  outlineDe,
} from "~/server/domain/pagebuilder/catalogoDelEditor";

/**
 * Descriptores de solo-lectura del builder (`domain/pagebuilder/catalogoDelEditor`): el outline de un
 * documento y el catálogo de tipos/opciones que el asistente de IA usa para razonar sobre la página.
 *
 * Vivían en `~/server/mcp/tools` hasta el retiro del rol Operador (`plataforma-retiro-operador` F01/D8);
 * al morir el MCP se reubicaron acá con su cobertura. Son PUROS: no tocan db, env ni sesión.
 */

const doc = () =>
  documentoInicial({ heroTitulo: "Hola", heroSubtitulo: null, heroImageUrl: null });

describe("catalogoDelEditor — outlineDe", () => {
  // page.catalogo.001 — outline numerado por posición, con el tipo y el id de cada sección
  it("numera las secciones por posición con su tipo e id, y avisa cuando no hay ninguna", () => {
    const documento = doc();
    const outline = outlineDe(documento);

    const lineas = outline.split("\n");
    expect(lineas).toHaveLength(documento.secciones.length);
    lineas.forEach((linea, i) => {
      const seccion = documento.secciones[i]!;
      expect(linea).toBe(`${i}. ${seccion.tipo} · id=${seccion.id}`);
    });

    expect(outlineDe({ ...documento, secciones: [] })).toBe("(sin secciones)");
  });
});

describe("catalogoDelEditor — listarTiposWidget", () => {
  // page.catalogo.002 — enumera TODOS los tipos de la fuente única con categoría, versión y defaults
  it("espeja los tipos de sección de la fuente única con sus defaultProps", () => {
    const tipos = listarTiposWidget();

    expect(tipos.map((t) => t.tipo)).toEqual([...TIPOS_SECCION]);
    for (const t of tipos) {
      const entrada = WIDGET_REGISTRY[t.tipo];
      expect(t.categoria).toBe(entrada.categoria);
      expect(t.v).toBe(entrada.v);
      expect(t.defaultProps).toStrictEqual(entrada.defaultProps);
    }
  });
});

describe("catalogoDelEditor — listarOpcionesEstilo", () => {
  // page.catalogo.003 (migrado de mcp.style.003) — espeja los enums de la fuente única con
  // descripción por valor: el asistente elige por INTENCIÓN NOMBRADA, jamás hex ni CSS libre.
  it("espeja los enums de la fuente única con descripción por valor", () => {
    const opts = listarOpcionesEstilo();

    // Los valores salen del enum de widgets.ts (fuente única), no de una lista a mano.
    expect(opts.estiloSeccion.fondoEsquema.map((o) => o.valor)).toEqual([...ESQUEMAS_FONDO]);
    expect(opts.estiloSeccion.entrada.map((o) => o.valor)).toEqual([...PRESETS_ENTRADA]);
    expect(opts.temaPagina.tipografia.map((o) => o.valor)).toEqual([...PARES_TIPOGRAFICOS]);
    expect(opts.temaPagina.fondoPagina.map((o) => o.valor)).toEqual([...ESQUEMAS_FONDO]);

    // Cada opción de cada dimensión tiene una descripción NO vacía (una línea).
    const dimensiones = [
      ...Object.values(opts.estiloSeccion),
      ...Object.values(opts.temaPagina),
    ];
    for (const dim of dimensiones) {
      for (const o of dim) {
        expect(o.descripcion.length, `descripción de "${o.valor}"`).toBeGreaterThan(0);
      }
    }
  });
});
