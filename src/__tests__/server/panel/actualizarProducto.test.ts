import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { actualizarProducto } from "~/server/domain/panel/actualizarProducto";

/**
 * Tests del use case `actualizarProducto` con `db` FAKE. Clave: el update se scopea por el
 * `tenantId` resuelto (`updateMany where { id, tenantId }`), así un producto de OTRA Tienda ⇒
 * `NOT_FOUND` — indistinguible de "no existe" (sin fuga de existencia). El `tenantId` sale del
 * acceso, nunca del input.
 *
 * Actualizado por F03/D4: (a) el input ya NO lleva `pdfPath` (murió el seam de texto de F05,
 * I6); (b) guard fail-closed (I7): activar (`activo: true`) un producto SIN archivo entregable ⇒
 * `INVALID`. El guard lee el producto (findFirst scopeado por tenant) ANTES del update.
 *
 * Actualizado por productos-tipos-digitales F02: "entregable" ya no es `pdfPath != null` sino
 * "tiene ≥1 `ProductFile` confirmado O el `pdfPath` legacy". El fake modela LAS DOS fuentes porque
 * durante la fase EXPANDIR ambas existen a la vez.
 *
 * Actualizado por la **ENMIENDA v2** (E15/E17): un pack se juzga por su FUENTE, y el `findFirst`
 * pasó a correr SIEMPRE (no solo al activar) porque de él sale también si `unidadesPorPack` aplica.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  pdfPath: string | null;
  /** Archivos `ProductFile` CONFIRMADOS de este producto (la fuente de verdad desde F01). */
  archivosConfirmados?: number;
  /** Modalidad (F05/D2). Default ESTANDAR, como la columna. SOBRE ⟺ es una colección (V-I7). */
  modalidad?: "ESTANDAR" | "SOBRE";
  /** Si es un PACK: de dónde salen sus archivos (E15). Ausente ⇒ entrega los suyos. */
  fuente?: {
    modalidad: "ESTANDAR" | "SOBRE";
    archivosConfirmados: number;
    pdfPath?: string | null;
  };
  /** Cuántas unidades de la fuente entrega. Default 1, como la columna. */
  unidadesPorPack?: number;
}

function fakeDb(productos: ProductoFake[]) {
  let updateArgs: {
    where: { id: string; tenantId: string };
    data: Record<string, unknown>;
  } | null = null;
  const db = {
    product: {
      // Espeja `SELECCION_PRODUCTO_ENTREGABLE` + el `fuenteId` que el use case lee aparte: el guard
      // resuelve TODO con esta única query. La FUENTE viene ANIDADA, igual que en el select real —
      // un pack sin su fuente no se puede juzgar.
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const p = productos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p
          ? {
              fuenteId: p.fuente ? "fuente-1" : null,
              modalidad: p.modalidad ?? ("ESTANDAR" as const),
              pdfPath: p.pdfPath,
              unidadesPorPack: p.unidadesPorPack ?? 1,
              _count: { files: p.archivosConfirmados ?? 0 },
              fuente: p.fuente
                ? {
                    modalidad: p.fuente.modalidad,
                    pdfPath: p.fuente.pdfPath ?? null,
                    _count: { files: p.fuente.archivosConfirmados },
                  }
                : null,
            }
          : null;
      },
      updateMany: async (args: {
        where: { id: string; tenantId: string };
        data: Record<string, unknown>;
      }) => {
        updateArgs = args;
        const count = productos.filter(
          (p) => p.id === args.where.id && p.tenantId === args.where.tenantId,
        ).length;
        return { count };
      },
    },
  } as unknown as PrismaClient;
  return { db, getUpdateArgs: () => updateArgs };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

const inputBase = {
  titulo: "Editado",
  descripcion: "desc",
  precio: "5000",
  activo: true,
  participaEnSorteo: true,
  unidadesPorPack: 1,
};

describe("domain/panel/actualizarProducto (fake db, tenant-scoped)", () => {
  // panel.productos.actualizar.001 — actualiza un producto propio (scoped por tenantId)
  it("actualiza un producto de la Tienda del Organizador, precio como Decimal, sin escribir pdfPath", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: "A/p1.pdf" },
    ]);
    const res = await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase },
    });
    expect(res.actualizado).toBe(true);
    const args = getUpdateArgs()!;
    expect(args.where).toEqual({ id: "p1", tenantId: "A" }); // scoping en el where
    expect(Prisma.Decimal.isDecimal(args.data.precio)).toBe(true);
    expect((args.data.precio as Prisma.Decimal).toFixed(2)).toBe("5000.00");
    // ADR-0012/D1: persiste el flag del sorteo tal cual del input.
    expect(args.data.participaEnSorteo).toBe(true);
    // F03/D4/I6: el update NO toca pdfPath (lo escribe solo confirmarPdfProducto).
    expect("pdfPath" in args.data).toBe(false);
    // plantilla-rica D4/I6: el update tampoco toca portadaUrl (la escribe confirmarImagenSubida).
    expect("portadaUrl" in args.data).toBe(false);
    // V-I1c: `fuenteId` es inmutable ⇒ el update jamás la escribe (ni siquiera está en el input).
    expect("fuenteId" in args.data).toBe(false);
  });

  // panel.productos.actualizar.002 — producto de OTRO tenant ⇒ NOT_FOUND (sin fuga de existencia)
  it("un producto de OTRA Tienda ⇒ NOT_FOUND (indistinguible de inexistente)", async () => {
    // el producto existe pero en el tenant B; el Organizador opera el tenant A
    const { db } = fakeDb([{ id: "pB", tenantId: "B", pdfPath: "B/pB.pdf" }]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "pB", ...inputBase },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // panel.productos.actualizar.003 — desactivar cambia `activo` a false (sin guard de archivo)
  it("desactivar un producto escribe activo: false (no exige archivo)", async () => {
    // producto sin archivo: desactivar debe funcionar igual (el guard es solo para activar).
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: null },
    ]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: false },
    });
    expect(getUpdateArgs()!.data.activo).toBe(false);
  });

  // panel.productos.actualizar.004 — activar sin NINGÚN archivo ⇒ INVALID (fail-closed, I7)
  it("activar (activo: true) un producto sin archivo entregable ⇒ INVALID y NO actualiza", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: null, archivosConfirmados: 0 },
    ]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "p1", ...inputBase, activo: true },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getUpdateArgs()).toBeNull(); // no llegó al update
  });

  // panel.productos.actualizar.005 — un producto cuyo archivo vive SOLO en ProductFile se activa
  // (F02: es el estado normal de todo lo subido desde el código nuevo, que ya no escribe pdfPath)
  it("activar un producto con archivo en ProductFile y pdfPath null SÍ actualiza", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: null, archivosConfirmados: 1 },
    ]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: true },
    });
    expect(getUpdateArgs()!.data.activo).toBe(true);
  });

  // panel.productos.actualizar.006 — el fallback legacy sigue vivo durante la fase EXPANDIR: un
  // producto que prod-viejo dejó con solo `pdfPath` (sin fila) se sigue pudiendo activar.
  it("activar un producto con SOLO el pdfPath legacy (sin ProductFile) SÍ actualiza", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: "A/p1.pdf", archivosConfirmados: 0 },
    ]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: true },
    });
    expect(getUpdateArgs()!.data.activo).toBe(true);
  });

  // panel.productos.actualizar.007 — PACK cuya fuente SOBRE no alcanza ⇒ INVALID (E17). Es el caso
  // que la regla vieja (solo "¿tiene algún archivo?") habría dejado pasar: el pack se ponía a la
  // venta y la asignación aleatoria fallaba DESPUÉS de que el Comprador pagó.
  it("activar un pack cuya colección tiene menos archivos que sus unidades ⇒ INVALID y NO actualiza", async () => {
    const { db, getUpdateArgs } = fakeDb([
      {
        id: "p1",
        tenantId: "A",
        pdfPath: null,
        unidadesPorPack: 4,
        fuente: { modalidad: "SOBRE", archivosConfirmados: 3 }, // 3 < 4
      },
    ]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "p1", ...inputBase, activo: true, unidadesPorPack: 4 },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getUpdateArgs()).toBeNull();
  });

  // panel.productos.actualizar.008 — el gate se evalúa con las unidades que se están GUARDANDO, no
  // con las que había. Sin esto, subir un pack de 3 a 6 sobre un pool de 4 quedaría guardado y
  // explotaría recién en la compra ya pagada.
  it("subir las unidades de un pack por encima de su colección ⇒ INVALID, aunque el valor viejo entrara", async () => {
    const { db, getUpdateArgs } = fakeDb([
      {
        id: "p1",
        tenantId: "A",
        pdfPath: null,
        unidadesPorPack: 3, // hoy entra en el pool de 4
        fuente: { modalidad: "SOBRE", archivosConfirmados: 4 },
      },
    ]);
    await expect(
      actualizarProducto({
        db,
        acceso: acceso(["A"]),
        input: { id: "p1", ...inputBase, activo: true, unidadesPorPack: 6 },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getUpdateArgs()).toBeNull();
  });

  // panel.productos.actualizar.009 — el caso LIBRO: un pack de fuente ESTANDAR se activa con UN
  // archivo por grande que sea, porque las N copias se derivan en presentación (V-I2).
  it("activar un pack de 4 cuya fuente ESTANDAR tiene un solo archivo SÍ actualiza", async () => {
    const { db, getUpdateArgs } = fakeDb([
      {
        id: "p1",
        tenantId: "A",
        pdfPath: null,
        unidadesPorPack: 4,
        fuente: { modalidad: "ESTANDAR", archivosConfirmados: 1 },
      },
    ]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: true, unidadesPorPack: 4 },
    });
    const args = getUpdateArgs()!;
    expect(args.data.activo).toBe(true);
    expect(args.data.unidadesPorPack).toBe(4);
  });

  // panel.productos.actualizar.010 — una COLECCIÓN con su pool no vacío se puede seguir editando y
  // activando: ya NO exige opciones de pack (ese requisito murió con `ProductPackOption`). Con el
  // pool vacío, en cambio, no hay nada que entregarle a sus packs.
  it("una colección con pool se activa; con el pool vacío ⇒ INVALID", async () => {
    const conPool = fakeDb([
      {
        id: "p1",
        tenantId: "A",
        pdfPath: null,
        modalidad: "SOBRE",
        archivosConfirmados: 4,
      },
    ]);
    await actualizarProducto({
      db: conPool.db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, activo: true },
    });
    expect(conPool.getUpdateArgs()!.data.activo).toBe(true);

    const vacia = fakeDb([
      {
        id: "p1",
        tenantId: "A",
        pdfPath: null,
        modalidad: "SOBRE",
        archivosConfirmados: 0,
      },
    ]);
    await expect(
      actualizarProducto({
        db: vacia.db,
        acceso: acceso(["A"]),
        input: { id: "p1", ...inputBase, activo: true },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(vacia.getUpdateArgs()).toBeNull();
  });

  // panel.productos.actualizar.011 — el agujero que el `backend-reviewer` marcó al cerrar F10: un
  // producto SIN fuente entrega 1 unidad de sí mismo y punto. Si `unidadesPorPack` se copiara del
  // input, un cliente a mano dejaría un producto normal otorgando 5 tickets × cantidad por UN
  // archivo — tickets regalados a alguien que ya pagó.
  it("un producto SIN fuente escribe unidadesPorPack: 1 aunque el input pida 5", async () => {
    const { db, getUpdateArgs } = fakeDb([
      { id: "p1", tenantId: "A", pdfPath: "A/p1.pdf" },
    ]);
    await actualizarProducto({
      db,
      acceso: acceso(["A"]),
      input: { id: "p1", ...inputBase, unidadesPorPack: 5 },
    });
    expect(getUpdateArgs()!.data.unidadesPorPack).toBe(1);
  });
});
