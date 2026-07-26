import { describe, expect, it } from "vitest";

import {
  esProductoEntregable,
  seVendeDirecto,
} from "~/server/productos/productoEntregable";

/**
 * Tests de las DOS reglas puras del producto bajo el modelo v2 (productos-tipos-digitales ENMIENDA
 * v2, E15/E17 — antes F06/D4/I7).
 *
 * La enmienda **partió en dos** una pregunta que hasta F06 era una sola, y la partición es el punto:
 *
 *  - `esProductoEntregable` — «¿tiene con qué cumplirle a quien lo reciba?». La consumen el guard de
 *    activación del panel y el guard de borrado de archivos.
 *  - `seVendeDirecto` — «¿se puede COMPRAR?». Una **colección** (`modalidad SOBRE` sin fuente) no: bajo
 *    v2 nunca se vende directo ni aparece en el catálogo, existe para que sus packs la referencien.
 *    La consumen el gate de publicación, el catálogo y el rechazo del checkout.
 *
 * Antes de la enmienda las dos eran lo mismo y por eso alcanzaba una función. Fusionarlas hoy haría
 * una de dos cosas malas: o el gate de publicación contaría una colección como «producto vendible»
 * (una Tienda publicable sin nada que comprar), o el guard de activación rechazaría editar una
 * colección con su pool lleno.
 *
 * Puras (sin DB) siguiendo el precedente de `evaluarPublicacion`: el caller carga los datos y la
 * regla decide. Eso permite que la MISMA definición la compartan las cuatro superficies — que es
 * justo lo que el `backend-reviewer` marcó como NIT en F03 (tres expresiones de la misma regla
 * sincronizadas por comentario y no por test).
 */

/** Un producto normal de siempre: entrega lo suyo. */
const NORMAL = {
  modalidad: "ESTANDAR" as const,
  archivosConfirmados: 1,
  pdfPathLegacy: null,
  unidadesPorPack: 1,
  fuente: null,
};

describe("productos/esProductoEntregable — packs (v2)", () => {
  // productos.entregable.001 — el gate del pack de SOBRE: el pool de la FUENTE tiene que cubrir las
  // unidades del pack (D4/I7). Ojo: ya no se mide contra "el pack más grande del menú" (eso murió con
  // `ProductPackOption`), sino contra las `unidadesPorPack` de ESTE producto.
  it("un pack de fuente SOBRE es entregable solo si el pool de la fuente cubre sus unidades", () => {
    const packDe4 = {
      modalidad: "ESTANDAR" as const, // V-I7: un pack se persiste SIEMPRE ESTANDAR; manda la fuente
      archivosConfirmados: 0, // un pack no tiene archivos propios (V-I1d)
      pdfPathLegacy: null,
      unidadesPorPack: 4,
    };
    const coleccion = (pool: number) => ({
      modalidad: "SOBRE" as const,
      archivosConfirmados: pool,
      pdfPathLegacy: null,
    });

    expect(
      esProductoEntregable({ ...packDe4, fuente: coleccion(6) }),
    ).toBe(true);

    // Límite INCLUSIVO: con 4 archivos se puede armar un pack de 4 sin repetir.
    expect(
      esProductoEntregable({ ...packDe4, fuente: coleccion(4) }),
    ).toBe(true);

    // Pool más corto que el pack: armarlo obligaría a repetir DENTRO del pack, que es lo que D4
    // prohíbe y lo que el `@@unique([orderItemId, packOrdinal, productFileId])` haría estallar en
    // plena compra YA PAGADA. Preferimos no vender antes que no poder entregar.
    expect(
      esProductoEntregable({ ...packDe4, fuente: coleccion(3) }),
    ).toBe(false);
  });

  // productos.entregable.002 — el caso LIBRO. Un pack de fuente ESTANDAR no necesita N archivos: las
  // N copias se DERIVAN en presentación (V-I2), así que con UNO alcanza por más grande que sea el
  // pack. Si esta rama midiera `>= unidadesPorPack` como la del sobre, «Pack 4 libros» sería
  // ineternamente inentregable con su único PDF — y es el caso de uso que abrió la enmienda.
  it("un pack de fuente ESTANDAR alcanza con UN archivo, por grande que sea el pack", () => {
    const fuenteConUnPdf = {
      modalidad: "ESTANDAR" as const,
      archivosConfirmados: 1,
      pdfPathLegacy: null,
    };

    expect(
      esProductoEntregable({
        modalidad: "ESTANDAR",
        archivosConfirmados: 0,
        pdfPathLegacy: null,
        unidadesPorPack: 4,
        fuente: fuenteConUnPdf,
      }),
    ).toBe(true);

    // Y si la fuente no tiene NADA, el pack no puede entregar: el gate se hereda entero.
    expect(
      esProductoEntregable({
        modalidad: "ESTANDAR",
        archivosConfirmados: 0,
        pdfPathLegacy: null,
        unidadesPorPack: 4,
        fuente: { ...fuenteConUnPdf, archivosConfirmados: 0 },
      }),
    ).toBe(false);

    // La mitad EXPANDIR también se hereda: una fuente que solo vive en la columna legacy (prod-viejo
    // la escribió sin crear la fila, ADR-0015) igual alcanza para su pack.
    expect(
      esProductoEntregable({
        modalidad: "ESTANDAR",
        archivosConfirmados: 0,
        pdfPathLegacy: null,
        unidadesPorPack: 4,
        fuente: {
          modalidad: "ESTANDAR",
          archivosConfirmados: 0,
          pdfPathLegacy: "tenant-1/producto-1.pdf",
        },
      }),
    ).toBe(true);
  });

  // productos.entregable.003 — los archivos PROPIOS de un pack no cuentan para nada. Un pack no
  // debería tenerlos (V-I1d, guard en la subida), pero si una fila quedara con alguno —dato viejo,
  // carrera— no puede "salvar" a un pack cuya fuente no alcanza: lo que se entrega sale de la fuente.
  it("los archivos propios de un pack no lo vuelven entregable: manda la fuente", () => {
    expect(
      esProductoEntregable({
        modalidad: "ESTANDAR",
        archivosConfirmados: 9, // no debería pasar, y aun así no cuenta
        pdfPathLegacy: "tenant-1/producto-1.pdf",
        unidadesPorPack: 4,
        fuente: {
          modalidad: "SOBRE",
          archivosConfirmados: 2, // pool corto ⇒ el pack NO se puede armar
          pdfPathLegacy: null,
        },
      }),
    ).toBe(false);
  });
});

describe("productos/esProductoEntregable — productos sin fuente", () => {
  // productos.entregable.004 — la regla de siempre, intacta: ≥1 archivo confirmado O el pdfPath
  // legacy de la fase EXPANDIR. Es la cero-regresión del 100% de los productos que existen hoy.
  it("un producto normal es entregable con archivo confirmado o con el pdfPath legacy, y no sin nada", () => {
    expect(esProductoEntregable(NORMAL)).toBe(true);
    expect(
      esProductoEntregable({
        ...NORMAL,
        archivosConfirmados: 0,
        pdfPathLegacy: "tenant-1/producto-1.pdf",
      }),
    ).toBe(true);
    expect(
      esProductoEntregable({ ...NORMAL, archivosConfirmados: 0 }),
    ).toBe(false);
  });

  // productos.entregable.005 — una COLECCIÓN es entregable con su pool no vacío, y eso es lo que
  // hace que el panel pueda mostrar «Sin archivo» solo cuando el pool está de verdad vacío (E16).
  // Ya NO exige opciones de pack activas: ese requisito murió con `ProductPackOption`.
  it("una colección (SOBRE sin fuente) es entregable con su pool no vacío", () => {
    const coleccion = (pool: number) => ({
      modalidad: "SOBRE" as const,
      archivosConfirmados: pool,
      pdfPathLegacy: null,
      unidadesPorPack: 1,
      fuente: null,
    });

    expect(esProductoEntregable(coleccion(4))).toBe(true);
    expect(esProductoEntregable(coleccion(1))).toBe(true);
    expect(esProductoEntregable(coleccion(0))).toBe(false);
  });
});

describe("productos/seVendeDirecto", () => {
  // productos.entregable.006 — la mitad NUEVA que la enmienda separó. Una colección no se compra:
  // se compra a través de sus packs. Un pack SÍ se compra (es un producto más), y por eso se
  // persiste con `modalidad: ESTANDAR` (V-I7) — si se guardara como SOBRE se auto-escondería.
  it("una colección no se vende directo; un producto normal y un pack sí", () => {
    expect(seVendeDirecto({ modalidad: "SOBRE" })).toBe(false);
    expect(seVendeDirecto({ modalidad: "ESTANDAR" })).toBe(true);
  });
});
