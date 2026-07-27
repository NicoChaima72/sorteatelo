import { describe, expect, it } from "vitest";

import { PageDocumentSchema, SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  TIPOS_DEPRECADOS,
  TIPOS_SECCION,
  WIDGET_META,
  WIDGET_REGISTRY,
} from "~/lib/pagebuilder/widgets";
import { listarTiposWidget } from "~/server/domain/pagebuilder/catalogoDelEditor";

/**
 * **Deprecación SUAVE de widgets** (productos-tipos-digitales ENMIENDA v2, E18).
 *
 * `packs_precio` pintaba tarjetas de precio con copy libre. Bajo el modelo v2 un pack es un
 * PRODUCTO, así que «Nuestros packs» se arma con el widget `catalogo` en modo selección — datos
 * reales, precio real, botón que agrega de verdad. Tener las dos maneras de armar lo mismo garantiza
 * que alguna quede desincronizada, y la que miente es siempre la del copy libre.
 *
 * Una deprecación suave tiene DOS mitades y las dos se pueden romper por separado, así que las dos
 * se testean: deja de OFRECERSE (menú del editor, catálogo del asistente) pero sigue RENDERIZANDO
 * intacto donde ya está publicado. Borrarlo del registro habría roto las demos y las tiendas que ya
 * lo publicaron — el documento guardado dejaría de parsear y la página entera se caería.
 */
describe("pagebuilder — widgets deprecados (deprecación suave, E18)", () => {
  /*
    page.widgets.deprecado.001 — MITAD A: no se ofrece más. `TIPOS_SECCION` es la fuente única de
    la que salen la galería del editor (`widget-gallery.tsx`), el catálogo del asistente
    (`listarTiposWidget`) y el listado de la herramienta de páginas: sacarlo de ahí lo saca de las
    tres a la vez, que es justamente por qué la lista tiene que ser una sola.
  */
  it("un tipo deprecado no se ofrece en el menú del editor ni en el catálogo del asistente", () => {
    expect(TIPOS_DEPRECADOS).toContain("packs_precio");

    for (const tipo of TIPOS_DEPRECADOS) {
      expect(TIPOS_SECCION).not.toContain(tipo);
      expect(listarTiposWidget().map((t) => t.tipo)).not.toContain(tipo);
    }

    // Y no se llevó puesto a nadie más: el resto del registro de secciones sigue ofreciéndose.
    const seccionesDelRegistro = (
      Object.keys(WIDGET_REGISTRY) as Array<keyof typeof WIDGET_REGISTRY>
    ).filter((t) => WIDGET_REGISTRY[t].categoria === "seccion");
    expect(TIPOS_SECCION.length).toBe(
      seccionesDelRegistro.length - TIPOS_DEPRECADOS.length,
    );
  });

  /*
    page.widgets.deprecado.002 — MITAD B: sigue renderizando donde YA está publicado. Esto es lo
    que hace que la deprecación sea suave y no un borrado con víctimas.

    El nodo tiene que seguir parseando contra la union —suelto y DENTRO de un documento completo—
    porque un documento que no parsea no es "una sección que no se ve": es la página entera caída.
    Las tiendas demo tienen `packs_precio` publicado y su render tiene que quedar byte-idéntico.
  */
  it("un tipo deprecado sigue en el registro y sus documentos publicados siguen parseando", () => {
    for (const tipo of TIPOS_DEPRECADOS) {
      const def = WIDGET_REGISTRY[tipo];
      expect(def.categoria).toBe("seccion");
      // El editor sigue necesitando saber CÓMO SE LLAMA la sección para listarla en el outline de
      // una página que ya la tiene.
      expect(WIDGET_META[tipo].titulo).not.toBe(tipo);

      const nodo = {
        id: `n-${tipo}`,
        tipo,
        v: def.v,
        props: def.propsSchema.parse(def.defaultProps),
      };
      expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);

      const doc = {
        schemaVersion: 1,
        root: { props: {} },
        secciones: [nodo],
        overlays: [],
      };
      const res = PageDocumentSchema.safeParse(doc);
      expect(res.success, `un documento publicado con "${tipo}" debe seguir parseando`).toBe(true);
    }
  });
});
