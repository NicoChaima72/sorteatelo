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

interface OpcionPackFake {
  id: string;
  unidades: number;
  precio: Prisma.Decimal;
  activo: boolean;
}

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  precio: Prisma.Decimal;
  activo: boolean;
  participaEnSorteo: boolean;
  /** F07: ESTANDAR (archivo único) o SOBRE (pool + opciones de pack). */
  modalidad: "ESTANDAR" | "SOBRE";
  /** Tamaño del pool CONFIRMADO — de acá sale el rechazo "el pool no alcanza para ese pack". */
  archivosConfirmados: number;
  packOptions: OpcionPackFake[];
}

/** Definición de Campo de checkout en la DB fake — con su Tienda, para poder probar el scoping. */
interface CampoFake extends CampoParaValidar {
  tenantId: string;
  activo: boolean;
}

/**
 * Hechos de FACTURACIÓN de la Tienda que el gate de venta lee (F05/D5). El default es la tienda
 * normal —publicada y al día—, así que los tests de checkout que no hablan de facturación no cambian.
 */
interface FacturacionFake {
  estado: "ALTA" | "CONFIGURACION" | "PUBLICADA" | "SUSPENDIDA";
  platformSubscription: { estado: "AL_DIA" | "COBRO_PENDIENTE" | "EN_PAUSA_POR_PAGO" | "CANCELADA" } | null;
  platformExemption: { exentaHasta: Date | null } | null;
}

const AL_DIA: FacturacionFake = {
  estado: "PUBLICADA",
  platformSubscription: { estado: "AL_DIA" },
  platformExemption: null,
};

/** `db` fake: solo lo que iniciarCheckout toca. Captura los datos con que se crea la Order. */
function fakeDb(
  productos: ProductoFake[],
  campos: CampoFake[] = [],
  facturacion: FacturacionFake = AL_DIA,
) {
  let ordenCreada: Record<string, unknown> | null = null;
  let paymentUpdate: Record<string, unknown> | null = null;
  let consultaCampos: Record<string, unknown> | null = null;

  const tx = {
    // Gate de venta derivado (F05/D5), recomputado DENTRO de la $tx del checkout.
    tenant: {
      findUnique: async () => facturacion,
    },
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
        select,
      }: {
        where: { tenantId: string; id: { in: string[] } };
        select?: { packOptions?: { where?: { activo?: boolean } } };
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
            modalidad: p.modalidad,
            // Espeja el `_count` filtrado por `confirmadoAt` del select real: los pendientes no
            // son pool (F06).
            _count: { files: p.archivosConfirmados },
            // HONRA el `where` del select en vez de filtrar siempre: si el server se olvidara de
            // pedir solo las ACTIVAS, las desactivadas llegarían acá y `checkout.pack.004` lo caza.
            // Un fake que filtra por su cuenta convierte ese bug en verde (la trampa que F03 anotó).
            packOptions: p.packOptions.filter((o) =>
              select?.packOptions?.where?.activo === true ? o.activo : true,
            ),
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
  modalidad: "ESTANDAR",
  archivosConfirmados: 1,
  packOptions: [],
  ...over,
});

/**
 * Sobre sorpresa con su pool y su menú de packs (F07). El default —pool 4, packs 1×$3.000 y
 * 4×$10.000— es el ejemplo del plan (D3).
 */
const sobre = (over: Partial<ProductoFake> = {}): ProductoFake =>
  producto({
    id: "sobre-1",
    titulo: "Sobre sorpresa de stickers",
    modalidad: "SOBRE",
    // El precio del PRODUCTO en un sobre es solo referencia: si el checkout llegara a cobrarlo,
    // cobra mal. Se deja distinto de todos los precios de pack para que un test que lo tome por
    // error no pueda pasar por casualidad.
    precio: dec("999"),
    archivosConfirmados: 4,
    packOptions: [
      { id: "pack-1u", unidades: 1, precio: dec("3000"), activo: true },
      { id: "pack-4u", unidades: 4, precio: dec("10000"), activo: true },
    ],
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

  // ── Gate de venta por facturación (F05, D4/D5, ADR-0026) ──────────────────
  // El SSR ya sirve la página neutral en vez del checkout, pero eso es UI: el rechazo que cuenta es
  // este, server-side y dentro de la $tx, porque es el que no se puede saltar con un POST a mano.

  const compraNormal = {
    email: "fan@example.cl",
    items: [{ productId: "p1", cantidad: 1 }],
    respuestas: [],
  };

  // checkout.iniciar.005 — tienda en pausa por pago ⇒ rechazado, sin Order ni llamada a Flow
  it("rechaza la compra en una tienda en pausa por pago, sin crear Order ni llamar a Flow", async () => {
    const { db, getOrden } = fakeDb([producto({ id: "p1" })], [], {
      ...AL_DIA,
      platformSubscription: { estado: "EN_PAUSA_POR_PAGO" },
    });
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({ db, flow, tenantId: TENANT_A, input: compraNormal }),
    ).rejects.toMatchObject({ code: "INACTIVE" });

    // Nada persistido y nada cobrado: el gate corre ANTES de tocar la Order.
    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.iniciar.006 — el motivo de la pausa NO se le cuenta al Comprador
  it("el mensaje del rechazo no menciona el pago ni la deuda del Organizador", async () => {
    const { db } = fakeDb([producto({ id: "p1" })], [], {
      ...AL_DIA,
      platformSubscription: { estado: "EN_PAUSA_POR_PAGO" },
    });
    const { flow } = flowFake();

    const error = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: compraNormal,
    }).catch((e: unknown) => e);

    // La mora es asunto entre la Plataforma y el Organizador: el Comprador ve «no está recibiendo
    // pedidos», nunca «esta tienda no pagó».
    const mensaje = (error as Error).message.toLowerCase();
    for (const filtrada of ["pago", "pagar", "deuda", "plan", "suscrip", "moros"]) {
      expect(mensaje).not.toContain(filtrada);
    }
  });

  // checkout.iniciar.007 — cancelada / sin plan / exención vencida: los otros 2 motivos comerciales
  it("rechaza también sin plan (canceló y cerró el período) y con la exención vencida", async () => {
    for (const facturacion of [
      { ...AL_DIA, platformSubscription: null },
      { ...AL_DIA, platformSubscription: { estado: "CANCELADA" as const } },
      {
        ...AL_DIA,
        platformSubscription: null,
        platformExemption: { exentaHasta: new Date("2020-01-01T00:00:00Z") },
      },
    ]) {
      const { db } = fakeDb([producto({ id: "p1" })], [], facturacion);
      const { flow, crearPago } = flowFake();
      await expect(
        iniciarCheckout({ db, flow, tenantId: TENANT_A, input: compraNormal }),
      ).rejects.toMatchObject({ code: "INACTIVE" });
      expect(crearPago).not.toHaveBeenCalled();
    }
  });

  // checkout.iniciar.008 — CERO REGRESIÓN: al día, en dunning y exenta venden normal
  it("vende normal al día, con el cobro en reintentos (D4) y con exención vigente", async () => {
    for (const facturacion of [
      AL_DIA,
      // Dunning en curso: D4 es literal — durante los reintentos de Flow solo se AVISA.
      { ...AL_DIA, platformSubscription: { estado: "COBRO_PENDIENTE" as const } },
      // Cortesía/grandfather: vende sin suscripción ni tarjeta (D8).
      { ...AL_DIA, platformSubscription: null, platformExemption: { exentaHasta: null } },
    ]) {
      const { db, getOrden } = fakeDb([producto({ id: "p1" })], [], facturacion);
      const { flow, crearPago } = flowFake();

      const res = await iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: compraNormal,
      });

      expect(res.orderId).toBe("order-fake-1");
      expect(getOrden()).not.toBeNull();
      expect(crearPago).toHaveBeenCalledTimes(1);
    }
  });
});

/**
 * F07 — checkout de un SOBRE SORPRESA con opciones de pack (D3/D4/I3).
 *
 * Lo que se prueba acá y no en otro lado: que el precio y el tamaño del pack los ponga el SERVER
 * leyendo la opción VIGENTE, y que queden CONGELADOS en el `OrderItem`. Ese snapshot es el que F08
 * usa para saber cuántos archivos sortear y cuántos tickets emitir; si se corrompe, el error aparece
 * después de que el Comprador pagó.
 */
describe("domain/checkout/iniciarCheckout — sobre sorpresa (F07)", () => {
  // checkout.pack.001 — el camino feliz: precio y unidades salen de la OPCIÓN, no del producto
  it("congela {precio del pack, unidadesPorPack} del pack elegido y cobra precioPack × cantidad", async () => {
    const { db, getOrden } = fakeDb([sobre()]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        // 2 packs de 4 unidades a $10.000 cada pack.
        items: [{ productId: "sobre-1", cantidad: 2, packOptionId: "pack-4u" }],
        respuestas: [],
      },
    });

    const orden = getOrden()!;
    const items = (orden.items as { create: Array<Record<string, unknown>> })
      .create;
    const it0 = items[0]!;

    // El precio del OrderItem es el del PACK COMPLETO, no el del producto (999) ni el por unidad.
    expect((it0.precio as Prisma.Decimal).toFixed(2)).toBe("10000.00");
    expect(it0.cantidad).toBe(2);
    // El snapshot que F08 va a leer para sortear 4×2 = 8 archivos y emitir 8 tickets.
    expect(it0.unidadesPorPack).toBe(4);

    // total = 10000 × 2 = 20000. `unidadesPorPack` NO entra en la plata (I3): multiplicarlo acá
    // sería cobrar 80.000 por lo que vale 20.000.
    expect((orden.total as Prisma.Decimal).toFixed(2)).toBe("20000.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "20000" }),
    );
    expect(res.total).toBe("20000");
  });

  // checkout.pack.002 — el gate del pool: no se vende lo que no se va a poder entregar (D4/I7)
  it("rechaza el pack cuando el pool tiene menos archivos que las unidades pedidas, sin crear la Order ni tocar Flow", async () => {
    // Pool de 3 y pack de 4: armar ese pack obligaría a repetir un archivo DENTRO del pack, que es
    // justo lo que el `@@unique([orderItemId, packOrdinal, productFileId])` haría estallar en F08 —
    // ya con el pago hecho.
    const { db, getOrden } = fakeDb([sobre({ archivosConfirmados: 3 })]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [
            { productId: "sobre-1", cantidad: 1, packOptionId: "pack-4u" },
          ],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();

    // Y el pack CHICO del mismo sobre sí se vende: el gate mide contra el pack PEDIDO, no contra el
    // más grande del menú. Rechazar la compra de 1 porque existe una opción de 4 sin cubrir sería
    // castigar una venta que sí se puede entregar.
    const { db: db2, getOrden: getOrden2 } = fakeDb([
      sobre({ archivosConfirmados: 3 }),
    ]);
    const { flow: flow2 } = flowFake();
    await iniciarCheckout({
      db: db2,
      flow: flow2,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [{ productId: "sobre-1", cantidad: 1, packOptionId: "pack-1u" }],
        respuestas: [],
      },
    });
    expect(getOrden2()).not.toBeNull();
  });

  // checkout.pack.003 — la opción se valida contra las del PRODUCTO (I1): una ajena no existe
  it("rechaza una opción de pack que no es de ese producto (ni la de otra Tienda)", async () => {
    const { db, getOrden } = fakeDb([
      sobre(),
      // Otro sobre, de OTRA Tienda, con su propia opción de 4 unidades más barata.
      sobre({
        id: "sobre-ajeno",
        tenantId: TENANT_B,
        packOptions: [
          { id: "pack-ajeno", unidades: 4, precio: dec("1"), activo: true },
        ],
      }),
    ]);
    const { flow, crearPago } = flowFake();

    for (const packOptionId of ["pack-ajeno", "clzzzzzzzzzzzzzzzzzzzzzzz"]) {
      await expect(
        iniciarCheckout({
          db,
          flow,
          tenantId: TENANT_A,
          input: {
            email: "fan@example.cl",
            items: [{ productId: "sobre-1", cantidad: 1, packOptionId }],
            respuestas: [],
          },
        }),
      ).rejects.toMatchObject({ code: "INVALID" });
    }
    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.pack.004 — apagar una opción la saca de la VENTA, no solo del selector
  it("rechaza una opción DESACTIVADA aunque el cliente todavía la tenga renderizada", async () => {
    const { db, getOrden } = fakeDb([
      sobre({
        packOptions: [
          { id: "pack-1u", unidades: 1, precio: dec("3000"), activo: true },
          // El Organizador la apagó mientras el Comprador tenía la página abierta.
          { id: "pack-4u", unidades: 4, precio: dec("10000"), activo: false },
        ],
      }),
    ]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [
            { productId: "sobre-1", cantidad: 1, packOptionId: "pack-4u" },
          ],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.pack.005 — las dos modalidades exigen lo suyo y rechazan lo ajeno
  it("un SOBRE sin opción elegida y un ESTANDAR con opción se rechazan los dos", async () => {
    const { db, getOrden } = fakeDb([sobre(), producto({ id: "p1" })]);
    const { flow, crearPago } = flowFake();

    // Sobre sin pack: el cliente tiene que elegir; cobrar el `Product.precio` de referencia (999)
    // sería cobrar un precio que no es de nada.
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "sobre-1", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    // Estándar CON pack: ignorarlo en silencio dejaría al Comprador creyendo que lleva un pack.
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        input: {
          email: "fan@example.cl",
          items: [{ productId: "p1", cantidad: 1, packOptionId: "pack-4u" }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();
  });

  // checkout.pack.006 — un ESTANDAR escribe `unidadesPorPack: 1` EXPLÍCITO, no por default de la
  // columna: la fórmula `unidadesPorPack × cantidad` de F08 tiene que valer igual en las dos
  // modalidades, y un writer que lo omita deja el hecho a merced del schema.
  it("un producto estándar congela unidadesPorPack = 1 explícito", async () => {
    const { db, getOrden } = fakeDb([producto({ id: "p1", precio: dec("3000") })]);
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [{ productId: "p1", cantidad: 3 }],
        respuestas: [],
      },
    });

    const items = (
      getOrden()!.items as { create: Array<Record<string, unknown>> }
    ).create;
    expect(items[0]!.unidadesPorPack).toBe(1);
  });

  // checkout.pack.007 — sobre y estándar conviven en UNA orden y el total los suma bien
  it("mezcla un sobre y un producto estándar en la misma orden con el total correcto", async () => {
    const { db, getOrden } = fakeDb([
      sobre(),
      producto({ id: "p1", precio: dec("4500") }),
    ]);
    const { flow, crearPago } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      input: {
        email: "fan@example.cl",
        items: [
          { productId: "sobre-1", cantidad: 2, packOptionId: "pack-4u" }, // 10000 × 2 = 20000
          { productId: "p1", cantidad: 3 }, // 4500 × 3 = 13500
        ],
        respuestas: [],
      },
    });

    // 20000 + 13500 = 33500. El `unidadesPorPack: 4` del sobre NO participa del total (I3).
    expect((getOrden()!.total as Prisma.Decimal).toFixed(2)).toBe("33500.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "33500" }),
    );
  });
});
