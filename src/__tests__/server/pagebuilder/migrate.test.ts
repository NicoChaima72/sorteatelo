import { describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import {
  leerDocumentoParaRender,
  migrarDocumento,
  parsearDocumento,
} from "~/lib/pagebuilder/migrate";

/**
 * Tests de migrate-on-read + lectura tolerante (F05, ADR-0016/I9). El render nunca crashea por un
 * `tipo` desconocido; un nodo `v` viejo/ausente se migra PURO al leer (sin escribir a DB).
 */

const docCompleto = () =>
  documentoInicial({ heroTitulo: "Hola", heroSubtitulo: null, heroImageUrl: null });

describe("pagebuilder/migrate — migrate-on-read + lectura tolerante", () => {
  // page.render.migrate.001 — un nodo sin `v` se normaliza a v1 PURO al leer, sin tocar la entrada.
  // Se usa `catalogo` (que sigue en v1) como ejemplo del paso genérico "missing v ⇒ v1"; el paso
  // específico de `hero` v1→v2 se prueba aparte (widgetsSocial.test.ts::page.soc.hero.001, F05).
  it("normaliza un nodo legacy sin `v` a v1 sin mutar la entrada (puro, sin DB)", () => {
    const raw = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [{ id: "sec-catalogo", tipo: "catalogo", props: { titulo: "Catálogo" } }], // sin `v`
      overlays: [],
    };
    const rawCopia = structuredClone(raw);
    const migrado = migrarDocumento(raw) as typeof raw;
    expect(migrado.secciones[0]!).toMatchObject({ v: 1 });
    // Puro: la entrada NO se mutó.
    expect(raw).toEqual(rawCopia);
    // Y el documento migrado parsea estricto.
    expect(() => parsearDocumento(raw)).not.toThrow();
  });

  // page.render.migrate.002 — un tipo desconocido se descarta; el resto renderiza (no crash, I9)
  it("descarta una sección de tipo desconocido y conserva el resto (no crashea)", () => {
    const base = docCompleto();
    const conBasura = {
      ...base,
      secciones: [
        base.secciones[0], // hero válido
        { id: "raro", tipo: "widget_del_futuro", v: 1, props: { cualquier: "cosa" } }, // desconocido
        base.secciones[1], // catalogo válido
      ],
    };
    const doc = leerDocumentoParaRender(conBasura);
    expect(doc.secciones.map((s) => s.tipo)).toEqual(["hero", "catalogo"]); // el raro desapareció
  });

  // page.render.migrate.003 — una sección con props inválidas se descarta, no tumba la página
  it("descarta una sección con props inválidas y conserva el resto", () => {
    const base = docCompleto();
    const conPropsMalas = {
      ...base,
      secciones: [
        { id: "sec-hero", tipo: "hero", v: 1, props: { titulo: "x".repeat(500) } }, // fuera de límite
        base.secciones[3], // como_funciona válido
      ],
    };
    const doc = leerDocumentoParaRender(conPropsMalas);
    expect(doc.secciones.map((s) => s.tipo)).toEqual(["como_funciona"]);
  });

  // page.render.migrate.004 — un documento completamente corrupto ⇒ documento vacío renderizable
  it("con un documento corrupto devuelve un documento vacío renderizable (no lanza)", () => {
    const doc = leerDocumentoParaRender({ basura: true });
    expect(doc.secciones).toEqual([]);
    expect(doc.overlays).toEqual([]);
    expect(doc.schemaVersion).toBe(1);
  });

  // page.render.migrate.005 — un documento válido round-tripea intacto por la lectura tolerante
  it("un documento válido pasa intacto por la lectura tolerante", () => {
    const base = docCompleto();
    const doc = leerDocumentoParaRender(base);
    expect(doc.secciones.map((s) => s.tipo)).toEqual([
      "hero",
      "catalogo",
      "sorteo_vitrina",
      "como_funciona",
    ]);
  });
});
