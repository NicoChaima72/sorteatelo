import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { PageDocumentSchema } from "~/lib/pagebuilder/schema";
import { DomainError } from "~/server/domain/errors";
import { aplicarMutacion } from "~/server/domain/pagebuilder/mutaciones";

/**
 * Tests del transform PURO `aplicarMutacion` (F04, ADR-0016). Cada mutación deja un documento que
 * PARSEA; una mutación inválida lanza `DomainError` y NO muta nada (el caller no escribe). Sin DB.
 */

const base = () => documentoInicial({ heroTitulo: null, heroSubtitulo: null, heroImageUrl: null });

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
const idsDe = (doc: { secciones: { id: string }[] }) => doc.secciones.map((s) => s.id);
const tiposDe = (doc: { secciones: { tipo: string }[] }) => doc.secciones.map((s) => s.tipo);

describe("pagebuilder/aplicarMutacion (transform puro)", () => {
  // page.mut.001 — add_section agrega una sección válida (con defaultProps) que parsea
  it("add_section agrega una sección con sus defaultProps y el documento parsea", () => {
    const doc = base();
    const antes = doc.secciones.length;
    const nuevo = aplicarMutacion(doc, { accion: "add_section", tipo: "catalogo" });
    expect(nuevo.secciones).toHaveLength(antes + 1);
    expect(tiposDe(nuevo)[antes]).toBe("catalogo"); // al final por defecto
    expect(PageDocumentSchema.safeParse(nuevo).success).toBe(true);
  });

  it("add_section respeta la posición y mezcla props override sobre los defaults", () => {
    const nuevo = aplicarMutacion(base(), {
      accion: "add_section",
      tipo: "catalogo",
      posicion: 0,
      props: { titulo: "Destacados", columnas: 2 },
    });
    expect(tiposDe(nuevo)[0]).toBe("catalogo");
    const cat = nuevo.secciones[0]!;
    if (cat.tipo === "catalogo") {
      expect(cat.props.titulo).toBe("Destacados");
      expect(cat.props.columnas).toBe(2);
      expect(cat.props.modo).toBe("todos"); // default preservado
    }
  });

  // page.mut.008 — add_section con tipo desconocido ⇒ INVALID
  it("add_section con tipo desconocido ⇒ INVALID sin mutar", () => {
    expect(
      codigoDe(() => aplicarMutacion(base(), { accion: "add_section", tipo: "banner_html" })),
    ).toBe("INVALID");
  });

  // page.mut.007 — add_section con props fuera de shape ⇒ INVALID (revalida el doc completo)
  it("add_section con props fuera de shape ⇒ INVALID", () => {
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), {
          accion: "add_section",
          tipo: "hero",
          props: { titulo: "x".repeat(500) },
        }),
      ),
    ).toBe("INVALID");
  });

  // page.mut.002 — move_section reordena por id
  it("move_section reordena la sección al destino", () => {
    const doc = base(); // [hero, catalogo, sorteo_vitrina, como_funciona]
    const nuevo = aplicarMutacion(doc, { accion: "move_section", id: "sec-hero", aPosicion: 2 });
    expect(idsDe(nuevo)).toEqual(["sec-catalogo", "sec-sorteo", "sec-hero", "sec-como-funciona"]);
  });

  it("move_section con id inexistente ⇒ NOT_FOUND", () => {
    expect(
      codigoDe(() => aplicarMutacion(base(), { accion: "move_section", id: "nope", aPosicion: 0 })),
    ).toBe("NOT_FOUND");
  });

  // page.mut.003 — remove_section quita por id; id inexistente ⇒ NOT_FOUND
  it("remove_section quita la sección por id y el resto parsea", () => {
    const nuevo = aplicarMutacion(base(), { accion: "remove_section", id: "sec-sorteo" });
    expect(idsDe(nuevo)).toEqual(["sec-hero", "sec-catalogo", "sec-como-funciona"]);
    expect(PageDocumentSchema.safeParse(nuevo).success).toBe(true);
  });

  it("remove_section con id inexistente ⇒ NOT_FOUND", () => {
    expect(
      codigoDe(() => aplicarMutacion(base(), { accion: "remove_section", id: "nope" })),
    ).toBe("NOT_FOUND");
  });

  // page.mut.004 — update_section_props hace merge; id inexistente ⇒ NOT_FOUND
  it("update_section_props mergea las props de la sección", () => {
    const nuevo = aplicarMutacion(base(), {
      accion: "update_section_props",
      id: "sec-hero",
      props: { titulo: { children: [{ t: "Nuevo título" }] } }, // titulo es RichTexto (Tanda 3 F02)
    });
    const hero = nuevo.secciones.find((s) => s.id === "sec-hero")!;
    if (hero.tipo === "hero") {
      expect(hero.props.titulo?.children[0]?.t).toBe("Nuevo título");
      expect(hero.props.mostrarBadgeSorteo).toBe(true); // default preservado (merge)
    }
  });

  it("update_section_props con props inválidas ⇒ INVALID sin mutar", () => {
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), {
          accion: "update_section_props",
          id: "sec-catalogo",
          props: { columnas: 5 },
        }),
      ),
    ).toBe("INVALID");
  });

  // page.mut.005 — set_theme: {} ok; props no-vacías ⇒ INVALID (tema vacío en esta fase)
  it("set_theme con {} es válido; con props no-vacías ⇒ INVALID", () => {
    expect(PageDocumentSchema.safeParse(aplicarMutacion(base(), { accion: "set_theme", props: {} })).success).toBe(true);
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), { accion: "set_theme", props: { colorPrimario: "#fff" } }),
      ),
    ).toBe("INVALID");
  });

  // page.mut.006 — apply_page reemplaza el documento entero; inválido ⇒ INVALID
  it("apply_page reemplaza el documento entero cuando el nuevo parsea", () => {
    const doc = base();
    const nuevoDoc = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [{ id: "solo-hero", tipo: "hero", v: 3, props: { titulo: { children: [{ t: "Único" }] } } }],
      overlays: [],
    };
    const res = aplicarMutacion(doc, { accion: "apply_page", documento: nuevoDoc });
    expect(idsDe(res)).toEqual(["solo-hero"]);
  });

  it("apply_page con un documento inválido ⇒ INVALID", () => {
    expect(
      codigoDe(() =>
        aplicarMutacion(base(), {
          accion: "apply_page",
          documento: { schemaVersion: 1, root: { props: {} }, secciones: [{ id: "x", tipo: "html", v: 1, props: {} }], overlays: [] },
        }),
      ),
    ).toBe("INVALID");
  });
});
