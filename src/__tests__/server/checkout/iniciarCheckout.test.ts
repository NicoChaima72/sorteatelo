import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type CampoParaValidar } from "~/server/domain/camposCheckout/validarRespuestas";
import { iniciarCheckout } from "~/server/domain/checkout/iniciarCheckout";
import { iniciarCheckoutInput } from "~/server/domain/checkout/schemas";
import { type FlowService } from "~/server/services/flow";

/**
 * Tests del use case `iniciarCheckout` con un `db` FAKE (sin DB): el foco es la lógica de
 * dominio scopeada por tenant (I1/ADR-0005), no la integración Prisma. Cubren Validaciones
 * F02 (ADR-0012): compra POR CANTIDAD — cada `OrderItem` congela precio UNITARIO + `cantidad`
 * + snapshot de `participaEnSorteo`; el `total` = Σ `precio × cantidad` en `Decimal` server-side
 * (I4, sin drift de redondeo); el monto a Flow = `total.toFixed(0)`. Y el AISLAMIENTO cross-tenant
 * (un producto de otra Tienda ⇒ NOT_FOUND). El service Flow se inyecta fake (no pega a la API real).
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  precio: Prisma.Decimal;
  activo: boolean;
  participaEnSorteo: boolean;
}

/** Definición de Campo de checkout en la DB fake — con su Tienda, para poder probar el scoping. */
interface CampoFake extends CampoParaValidar {
  tenantId: string;
  activo: boolean;
}

/** `db` fake: solo lo que iniciarCheckout toca. Captura los datos con que se crea la Order. */
function fakeDb(productos: ProductoFake[], campos: CampoFake[] = []) {
  let ordenCreada: Record<string, unknown> | null = null;
  let paymentUpdate: Record<string, unknown> | null = null;
  let consultaCampos: Record<string, unknown> | null = null;

  const tx = {
    checkoutField: {
      findMany: async (args: {
        where: { tenantId: string; activo: boolean };
      }) => {
        consultaCampos = args;
        return campos.filter(
          (c) =>
            c.tenantId === args.where.tenantId &&
            c.activo === args.where.activo,
        );
      },
    },
    product: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; id: { in: string[] } };
      }) =>
        productos
          .filter(
            (p) => p.tenantId === where.tenantId && where.id.in.includes(p.id),
          )
          .map((p) => ({
            id: p.id,
            titulo: p.titulo,
            precio: p.precio,
            activo: p.activo,
            participaEnSorteo: p.participaEnSorteo,
          })),
    },
    order: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ordenCreada = data;
        return {
          id: "order-fake-1",
          total: data.total as Prisma.Decimal,
          email: data.email as string,
        };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
    payment: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        paymentUpdate = data;
        return {};
      },
    },
  } as unknown as PrismaClient;

  return {
    db,
    getOrden: () => ordenCreada,
    getPaymentUpdate: () => paymentUpdate,
    getConsultaCampos: () => consultaCampos,
  };
}

const campoFake = (parcial: Partial<CampoFake>): CampoFake => ({
  id: "campo-1",
  tenantId: TENANT_A,
  activo: true,
  clave: "telefono",
  etiqueta: "Teléfono",
  tipo: "TEXTO",
  obligatorio: false,
  opciones: [],
  defaultMarcado: false,
  ...parcial,
});

function flowFake() {
  const crearPago = vi.fn<FlowService["crearPago"]>().mockResolvedValue({
    redirectUrl: "https://sandbox.flow.cl/app/web/pay.php?token=fake-token",
    token: "fake-token",
    flowOrder: 123,
  });
  const flow: FlowService = { crearPago, getStatus: vi.fn() };
  return { flow, crearPago };
}

const dec = (v: string) => new Prisma.Decimal(v);

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const producto = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p1",
  tenantId: TENANT_A,
  titulo: "Producto",
  precio: dec("3000"),
  activo: true,
  participaEnSorteo: false,
  ...over,
});

describe("domain/checkout/iniciarCheckout (fake db, tenant-scoped)", () => {
  // checkout.iniciar.001 — 1 ítem con cantidad 3: OrderItem cantidad 3 + precio unit snapshot
  //                        + participaEnSorteo snapshot; total = precio × 3
  it("con items [{cantidad: 3}] crea 1 OrderItem con cantidad 3, precio unitario y participaEnSorteo snapshot; total = precio × 3", async () => {
    const { db, getOrden, getPaymentUpdate } = fakeDb([
      producto({ id: "p1", precio: dec("3000"), participaEnSorteo: true }),
    ]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [{ productId: "p1", cantidad: 3 }],
        respuestas: [], // Tienda sin Campos de checkout: el caso de siempre (I9)
      },
    });

    const orden = getOrden()!;
    expect(orden.tenantId).toBe(TENANT_A);
    expect(orden.estado).toBe("PENDIENTE");
    // total = 3000 × 3 = 9000, exacto en Decimal.
    expect((orden.total as Prisma.Decimal).toFixed(2)).toBe("9000.00");

    const items = (orden.items as { create: Array<Record<string, unknown>> })
      .create;
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.productId).toBe("p1");
    expect(it0.cantidad).toBe(3);
    expect((it0.precio as Prisma.Decimal).toFixed(2)).toBe("3000.00"); // UNITARIO, no subtotal
    expect(it0.participaEnSorteo).toBe(true); // snapshot del Product (D2)
    expect(it0.tenantId).toBe(TENANT_A);

    // Payment PENDIENTE con monto = total; monto a Flow = total.toFixed(0).
    const payment = (orden.payment as { create: Record<string, unknown> })
      .create;
    expect((payment.monto as Prisma.Decimal).toFixed(2)).toBe("9000.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({
        commerceOrder: "order-fake-1",
        amount: "9000",
      }),
    );
    expect(getPaymentUpdate()).toMatchObject({
      token: "fake-token",
      flowOrder: 123,
    });
    expect(res.total).toBe("9000");
  });

  // checkout.iniciar.002 — múltiples ítems de cantidades distintas: total = Σ precio × cantidad
  it("total con múltiples ítems de cantidades distintas = Σ precio × cantidad (Decimal, sin drift); monto a Flow = total.toFixed(0)", async () => {
    const { db, getOrden } = fakeDb([
      producto({ id: "p1", precio: dec("2990"), participaEnSorteo: true }),
      producto({ id: "p2", precio: dec("4500"), participaEnSorteo: false }),
    ]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [
          { productId: "p1", cantidad: 2 }, // 2990 × 2 = 5980
          { productId: "p2", cantidad: 3 }, // 4500 × 3 = 13500
        ],
        respuestas: [],
      },
    });

    // total = 5980 + 13500 = 19480, exacto.
    expect((getOrden()!.total as Prisma.Decimal).toFixed(2)).toBe("19480.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "19480" }),
    );
    expect(res.total).toBe("19480");

    // Cada línea conserva su precio UNITARIO + cantidad + snapshot del flag.
    const items = (
      getOrden()!.items as { create: Array<Record<string, unknown>> }
    ).create;
    const porProducto = new Map(items.map((it) => [it.productId, it]));
    expect(porProducto.get("p1")).toMatchObject({
      cantidad: 2,
      participaEnSorteo: true,
    });
    expect((porProducto.get("p1")!.precio as Prisma.Decimal).toFixed(2)).toBe(
      "2990.00",
    );
    expect(porProducto.get("p2")).toMatchObject({
      cantidad: 3,
      participaEnSorteo: false,
    });
  });

  // checkout.iniciar.003 — validación del input: cantidad < 1 / no entera ⇒ rechazo; productId duplicado ⇒ rechazo
  it("rechaza cantidad < 1, cantidad no entera y productId duplicado a nivel de schema", async () => {
    const cid = "claaaaaaaaaaaaaaaaaaaaaaaa"; // cuid válido para el test
    const cid2 = "clbbbbbbbbbbbbbbbbbbbbbbbb";
    const base = { email: "fan@example.cl" };

    // cantidad 0 ⇒ rechazo (min 1).
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [{ productId: cid, cantidad: 0 }],
      }).success,
    ).toBe(false);
    // cantidad no entera ⇒ rechazo.
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [{ productId: cid, cantidad: 1.5 }],
      }).success,
    ).toBe(false);
    // productId duplicado ⇒ rechazo (refine).
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [
          { productId: cid, cantidad: 1 },
          { productId: cid, cantidad: 2 },
        ],
      }).success,
    ).toBe(false);
    // Dos productos distintos con cantidades válidas ⇒ OK.
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        items: [
          { productId: cid, cantidad: 1 },
          { productId: cid2, cantidad: 5 },
        ],
      }).success,
    ).toBe(true);
  });

  // checkout.respuestas.001 — F05: el input acepta `respuestas` LAXAS ({clave, valor}) y rechaza
  //                           dos respuestas para la misma clave; omitirlas ⇒ [] (I9)
  it("acepta respuestas laxas por clave, las hace opcionales y rechaza claves repetidas", () => {
    const cid = "claaaaaaaaaaaaaaaaaaaaaaaa";
    const base = {
      email: "fan@example.cl",
      items: [{ productId: cid, cantidad: 1 }],
    };

    // El `valor` viaja como lo emite el input de Mantine que le tocó: texto, número, booleano o
    // `null` (Select limpiado). El TIPO no viaja: lo pone el server contra la definición (I3).
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        respuestas: [
          { clave: "telefono", valor: "+56 9 1234 5678" },
          { clave: "edad", valor: 30 },
          { clave: "regalo", valor: true },
          { clave: "talla", valor: null },
        ],
      }).success,
    ).toBe(true);

    // Omitirlas es el payload de SIEMPRE: una Tienda sin campos manda exactamente lo de hoy (I9).
    const sinRespuestas = iniciarCheckoutInput.safeParse(base);
    expect(sinRespuestas.success && sinRespuestas.data.respuestas).toEqual([]);

    // Dos respuestas para el mismo campo es ambiguo: ¿cuál congelo? Se rechaza en el transporte,
    // igual que el productId duplicado de arriba.
    expect(
      iniciarCheckoutInput.safeParse({
        ...base,
        respuestas: [
          { clave: "telefono", valor: "1" },
          { clave: "telefono", valor: "2" },
        ],
      }).success,
    ).toBe(false);
  });

  // checkout.respuestas.002 — F05: las definiciones se releen DENTRO de la $tx, scopeadas por el
  //                           tenant del contexto, y las respuestas se congelan en la MISMA
  //                           sentencia que crea la Order (D2/I3)
  it("relee las definiciones vigentes del tenant en la $tx y congela las respuestas junto a la Order", async () => {
    const { db, getOrden, getConsultaCampos } = fakeDb(
      [producto({ id: "p1", precio: dec("3000") })],
      [
        campoFake({
          id: "campo-tel",
          clave: "telefono",
          etiqueta: "Teléfono de contacto",
          tipo: "TELEFONO",
          obligatorio: true,
        }),
        campoFake({
          id: "campo-regalo",
          clave: "regalo",
          etiqueta: "Envolver para regalo",
          tipo: "CHECKBOX",
          defaultMarcado: false,
        }),
      ],
    );
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [{ productId: "p1", cantidad: 1 }],
        respuestas: [
          { clave: "telefono", valor: "+56 9 1234 5678" },
          { clave: "regalo", valor: true },
        ],
      },
    });

    // La lectura sale del `tenantId` del CONTEXTO (I1) y solo trae los ACTIVOS (D5): la definición
    // que manda es la de la DB en este instante, no la que el cliente tenía renderizada.
    expect(getConsultaCampos()?.where).toEqual({
      tenantId: TENANT_A,
      activo: true,
    });

    // Snapshot autocontenido (D2): clave + etiqueta + tipo + valor CANÓNICO, con fieldId poblado y
    // el tenantId de la Tienda dueña. Va en el mismo `order.create` que los ítems y el Payment ⇒
    // no existe un instante con la compra creada y sus datos afuera.
    const responses = (
      getOrden()!.checkoutResponses as {
        create: Array<Record<string, unknown>>;
      }
    ).create;
    expect(responses).toEqual([
      {
        tenantId: TENANT_A,
        fieldId: "campo-tel",
        clave: "telefono",
        etiqueta: "Teléfono de contacto",
        tipo: "TELEFONO",
        valor: "+56912345678", // normalizado (D3), no lo que se tipeó
      },
      {
        tenantId: TENANT_A,
        fieldId: "campo-regalo",
        clave: "regalo",
        etiqueta: "Envolver para regalo",
        tipo: "CHECKBOX",
        valor: "true", // canónico, sin humanizar (Opción A)
      },
    ]);
  });

  // checkout.respuestas.003 — F05: un obligatorio sin responder frena TODO: no nace la Order ni se
  //                           crea el pago en Flow (la validación va ANTES del create, en la $tx)
  it("con un obligatorio sin responder no crea la Order ni llama a Flow", async () => {
    const { db, getOrden } = fakeDb(
      [producto({ id: "p1" })],
      [
        campoFake({
          clave: "telefono",
          etiqueta: "Teléfono de contacto",
          obligatorio: true,
        }),
      ],
    );
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "p1", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    // Ni Order a medias ni cobro: la compra no existió.
    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.respuestas.004 — I9: una Tienda sin Campos de checkout crea EXACTAMENTE la Order de
  //                           hoy; ni siquiera aparece la clave `checkoutResponses`
  it("una Tienda sin campos configurados crea la Order sin tocar nada nuevo", async () => {
    const { db, getOrden } = fakeDb([producto({ id: "p1" })]); // sin campos
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [{ productId: "p1", cantidad: 1 }],
        respuestas: [],
      },
    });

    expect(getOrden()).not.toHaveProperty("checkoutResponses");
  });

  // checkout.respuestas.005 — I1: los campos de OTRA Tienda no participan de esta compra. El
  //                           `where` sale del contexto, así que una definición ajena es
  //                           inalcanzable: su clave se rechaza como desconocida
  it("no valida contra los campos de otra Tienda", async () => {
    const { db, getOrden } = fakeDb(
      [producto({ id: "p1" })],
      [
        // Mismo `clave` que usaría el atacante, pero de la Tienda B: para TENANT_A no existe.
        campoFake({ tenantId: TENANT_B, clave: "telefono", obligatorio: true }),
      ],
    );
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "p1", cantidad: 1 }],
          respuestas: [{ clave: "telefono", valor: "912345678" }],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.004a — AISLAMIENTO: un producto de OTRA Tienda ⇒ NOT_FOUND (sin llamar a Flow)
  it("rechaza con NOT_FOUND un producto que pertenece a otra Tienda (aislamiento cross-tenant)", async () => {
    const { db } = fakeDb([
      producto({ id: "pB", tenantId: TENANT_B, precio: dec("9999") }),
    ]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "pB", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.004b — producto inactivo del tenant ⇒ INACTIVE (sin llamar a Flow)
  it("rechaza con INACTIVE un producto inactivo del tenant (sin llamar a Flow)", async () => {
    const { db } = fakeDb([producto({ id: "p1", activo: false })]);
    const { flow, crearPago } = flowFake();
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "p1", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INACTIVE" });
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.004c — producto inexistente ⇒ NOT_FOUND (sin llamar a Flow)
  it("rechaza con NOT_FOUND un producto inexistente (sin llamar a Flow)", async () => {
    const { db } = fakeDb([]);
    const { flow, crearPago } = flowFake();
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "clnoexistenoexistenoexiste", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(crearPago).not.toHaveBeenCalled();
  });
});
