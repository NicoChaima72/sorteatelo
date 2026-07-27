import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarProductosDelPanel } from "~/server/domain/panel/listarProductosDelPanel";

/**
 * Tests del use case `listarProductosDelPanel` con `db` FAKE. Aislamiento cross-tenant
 * (F01 checkbox 5 + F02): un Organizador de la Tienda A jamás ve productos de la Tienda B;
 * el listado del panel incluye TAMBIÉN los inactivos (a diferencia del catálogo del
 * storefront, que filtra `activo: true`). El `tenantId` sale de `acceso`, nunca del input.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  activo: boolean;
  participaEnSorteo: boolean;
  portadaUrl: string | null;
  pdfPath: string | null;
  modalidad: "ESTANDAR" | "SOBRE";
  files: {
    id: string;
    tipo: "PDF" | "IMAGEN";
    nombreArchivo: string;
    bytes: number | null;
  }[];
  /** Cuántas unidades de la fuente entrega (ENMIENDA v2). 1 si no es un pack. */
  unidadesPorPack: number;
  /** La FUENTE, si es un pack. `null` ⇒ entrega los suyos, que es lo que son estos fixtures. */
  fuente: {
    id: string;
    titulo: string;
    modalidad: "ESTANDAR" | "SOBRE";
    pdfPath: string | null;
    _count: { files: number };
  } | null;
  /** `_count.packs` = cuántos packs A LA VENTA entregan el contenido de este producto. */
  _count: { packs: number };
  createdAt: Date;
}

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        productos.filter((p) => p.tenantId === where.tenantId),
    },
  } as unknown as PrismaClient;
}

const dec = (v: string) => new Prisma.Decimal(v);
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

const PRODUCTOS: ProductoFake[] = [
  { id: "pa1", tenantId: "A", titulo: "A activo", descripcion: "d", precio: dec("3000"), activo: true, participaEnSorteo: true, portadaUrl: null, pdfPath: null, modalidad: "ESTANDAR" as const, files: [{ id: "f-x", tipo: "PDF" as const, nombreArchivo: "x.pdf", bytes: 1024 }], unidadesPorPack: 1, fuente: null, _count: { packs: 0 }, createdAt: new Date("2026-01-02") },
  { id: "pa2", tenantId: "A", titulo: "A inactivo", descripcion: "d", precio: dec("4000"), activo: false, participaEnSorteo: false, portadaUrl: null, pdfPath: null, modalidad: "ESTANDAR" as const, files: [{ id: "f-y", tipo: "PDF" as const, nombreArchivo: "y.pdf", bytes: 1024 }], unidadesPorPack: 1, fuente: null, _count: { packs: 0 }, createdAt: new Date("2026-01-01") },
  { id: "pb1", tenantId: "B", titulo: "B activo", descripcion: "d", precio: dec("9999"), activo: true, participaEnSorteo: false, portadaUrl: null, pdfPath: null, modalidad: "ESTANDAR" as const, files: [{ id: "f-z", tipo: "PDF" as const, nombreArchivo: "z.pdf", bytes: 1024 }], unidadesPorPack: 1, fuente: null, _count: { packs: 0 }, createdAt: new Date("2026-01-03") },
];

describe("domain/panel/listarProductosDelPanel (fake db, tenant-scoped)", () => {
  // panel.productos.listar.001 — solo productos del tenant autorizado, incluidos inactivos
  it("devuelve solo los productos del tenant autorizado, incluidos los inactivos", async () => {
    const res = await listarProductosDelPanel({ db: fakeDb(PRODUCTOS), acceso: acceso(["A"]) });
    expect(res.map((p) => p.id).sort()).toEqual(["pa1", "pa2"]);
    // el producto de la Tienda B JAMÁS aparece (aislamiento cross-tenant)
    expect(res.some((p) => p.id === "pb1")).toBe(false);
    // incluye el inactivo
    expect(res.some((p) => p.id === "pa2" && p.activo === false)).toBe(true);
    // precio viaja como string (nunca number en el server)
    expect(res.find((p) => p.id === "pa1")!.precio).toBe("3000");
    // el flag del sorteo viaja para que el form del panel lo hidrate (ADR-0012/D1)
    expect(res.find((p) => p.id === "pa1")!.participaEnSorteo).toBe(true);
    expect(res.find((p) => p.id === "pa2")!.participaEnSorteo).toBe(false);
  });

  // panel.productos.listar.002 — sin membresía ⇒ FORBIDDEN (fail-closed, nunca lista global)
  it("sin membresía ⇒ FORBIDDEN (no devuelve una lista global)", async () => {
    await expect(
      listarProductosDelPanel({ db: fakeDb(PRODUCTOS), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /*
    panel.productos.listar.003 — la proyección que la ENMIENDA v2 le agregó a este use case, y que
    es lo que ALIMENTA el selector «¿De dónde salen los archivos?» del panel (E16). Lo pide el
    `backend-reviewer` al cerrar F11: `esProductoEntregable` está testeada aparte como regla pura,
    pero el CABLEADO —quién sale como fuente elegible, qué se pinta de la fuente, cuántos packs la
    venden— solo se verifica acá. Y es la mitad de la validación F11 «el select de fuentes solo
    ofrece productos con archivos del propio tenant»: la otra mitad (el rechazo server-side de una
    fuente ajena) vive en `crearProducto.test.ts::panel.productos.crear.006`.
  */
  it("proyecta la fuente de un pack, sus packs activos y quién puede ser fuente", async () => {
    const coleccion: ProductoFake = {
      id: "col", tenantId: "A", titulo: "Colección de stickers", descripcion: "d",
      precio: dec("0"),
      // DESPUBLICADA a propósito: es el caso «se vende solo el pack» de E17 — una colección no se
      // compra directo, así que estar en borrador NO puede sacarla del selector de fuentes.
      activo: false,
      participaEnSorteo: false, portadaUrl: null, pdfPath: null, modalidad: "SOBRE" as const,
      files: [
        { id: "s1", tipo: "IMAGEN" as const, nombreArchivo: "s1.png", bytes: 2048 },
        { id: "s2", tipo: "IMAGEN" as const, nombreArchivo: "s2.png", bytes: 2048 },
        { id: "s3", tipo: "IMAGEN" as const, nombreArchivo: "s3.png", bytes: 2048 },
        { id: "s4", tipo: "IMAGEN" as const, nombreArchivo: "s4.png", bytes: 2048 },
      ],
      unidadesPorPack: 1, fuente: null, _count: { packs: 1 },
      createdAt: new Date("2026-02-01"),
    };
    // Lo que el `select` del use case trae de la fuente: más que lo que el panel pinta.
    const fuenteCruda = {
      id: "col", titulo: "Colección de stickers", modalidad: "SOBRE" as const,
      pdfPath: null, _count: { files: 4 },
    };
    const pack4: ProductoFake = {
      id: "pack4", tenantId: "A", titulo: "4 stickers", descripcion: "d", precio: dec("10000"),
      activo: true, participaEnSorteo: true, portadaUrl: null, pdfPath: null,
      // V-I7: un pack se persiste SIEMPRE ESTANDAR; la modalidad que manda es la de su fuente.
      modalidad: "ESTANDAR" as const,
      files: [], unidadesPorPack: 4, fuente: fuenteCruda, _count: { packs: 0 },
      createdAt: new Date("2026-02-02"),
    };
    // El mismo pool, pero pidiendo 6 de 4: la colección NO lo alcanza.
    const pack6: ProductoFake = {
      ...pack4, id: "pack6", titulo: "6 stickers", unidadesPorPack: 6,
      createdAt: new Date("2026-02-03"),
    };
    const sinArchivos: ProductoFake = {
      id: "vacio", tenantId: "A", titulo: "Recién creado", descripcion: "d", precio: dec("3000"),
      activo: false, participaEnSorteo: false, portadaUrl: null, pdfPath: null,
      modalidad: "ESTANDAR" as const, files: [], unidadesPorPack: 1, fuente: null,
      _count: { packs: 0 }, createdAt: new Date("2026-02-04"),
    };

    const res = await listarProductosDelPanel({
      db: fakeDb([coleccion, pack4, pack6, sinArchivos]),
      acceso: acceso(["A"]),
    });
    const porId = (id: string) => res.find((p) => p.id === id)!;

    // (a) De la fuente sale EXACTAMENTE lo que el panel pinta: ni `pdfPath` ni el `_count` con que
    // se computó la entrega. Que sea `toEqual` y no `toMatchObject` es el punto: server-only es
    // server-only, y el `pdfPath` de la fuente es una ruta del bucket (I2).
    expect(porId("pack4").fuente).toEqual({
      id: "col", titulo: "Colección de stickers", modalidad: "SOBRE",
    });
    expect(porId("pack4").unidadesPorPack).toBe(4);
    expect(porId("col").fuente).toBeNull();

    // (b) `puedeSerFuente` = quién aparece en el desplegable. Un pack NUNCA (sin cadenas, V-I1);
    // un producto sin archivos tampoco (no tendría nada que entregar); la colección SÍ, aunque
    // esté despublicada.
    expect(porId("col").puedeSerFuente).toBe(true);
    expect(porId("pack4").puedeSerFuente).toBe(false);
    expect(porId("vacio").puedeSerFuente).toBe(false);

    // (c) El badge de la lista: la colección se lee por sus packs, no por su `activo`.
    expect(porId("col").packsActivos).toBe(1);
    expect(porId("pack4").packsActivos).toBe(0);

    // (d) `tieneArchivo` de un pack se responde mirando la FUENTE (E15/E17), no sus archivos
    // propios —que son cero en los dos packs—: 4 de 4 alcanza, 6 de 4 no.
    expect(porId("pack4").tieneArchivo).toBe(true);
    expect(porId("pack6").tieneArchivo).toBe(false);
    expect(porId("col").tieneArchivo).toBe(true);
    expect(porId("vacio").tieneArchivo).toBe(false);

    // (e) I2 — la `key` del bucket no está en la proyección de ningún archivo.
    expect(Object.keys(porId("col").archivos[0]!).sort()).toEqual([
      "bytes", "id", "nombreArchivo", "tipo",
    ]);
  });
});
