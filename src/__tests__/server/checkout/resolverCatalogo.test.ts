import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { resolverCatalogo } from "~/server/domain/checkout/resolverCatalogo";

/**
 * Tests del resolver de RENDER del catálogo (F05, ADR-0016/0017). Verifica que descarta lo
 * inactivo/ajeno, respeta el orden del documento en `modo:'seleccion'`, y computa el precio como
 * número (dato derivado server-side). Fake db que emula el filtrado de Prisma.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  precio: Prisma.Decimal;
  portadaUrl: string | null;
  participaEnSorteo: boolean;
  activo: boolean;
  createdAt: Date;
  /** F07 — un SOBRE se muestra con "desde $X" y manda al detalle a elegir pack. */
  modalidad: "ESTANDAR" | "SOBRE";
  packOptions: Array<{ precio: Prisma.Decimal; activo: boolean }>;
}

const dec = (v: string) => new Prisma.Decimal(v);

const prod = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p",
  tenantId: "A",
  titulo: "Producto",
  descripcion: "d",
  precio: dec("3000"),
  portadaUrl: null,
  participaEnSorteo: false,
  activo: true,
  createdAt: new Date(),
  modalidad: "ESTANDAR",
  packOptions: [],
  ...over,
});

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findMany: async ({
        where,
        orderBy,
        select,
      }: {
        where: { tenantId: string; activo?: boolean; id?: { in: string[] } };
        orderBy?: { createdAt: "desc" };
        select?: {
          packOptions?: {
            where?: { activo?: boolean };
            orderBy?: { precio: "asc" };
            take?: number;
          };
        };
      }) => {
        let res = productos.filter(
          (p) =>
            p.tenantId === where.tenantId &&
            (where.activo === undefined || p.activo === where.activo) &&
            (where.id === undefined || where.id.in.includes(p.id)),
        );
        if (orderBy?.createdAt === "desc") {
          res = [...res].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        // Emula el sub-select de `packOptions` HONRANDO su where/orderBy/take: el "desde $X" tiene
        // que ser el pack ACTIVO más barato, y un fake que devolviera la lista cruda dejaría pasar
        // tanto una opción apagada como un orden equivocado.
        const sub = select?.packOptions;
        return res.map((p) => ({
          ...p,
          packOptions: [...p.packOptions]
            .filter((o) => (sub?.where?.activo === true ? o.activo : true))
            .sort((a, b) =>
              sub?.orderBy?.precio === "asc" ? a.precio.comparedTo(b.precio) : 0,
            )
            .slice(0, sub?.take ?? undefined),
        }));
      },
    },
  } as unknown as PrismaClient;
}

describe("domain/checkout/resolverCatalogo (render del page builder)", () => {
  // page.render.resolver.001 — modo 'todos' devuelve solo activos del tenant, precio como número
  it("modo 'todos' devuelve los activos del tenant con precio numérico", async () => {
    const db = fakeDb([
      prod({ id: "act", activo: true, precio: dec("3000") }),
      prod({ id: "inact", activo: false }),
      prod({ id: "ajeno", tenantId: "B" }),
    ]);
    const res = await resolverCatalogo({ db, tenantId: "A", modo: "todos" });
    expect(res.map((p) => p.id)).toEqual(["act"]);
    expect(res[0]!.precio).toBe(3000); // dato derivado server-side (Decimal ⇒ number)
    expect(typeof res[0]!.precio).toBe("number");
  });

  // page.render.resolver.002 — modo 'seleccion' respeta el orden del documento y descarta ajeno/inactivo
  it("modo 'seleccion' respeta el orden del documento y descarta ajeno/inactivo", async () => {
    const db = fakeDb([
      prod({ id: "p1", tenantId: "A", activo: true }),
      prod({ id: "p2", tenantId: "A", activo: true }),
      prod({ id: "p3inact", tenantId: "A", activo: false }),
      prod({ id: "pajeno", tenantId: "B", activo: true }),
    ]);
    // El documento pide [p2, p1, p3inact, pajeno]; el resolver devuelve [p2, p1] en ESE orden.
    const res = await resolverCatalogo({
      db,
      tenantId: "A",
      modo: "seleccion",
      productoIds: ["p2", "p1", "p3inact", "pajeno"],
    });
    expect(res.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  // page.render.resolver.003 — seleccion sin ids ⇒ vacío
  it("modo 'seleccion' sin productoIds ⇒ catálogo vacío", async () => {
    const db = fakeDb([prod({ id: "p1", tenantId: "A" })]);
    expect(await resolverCatalogo({ db, tenantId: "A", modo: "seleccion", productoIds: [] })).toEqual([]);
    expect(await resolverCatalogo({ db, tenantId: "A", modo: "seleccion" })).toEqual([]);
  });

  // page.render.resolver.004 (Tanda 2 F13) — esNuevo derivado de createdAt (<30d ⇒ true), read-only
  it("marca esNuevo cuando el producto fue creado hace menos de 30 días (badge 'Nuevo')", async () => {
    const ahora = Date.now();
    const diasAtras = (n: number) => new Date(ahora - n * 24 * 60 * 60 * 1000);
    const db = fakeDb([
      prod({ id: "recien", createdAt: diasAtras(3) }),
      prod({ id: "antiguo", createdAt: diasAtras(45) }),
    ]);
    const res = await resolverCatalogo({ db, tenantId: "A", modo: "todos" });
    const porId = new Map(res.map((p) => [p.id, p]));
    expect(porId.get("recien")!.esNuevo).toBe(true);
    expect(porId.get("antiguo")!.esNuevo).toBe(false);
  });
});
