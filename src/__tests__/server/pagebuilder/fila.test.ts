import { describe, expect, it } from "vitest";

import { migrarDocumento, leerDocumentoParaRender } from "~/lib/pagebuilder/migrate";
import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  COLUMNAS_POR_REPARTO,
  filaProps,
  HOJAS_FILA,
  MAX_HOJAS_POR_COLUMNA,
  NodoHojaSchema,
} from "~/lib/pagebuilder/widgets";
import {
  agregarHoja,
  cambiarReparto,
  crearHojaFila,
  moverHoja,
  quitarHoja,
} from "~/lib/pagebuilder/fila-edicion";

/**
 * Tests del widget `fila` con slots tipados (Tanda 3 F08/D13, evolución fila). La `fila` es una SECCIÓN
 * cuyo `props` contiene `columnas` de nodos-HOJA de una union whitelist SIN `fila` ⇒ recursión imposible
 * por construcción (I-U4, profundidad máx 2). Verifican: reparto↔columnas coherente (superRefine), cap de
 * hojas por columna, whitelist cerrada (hoja fuera de lista / fila dentro de fila ⇒ rechazo), y los helpers
 * PUROS de edición de columnas (agregar/quitar/reordenar/reparto → props nuevos, F09).
 */

/** Una hoja mínima válida (texto_rico) para poblar columnas en los tests. */
function hojaTexto(id = "h1") {
  return {
    id,
    tipo: "texto_rico" as const,
    v: 2,
    props: { bloques: [{ tipo: "parrafo", rico: { children: [{ t: "hola" }] } }] },
  };
}

describe("pagebuilder/fila (F08) — schema con slots tipados", () => {
  // page.fila.001 — reparto ↔ nº de columnas coherente (superRefine 2 o 3), .strict()
  it("filaProps valida reparto con el nº de columnas correcto y rechaza incoherencias", () => {
    // 2 columnas para 50_50 / 66_33 / 33_66
    expect(filaProps.safeParse({ reparto: "50_50", columnas: [[], []] }).success).toBe(true);
    expect(filaProps.safeParse({ reparto: "66_33", columnas: [[hojaTexto()], []] }).success).toBe(true);
    // 3 columnas para 33_33_33
    expect(filaProps.safeParse({ reparto: "33_33_33", columnas: [[], [], []] }).success).toBe(true);
    // reparto de 2 con 3 columnas ⇒ rechazo (superRefine)
    expect(filaProps.safeParse({ reparto: "50_50", columnas: [[], [], []] }).success).toBe(false);
    // reparto de 3 con 2 columnas ⇒ rechazo
    expect(filaProps.safeParse({ reparto: "33_33_33", columnas: [[], []] }).success).toBe(false);
    // reparto fuera del enum ⇒ rechazo
    expect(filaProps.safeParse({ reparto: "70_30", columnas: [[], []] }).success).toBe(false);
    // campo extra ⇒ rechazo (.strict)
    expect(filaProps.safeParse({ reparto: "50_50", columnas: [[], []], gap: "xl" }).success).toBe(false);
  });

  // page.fila.002 — cap de hojas por columna + whitelist cerrada + RECURSIÓN IMPOSIBLE
  it("rechaza >4 hojas por columna, hoja fuera de whitelist y una fila dentro de una fila", () => {
    // >MAX_HOJAS_POR_COLUMNA en una columna ⇒ rechazo
    const columnaLlena = Array.from({ length: MAX_HOJAS_POR_COLUMNA + 1 }, (_, i) => hojaTexto(`h${i}`));
    expect(filaProps.safeParse({ reparto: "50_50", columnas: [columnaLlena, []] }).success).toBe(false);
    // hoja de un tipo que NO está en la whitelist (p.ej. hero, catalogo) ⇒ rechazo
    const hojaProhibida = { id: "x", tipo: "hero", v: 3, props: {} };
    expect(filaProps.safeParse({ reparto: "50_50", columnas: [[hojaProhibida], []] }).success).toBe(false);
    // UNA FILA DENTRO DE UNA FILA ⇒ rechazo (recursión imposible por construcción, I-U4)
    const filaAnidada = { id: "f2", tipo: "fila", v: 1, props: { reparto: "50_50", columnas: [[], []] } };
    expect(filaProps.safeParse({ reparto: "50_50", columnas: [[filaAnidada], []] }).success).toBe(false);
    // NodoHojaSchema tampoco acepta `fila`
    expect(NodoHojaSchema.safeParse(filaAnidada).success).toBe(false);
  });

  // page.fila.003 — el nodo `fila` parsea contra la union de secciones y admite estilo/nav
  it("el nodo fila parsea contra SeccionNodeSchema (con estilo de sección propio)", () => {
    const nodo = {
      id: "fila-1",
      tipo: "fila",
      v: 1,
      props: { reparto: "66_33", columnas: [[hojaTexto()], [hojaTexto("h2")]] },
      estilo: { padY: "xl", fondo: { tipo: "esquema", esquema: "superficie" } },
    };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
  });

  // page.fila.004 — migración no-op: un doc sin fila no cambia; un leaf viejo dentro de fila migra
  it("migra recursivamente las hojas (leaf texto_rico v1 → v2) sin tocar docs sin fila", () => {
    // doc sin fila ⇒ migrarDocumento no rompe nada (no-op sobre la fila)
    const sinFila = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [{ id: "s", tipo: "separador", v: 1, props: {} }],
      overlays: [],
    };
    expect(leerDocumentoParaRender(sinFila).secciones.length).toBe(1);
    // un leaf texto_rico v1 (con `texto` string legacy) dentro de una fila migra a v2 (runs) on-read
    const conFilaLegacy = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [
        {
          id: "fila-1",
          tipo: "fila",
          v: 1,
          props: {
            reparto: "50_50",
            columnas: [
              [{ id: "h1", tipo: "texto_rico", v: 1, props: { bloques: [{ tipo: "parrafo", texto: "legacy" }] } }],
              [],
            ],
          },
        },
      ],
      overlays: [],
    };
    const migrado = migrarDocumento(conFilaLegacy) as { secciones: { props: { columnas: unknown[][] } }[] };
    const hoja = migrado.secciones[0]!.props.columnas[0]![0] as { v: number; props: { bloques: { rico?: unknown }[] } };
    expect(hoja.v).toBe(2);
    expect(hoja.props.bloques[0]!.rico).toBeDefined();
    // y el documento migrado parsea entero
    expect(leerDocumentoParaRender(conFilaLegacy).secciones.length).toBe(1);
  });
});

describe("pagebuilder/fila-edicion (F09) — helpers puros de columnas", () => {
  // page.fila.edit.001 — crearHojaFila siembra un leaf válido del registro
  it("crearHojaFila crea un nodo-hoja válido con id estable y defaults del registro", () => {
    for (const tipo of HOJAS_FILA) {
      const hoja = crearHojaFila(tipo, `id-${tipo}`);
      expect(hoja.id).toBe(`id-${tipo}`);
      expect(hoja.tipo).toBe(tipo);
      expect(NodoHojaSchema.safeParse(hoja).success).toBe(true);
    }
  });

  // page.fila.edit.002 — agregar / quitar hoja produce props nuevos válidos
  it("agregarHoja y quitarHoja devuelven props nuevos coherentes", () => {
    const base = filaProps.parse({ reparto: "50_50", columnas: [[], []] });
    const conUna = agregarHoja(base, 0, crearHojaFila("separador", "s1"));
    expect(conUna.columnas[0]!.length).toBe(1);
    expect(base.columnas[0]!.length).toBe(0); // inmutable (no muta la entrada)
    expect(filaProps.safeParse(conUna).success).toBe(true);
    const sinNinguna = quitarHoja(conUna, 0, 0);
    expect(sinNinguna.columnas[0]!.length).toBe(0);
  });

  // page.fila.edit.003 — reordenar hoja dentro del slot con ↑↓
  it("moverHoja reordena dentro de la columna y clampa en los bordes", () => {
    const base = filaProps.parse({
      reparto: "50_50",
      columnas: [[crearHojaFila("separador", "a"), crearHojaFila("espaciador", "b")], []],
    });
    const movido = moverHoja(base, 0, 1, -1); // sube "b"
    expect(movido.columnas[0]!.map((h) => h.id)).toEqual(["b", "a"]);
    // clamp: mover el primero hacia arriba no cambia nada
    const sinCambio = moverHoja(base, 0, 0, -1);
    expect(sinCambio.columnas[0]!.map((h) => h.id)).toEqual(["a", "b"]);
  });

  // page.fila.edit.004 — cambiar reparto ajusta el nº de columnas SIN perder hojas
  it("cambiarReparto agrega/mergea columnas conservando las hojas", () => {
    const dos = filaProps.parse({
      reparto: "50_50",
      columnas: [[crearHojaFila("separador", "a")], [crearHojaFila("espaciador", "b")]],
    });
    // 2 → 3 columnas: agrega una columna vacía
    const tres = cambiarReparto(dos, "33_33_33");
    expect(tres.columnas.length).toBe(3);
    expect(filaProps.safeParse(tres).success).toBe(true);
    expect(tres.columnas.flat().length).toBe(2); // no perdió hojas
    // 3 → 2 columnas: las hojas de la 3ª columna se mergean a la última que queda (sin pérdida)
    const tresPobladas = filaProps.parse({
      reparto: "33_33_33",
      columnas: [[crearHojaFila("separador", "a")], [], [crearHojaFila("espaciador", "c")]],
    });
    const dosOtra = cambiarReparto(tresPobladas, "50_50");
    expect(dosOtra.columnas.length).toBe(2);
    expect(COLUMNAS_POR_REPARTO["50_50"]).toBe(2);
    expect(dosOtra.columnas.flat().map((h) => h.id).sort()).toEqual(["a", "c"]);
  });
});
