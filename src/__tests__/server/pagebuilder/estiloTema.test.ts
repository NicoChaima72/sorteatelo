import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import {
  OverlayNodeSchema,
  PageDocumentSchema,
  SeccionNodeSchema,
  TemaSchema,
} from "~/lib/pagebuilder/schema";
import {
  EstiloSeccionSchema,
  ICONOS_BENEFICIO,
  ICONOS_PASO,
} from "~/lib/pagebuilder/widgets";
import { DomainError } from "~/server/domain/errors";
import { aplicarMutacion } from "~/server/domain/pagebuilder/mutaciones";

/**
 * Tests del sistema de estilo transversal (catálogo-v2 F01/D2/D3, síntesis §3): `estiloSeccion` en el
 * envelope del nodo, `TemaPagina` poblando root.props, y las mutaciones `set_section_style` /
 * `set_page_theme`. Todo ADITIVO-OPCIONAL ⇒ migración no-op (un doc sin estilo parsea idéntico).
 */

const base = () =>
  documentoInicial({ heroTitulo: null, heroSubtitulo: null, heroImageUrl: null });

/** Corre `fn` y devuelve el `code` del `DomainError` que lanza (o falla si no lanza uno). */
function codigoDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  throw new Error("se esperaba un DomainError y no se lanzó ninguno");
}

/** Documento golden con root.props VACÍO (docs pre-catálogo-v2). */
const GOLDEN_VACIO = {
  schemaVersion: 1,
  root: { props: {} },
  secciones: [
    { id: "sec-hero", tipo: "hero", v: 1, props: { titulo: "Hola", ctaAncla: "catalogo", mostrarBadgeSorteo: true } },
  ],
  overlays: [],
};

describe("pagebuilder/estiloSeccion — envelope de sección (F01)", () => {
  // estilo.001 — un nodo CON estilo válido parsea contra la union de secciones
  it("un nodo de sección con estilo válido parsea", () => {
    const nodo = {
      id: "s1",
      tipo: "hero",
      v: 1,
      props: { titulo: "Hola" },
      estilo: {
        fondo: { tipo: "esquema", esquema: "marca" },
        padY: "xl",
        divisorInferior: { forma: "onda", altura: "l" },
      },
    };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
  });

  // estilo.002 — estilo con enum fuera de rango / hex crudo / campo extra ⇒ rechazo (.strict)
  it("rechaza esquema fuera de rango, hex crudo y campo extra en el estilo", () => {
    // esquema inexistente
    expect(EstiloSeccionSchema.safeParse({ fondo: { tipo: "esquema", esquema: "neon" } }).success).toBe(false);
    // hex crudo (no existe un campo de color libre)
    expect(EstiloSeccionSchema.safeParse({ fondo: { tipo: "esquema", esquema: "#ff0000" } }).success).toBe(false);
    expect(EstiloSeccionSchema.safeParse({ colorFondo: "#ff0000" }).success).toBe(false);
    // campo extra en el envelope de estilo
    expect(EstiloSeccionSchema.safeParse({ padY: "l", customCss: "x" }).success).toBe(false);
    // padY fuera de rango
    expect(EstiloSeccionSchema.safeParse({ padY: "gigante" }).success).toBe(false);
    // un estilo vacío es válido (todos los defaults)
    expect(EstiloSeccionSchema.safeParse({}).success).toBe(true);
  });

  // estilo.003 — los overlays NO admiten estilo (envelope pelado)
  it("los overlays no admiten estilo", () => {
    const overlayConEstilo = {
      id: "ov",
      tipo: "aviso_barra",
      v: 1,
      props: { texto: "Hola" },
      estilo: { padY: "l" },
    };
    expect(OverlayNodeSchema.safeParse(overlayConEstilo).success).toBe(false);
    // sin estilo ⇒ OK
    expect(
      OverlayNodeSchema.safeParse({ id: "ov", tipo: "aviso_barra", v: 1, props: { texto: "Hola" } }).success,
    ).toBe(true);
  });
});

describe("pagebuilder/TemaPagina — root.props (F01)", () => {
  // tema.001 — root.props:{} parsea y Zod rellena todos los defaults (migración no-op)
  it("root.props:{} parsea y rellena los defaults del TemaSchema", () => {
    const res = TemaSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toEqual({
        modo: "claro",
        radio: "m",
        vibe: "suave",
        tipografia: "plataforma",
        anchoContenido: "contenido",
        fondoPagina: "superficie",
      });
    }
  });

  // tema.002 — el golden doc con root.props:{} sigue parseando (sin bump de schemaVersion)
  it("el golden doc con root.props:{} sigue parseando sin cambios (no-op)", () => {
    const res = PageDocumentSchema.safeParse(GOLDEN_VACIO);
    expect(res.success).toBe(true);
    if (res.success) {
      // schemaVersion sigue siendo 1 (no hubo bump)
      expect(res.data.schemaVersion).toBe(1);
      // el tema se rellenó con defaults
      expect(res.data.root.props.modo).toBe("claro");
    }
  });

  // tema.003 — tema con enum inválido ⇒ rechazo; campo desconocido ⇒ rechazo (.strict)
  it("rechaza un tema con modo inválido o campo desconocido", () => {
    expect(TemaSchema.safeParse({ modo: "sepia" }).success).toBe(false);
    expect(TemaSchema.safeParse({ colorPrimario: "#fff" }).success).toBe(false); // NO se duplica al doc
    expect(TemaSchema.safeParse({ tipografia: "comic_sans" }).success).toBe(false);
  });
});

describe("pagebuilder/mutaciones de estilo (F01)", () => {
  // mut.style.001 — set_section_style escribe el estilo por id y revalida el doc completo
  it("set_section_style escribe el estilo del nodo y el documento parsea", () => {
    const nuevo = aplicarMutacion(base(), {
      accion: "set_section_style",
      id: "sec-hero",
      estilo: { fondo: { tipo: "esquema", esquema: "marca" }, padY: "xl" },
    });
    const hero = nuevo.secciones.find((s) => s.id === "sec-hero")!;
    expect(hero.estilo?.fondo).toEqual({ tipo: "esquema", esquema: "marca" });
    expect(hero.estilo?.padY).toBe("xl");
    expect(PageDocumentSchema.safeParse(nuevo).success).toBe(true);
  });

  // mut.style.002 — id inexistente ⇒ NOT_FOUND
  it("set_section_style con id inexistente ⇒ NOT_FOUND", () => {
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), { accion: "set_section_style", id: "nope", estilo: {} }),
      ),
    ).toBe("NOT_FOUND");
  });

  // mut.style.003 — estilo inválido ⇒ INVALID sin mutar
  it("set_section_style con estilo inválido ⇒ INVALID", () => {
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), {
          accion: "set_section_style",
          id: "sec-hero",
          estilo: { fondo: { tipo: "esquema", esquema: "neon_libre" } },
        }),
      ),
    ).toBe("INVALID");
  });

  // mut.style.004 — set_page_theme escribe root.props validado
  it("set_page_theme escribe el tema y el documento parsea", () => {
    const nuevo = aplicarMutacion(base(), {
      accion: "set_page_theme",
      tema: { modo: "oscuro", tipografia: "editorial", radio: "l" },
    });
    expect(nuevo.root.props.modo).toBe("oscuro");
    expect(nuevo.root.props.tipografia).toBe("editorial");
    expect(nuevo.root.props.radio).toBe("l");
    expect(PageDocumentSchema.safeParse(nuevo).success).toBe(true);
  });

  // mut.style.005 — tema inválido ⇒ INVALID sin mutar
  it("set_page_theme con tema inválido ⇒ INVALID", () => {
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), { accion: "set_page_theme", tema: { modo: "fucsia" } }),
      ),
    ).toBe("INVALID");
  });
});

describe("pagebuilder/ICONOS_BENEFICIO (F01)", () => {
  // iconos.001 — ICONOS_BENEFICIO es superset de ICONOS_PASO
  it("ICONOS_BENEFICIO contiene todos los ICONOS_PASO (superset)", () => {
    for (const icono of ICONOS_PASO) {
      expect(ICONOS_BENEFICIO).toContain(icono);
    }
    // y tiene más (los propios del catálogo de beneficios)
    expect(ICONOS_BENEFICIO.length).toBeGreaterThan(ICONOS_PASO.length);
  });
});
