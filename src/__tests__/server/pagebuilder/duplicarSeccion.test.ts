import { describe, expect, it } from "vitest";

import { crearStack, deshacer, registrar, rehacer } from "~/lib/pagebuilder/historial-edicion";
import { PageDocumentSchema, type PageDocument } from "~/lib/pagebuilder/schema";
import { aplicarMutacion } from "~/server/domain/pagebuilder/mutaciones";

/**
 * Tests de duplicar sección + snapshot-stack de undo/redo (Tanda 3 F13/D20). `duplicate_section` es una
 * mutación PURA que clona el nodo con ids NUEVOS (incluidas las hojas de una fila) e inserta la copia
 * DESPUÉS del original; el doc resultante parsea y los ids son únicos. El stack de undo/redo es un helper
 * PURO con cap acotado; Publicar/rollback jamás participan (viven fuera del editor).
 */

function doc(secciones: unknown[]): PageDocument {
  return PageDocumentSchema.parse({
    schemaVersion: 1,
    root: { props: {} },
    secciones,
    overlays: [],
  });
}

describe("pagebuilder/duplicate_section (F13) — clonar con ids nuevos", () => {
  // page.dup.001 — clona el nodo con id NUEVO e inserta después del original
  it("duplica una sección con id nuevo, misma props, insertada tras el original", () => {
    const d = doc([
      { id: "a", tipo: "separador", v: 1, props: { estilo: "linea", tamano: "m" } },
      { id: "b", tipo: "espaciador", v: 1, props: { alto: "l" } },
    ]);
    const out = aplicarMutacion(d, { accion: "duplicate_section", id: "a" });
    expect(out.secciones.map((s) => s.tipo)).toEqual(["separador", "separador", "espaciador"]);
    const [orig, copia] = out.secciones;
    expect(copia!.id).not.toBe(orig!.id); // id nuevo
    expect(copia!.tipo).toBe("separador");
    expect(copia!.props).toEqual(orig!.props); // contenido idéntico
    // ids únicos en todo el doc
    const ids = out.secciones.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // page.dup.002 — al duplicar una FILA, las hojas también reciben ids NUEVOS (clon profundo)
  it("clona una fila regenerando también los ids de sus hojas (clon profundo)", () => {
    const hoja = (id: string) => ({
      id,
      tipo: "separador",
      v: 1,
      props: { estilo: "linea", tamano: "m" },
    });
    const d = doc([
      {
        id: "fila-1",
        tipo: "fila",
        v: 1,
        props: { reparto: "50_50", columnas: [[hoja("h1"), hoja("h2")], [hoja("h3")]] },
      },
    ]);
    const out = aplicarMutacion(d, { accion: "duplicate_section", id: "fila-1" });
    expect(out.secciones.length).toBe(2);
    const copia = out.secciones[1]!;
    expect(copia.tipo).toBe("fila");
    // todos los ids (fila + hojas) deben ser únicos entre original y copia
    const todos: string[] = [];
    for (const sec of out.secciones) {
      todos.push(sec.id);
      if (sec.tipo === "fila") for (const col of sec.props.columnas) for (const h of col) todos.push(h.id);
    }
    expect(new Set(todos).size).toBe(todos.length);
  });

  // page.dup.003 — id inexistente ⇒ NOT_FOUND, no muta
  it("duplicar un id inexistente lanza NOT_FOUND", () => {
    const d = doc([{ id: "a", tipo: "separador", v: 1, props: {} }]);
    expect(() => aplicarMutacion(d, { accion: "duplicate_section", id: "zzz" })).toThrow();
  });
});

describe("pagebuilder/historial-edicion (F13) — snapshot-stack undo/redo", () => {
  const s0 = "doc0";
  const s1 = "doc1";
  const s2 = "doc2";

  // page.hist.001 — registrar/deshacer/rehacer básico
  it("deshacer devuelve el snapshot anterior y rehacer lo recupera", () => {
    let stack = crearStack<string>();
    stack = registrar(stack, s0); // antes de aplicar s1
    stack = registrar(stack, s1); // antes de aplicar s2 (estado actual = s2)
    const undo = deshacer(stack, s2);
    expect(undo).not.toBeNull();
    expect(undo!.snapshot).toBe(s1);
    const redo = rehacer(undo!.stack, s1);
    expect(redo).not.toBeNull();
    expect(redo!.snapshot).toBe(s2);
  });

  // page.hist.002 — deshacer con stack vacío ⇒ null (no-op); una edición nueva limpia el futuro
  it("deshacer vacío ⇒ null; registrar tras un undo limpia el redo", () => {
    let stack = crearStack<string>();
    expect(deshacer(stack, s0)).toBeNull();
    stack = registrar(stack, s0);
    const undo = deshacer(stack, s1)!;
    // tras deshacer hay futuro (redo disponible)
    expect(rehacer(undo.stack, s0)).not.toBeNull();
    // pero una edición NUEVA (registrar) limpia el futuro ⇒ redo ya no aplica
    const trasEditar = registrar(undo.stack, s0);
    expect(rehacer(trasEditar, s0)).toBeNull();
  });

  // page.hist.003 — cap acotado: el stack no crece sin límite
  it("respeta el cap del pasado (descarta lo más viejo)", () => {
    let stack = crearStack<number>(3);
    for (let i = 0; i < 10; i++) stack = registrar(stack, i);
    expect(stack.pasado.length).toBe(3);
    // el pasado conserva los 3 MÁS RECIENTES (7,8,9)
    expect(stack.pasado).toEqual([7, 8, 9]);
  });
});
