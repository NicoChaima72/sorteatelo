import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { listarVentas } from "~/server/domain/panel/listarVentas";

/**
 * Tests del use case `listarVentas` con `db` FAKE. Cubre (F03 del roadmap SaaS): aislamiento por tenant,
 * orden estable `[createdAt desc, id desc]`, paginación por cursor (sin repetir ni saltear;
 * última página ⇒ nextCursor null), y los montos como string `Decimal` (neto = total − fee
 * calculado con Decimal server-side, sin aritmética `number`). El `pageSize` se inyecta para
 * probar la paginación sin cientos de filas (el router usa el default).
 *
 * F06 de `tasks/26-07-25-checkout-campos-configurables.md` suma el DETALLE de cada venta: los ítems
 * con su cantidad y su precio unitario congelado, y las Respuestas de checkout del snapshot
 * (`etiqueta` + `tipo` + `valor` canónico).
 */

interface RespuestaFake {
  clave: string;
  etiqueta: string;
  tipo: "TEXTO" | "TELEFONO" | "NUMERO" | "SELECT" | "CHECKBOX";
  valor: string;
}

interface OrdenFake {
  id: string;
  tenantId: string;
  email: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  total: Prisma.Decimal;
  createdAt: Date;
  items: Array<{
    cantidad: number;
    precio: Prisma.Decimal;
    product: { titulo: string };
  }>;
  payment: { fee: Prisma.Decimal | null; estado: string } | null;
  checkoutResponses: RespuestaFake[];
}

interface ArgsFindMany {
  where: { tenantId: string };
  take: number;
  cursor?: { id: string };
  skip?: number;
  select: {
    items: { orderBy: unknown };
    checkoutResponses: { orderBy: unknown; select: Record<string, true> };
  };
}

/** Fake db: modela orderBy [createdAt desc, id desc] (recibe las órdenes YA ordenadas) + cursor/skip/take. */
function fakeDb(ordenesOrdenadas: OrdenFake[]) {
  const args: ArgsFindMany[] = [];
  const db = {
    order: {
      findMany: async (a: ArgsFindMany) => {
        args.push(a);
        const { where, take, cursor, skip } = a;
        const arr = ordenesOrdenadas.filter(
          (o) => o.tenantId === where.tenantId,
        );
        let start = 0;
        if (cursor) {
          const idx = arr.findIndex((o) => o.id === cursor.id);
          start = idx < 0 ? arr.length : idx + (skip ?? 0);
        }
        return arr.slice(start, start + take);
      },
    },
  } as unknown as PrismaClient;
  return { db, args };
}

const dec = (v: string) => new Prisma.Decimal(v);
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

const item = (titulo: string, cantidad: number, precio: string) => ({
  cantidad,
  precio: dec(precio),
  product: { titulo },
});

/**
 * Órdenes de la Tienda A (ya ordenadas desc por fecha), + 1 de la Tienda B (ruido).
 *
 * `o5` es la venta CON detalle rico (2 líneas + 4 respuestas de checkout de tipos distintos); el
 * resto queda sin respuestas a propósito: son las órdenes PREVIAS a la feature, que es el caso de
 * degradación de I9.
 */
const ORDENES: OrdenFake[] = [
  {
    id: "o5",
    tenantId: "A",
    email: "e5@x.cl",
    estado: "PAGADO",
    total: dec("5000"),
    createdAt: new Date("2026-01-05"),
    items: [item("Libro 5", 2, "2000"), item("Libro 4", 1, "1000")],
    payment: { fee: dec("160"), estado: "PAGADO" },
    checkoutResponses: [
      {
        clave: "telefono",
        etiqueta: "Teléfono",
        tipo: "TELEFONO",
        valor: "+56912345678",
      },
      { clave: "talla", etiqueta: "Talla", tipo: "SELECT", valor: "M" },
      {
        clave: "quiere_novedades",
        etiqueta: "Quiero recibir novedades",
        tipo: "CHECKBOX",
        valor: "true",
      },
      {
        clave: "codigo_postal",
        etiqueta: "Código postal",
        tipo: "NUMERO",
        valor: "8320000",
      },
    ],
  },
  {
    id: "o4",
    tenantId: "A",
    email: "e4@x.cl",
    estado: "PENDIENTE",
    total: dec("3000"),
    createdAt: new Date("2026-01-04"),
    items: [item("Libro 4", 1, "3000")],
    payment: { fee: null, estado: "PENDIENTE" },
    checkoutResponses: [],
  },
  {
    id: "o3",
    tenantId: "A",
    email: "e3@x.cl",
    estado: "PAGADO",
    total: dec("3000"),
    createdAt: new Date("2026-01-03"),
    items: [item("Libro 3", 1, "3000")],
    payment: { fee: dec("96"), estado: "PAGADO" },
    checkoutResponses: [],
  },
  {
    id: "oB",
    tenantId: "B",
    email: "eB@x.cl",
    estado: "PAGADO",
    total: dec("9999"),
    createdAt: new Date("2026-01-03"),
    items: [item("Ajeno", 1, "9999")],
    payment: { fee: dec("300"), estado: "PAGADO" },
    checkoutResponses: [
      {
        clave: "secreto_ajeno",
        etiqueta: "Secreto de la otra Tienda",
        tipo: "TEXTO",
        valor: "no debe aparecer",
      },
    ],
  },
  {
    id: "o2",
    tenantId: "A",
    email: "e2@x.cl",
    estado: "FALLIDO",
    total: dec("3000"),
    createdAt: new Date("2026-01-02"),
    items: [item("Libro 2", 1, "3000")],
    payment: { fee: null, estado: "FALLIDO" },
    checkoutResponses: [],
  },
  {
    id: "o1",
    tenantId: "A",
    email: "e1@x.cl",
    estado: "PAGADO",
    total: dec("3000"),
    createdAt: new Date("2026-01-01"),
    items: [item("Libro 1", 1, "3000")],
    payment: { fee: dec("96"), estado: "PAGADO" },
    checkoutResponses: [],
  },
];

describe("domain/panel/listarVentas (fake db, tenant-scoped, cursor)", () => {
  // panel.ventas.listar.001 — solo órdenes del tenant, orden estable, neto Decimal
  it("devuelve solo órdenes del tenant, con neto = total − fee (Decimal) para las pagadas", async () => {
    const res = await listarVentas({
      db: fakeDb(ORDENES).db,
      acceso: acceso(["A"]),
      input: { cursor: null },
      pageSize: 10,
    });
    // ninguna orden de la Tienda B
    expect(res.items.some((o) => o.id === "oB")).toBe(false);
    // orden estable desc
    expect(res.items.map((o) => o.id)).toEqual(["o5", "o4", "o3", "o2", "o1"]);
    // neto de la pagada o5: 5000 − 160 = 4840 (string, Decimal server-side)
    const o5 = res.items.find((o) => o.id === "o5")!;
    expect(o5.total).toBe("5000");
    expect(o5.comision).toBe("160");
    expect(o5.neto).toBe("4840");
    // la pendiente no tiene neto ni comisión
    const o4 = res.items.find((o) => o.id === "o4")!;
    expect(o4.neto).toBeNull();
    expect(o4.comision).toBeNull();
    // los ítems de la orden, con la cantidad y el precio UNITARIO congelado (string Decimal)
    expect(o5.items).toEqual([
      { titulo: "Libro 5", cantidad: 2, precio: "2000" },
      { titulo: "Libro 4", cantidad: 1, precio: "1000" },
    ]);
  });

  // panel.ventas.listar.002 — paginación por cursor: sin repetir ni saltear; última ⇒ null
  it("pagina por cursor sin repetir ni saltear filas; última página ⇒ nextCursor null", async () => {
    const { db } = fakeDb(ORDENES);
    const pageSize = 2;
    const vistos: string[] = [];
    let cursor: string | null = null;
    let vueltas = 0;
    do {
      const page = await listarVentas({
        db,
        acceso: acceso(["A"]),
        input: { cursor },
        pageSize,
      });
      vistos.push(...page.items.map((o) => o.id));
      cursor = page.nextCursor;
      vueltas++;
      expect(vueltas).toBeLessThan(10); // guard anti-loop
    } while (cursor !== null);

    // Las 5 órdenes de A, en orden, sin repetir ni saltear.
    expect(vistos).toEqual(["o5", "o4", "o3", "o2", "o1"]);
    expect(new Set(vistos).size).toBe(5);
  });

  // panel.ventas.listar.003 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN (no lista órdenes globales)", async () => {
    await expect(
      listarVentas({
        db: fakeDb(ORDENES).db,
        acceso: acceso([]),
        input: { cursor: null },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // panel.ventas.detalle.001 — las Respuestas de checkout de la orden viajan con el snapshot
  // congelado (etiqueta + tipo + valor CANÓNICO, sin humanizar) y solo las del tenant.
  it("devuelve las respuestas de checkout congeladas de cada orden, nunca las de otro tenant", async () => {
    const res = await listarVentas({
      db: fakeDb(ORDENES).db,
      acceso: acceso(["A"]),
      input: { cursor: null },
      pageSize: 10,
    });

    const o5 = res.items.find((o) => o.id === "o5")!;
    expect(o5.respuestas).toEqual([
      {
        clave: "telefono",
        etiqueta: "Teléfono",
        tipo: "TELEFONO",
        valor: "+56912345678",
      },
      { clave: "talla", etiqueta: "Talla", tipo: "SELECT", valor: "M" },
      {
        clave: "quiere_novedades",
        etiqueta: "Quiero recibir novedades",
        tipo: "CHECKBOX",
        valor: "true",
      },
      {
        clave: "codigo_postal",
        etiqueta: "Código postal",
        tipo: "NUMERO",
        valor: "8320000",
      },
    ]);

    // El valor viaja CANÓNICO (Opción A): la humanización "true" ⇒ "Sí" es de la UI, no del server.
    expect(o5.respuestas.find((r) => r.tipo === "CHECKBOX")!.valor).toBe(
      "true",
    );

    // La respuesta de la Tienda B no entra por ninguna puerta: las respuestas cuelgan de una Order
    // que el `where` ya filtró por tenant (aislamiento por construcción, I1/I7).
    const claves = res.items.flatMap((o) => o.respuestas.map((r) => r.clave));
    expect(claves).not.toContain("secreto_ajeno");

    // I9 — una orden PREVIA a la feature no tiene respuestas: lista vacía, no ausencia.
    expect(res.items.find((o) => o.id === "o1")!.respuestas).toEqual([]);
  });

  // panel.ventas.detalle.002 — las dos colecciones del detalle salen en orden DETERMINISTA
  it("pide ítems y respuestas con un orden total estable (nada de barajarse entre refetches)", async () => {
    const { db, args } = fakeDb(ORDENES);
    await listarVentas({
      db,
      acceso: acceso(["A"]),
      input: { cursor: null },
      pageSize: 10,
    });

    // El `where` es la ÚNICA condición de tenancy de toda la feature (ítems y respuestas cuelgan de
    // la Order): se afirma sobre los args y no solo sobre el resultado, porque aflojarlo —un `OR`,
    // un filtro por id del input— no rompería ninguna otra assertion de este archivo.
    expect(args[0]!.where).toEqual({ tenantId: "A" });

    const orden = [{ createdAt: "asc" }, { id: "asc" }];
    expect(args[0]!.select.items.orderBy).toEqual(orden);
    expect(args[0]!.select.checkoutResponses.orderBy).toEqual(orden);
    // Del snapshot se lee lo congelado, nunca la definición viva (D2/I4): sin `fieldId`.
    expect(args[0]!.select.checkoutResponses.select).toEqual({
      clave: true,
      etiqueta: true,
      tipo: true,
      valor: true,
    });
  });
});
