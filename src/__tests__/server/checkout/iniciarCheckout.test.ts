import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { TEXTO_CONSENTIMIENTO_RECORDATORIOS } from "~/config/correo";
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
  /**
   * ESTANDAR (entrega lo suyo) o SOBRE (una COLECCIÓN: pool de archivos que no se vende directo).
   * V-I7: un PACK se persiste SIEMPRE ESTANDAR — su `fuenteId` es lo que lo hace pack.
   */
  modalidad: "ESTANDAR" | "SOBRE";
  /** Tamaño del pool CONFIRMADO — de acá sale el rechazo "la fuente no alcanza para ese pack". */
  archivosConfirmados: number;
  /** ENMIENDA v2: de qué producto salen los archivos. `null` ⇒ entrega los suyos. */
  fuenteId: string | null;
  /** Cuántas unidades del contenido de la fuente entrega. 1 en un producto normal. */
  unidadesPorPack: number;
  /** `Product.pdfPath` legacy: un producto viejo entrega por acá aunque no tenga `ProductFile`. */
  pdfPath: string | null;
}

/** Fila de `ConsentimientoRecordatorios` en la DB fake (F05/D5). */
interface ConsentimientoFake {
  tenantId: string;
  emailNormalizado: string;
  email: string;
  orderId: string;
  ip: string | null;
  textoMostrado: string;
  tokenBaja: string;
  otorgadoAt?: Date;
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
  const consentimientos: ConsentimientoFake[] = [];
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
      }: {
        where: { tenantId: string; id: { in: string[] } };
      }) =>
        productos
          .filter(
            (p) => p.tenantId === where.tenantId && where.id.in.includes(p.id),
          )
          .map((p) => {
            // La FUENTE se resuelve contra TODOS los productos y no contra los pedidos: Prisma
            // trae la relación anidada aunque la fuente no esté en el `where` (una colección no se
            // compra, así que NUNCA está en el carrito). Un fake que la buscara en la lista
            // filtrada devolvería `null` y volvería inentregable a todo pack — verde falso al revés.
            const fuente = productos.find((f) => f.id === p.fuenteId) ?? null;
            return {
              id: p.id,
              titulo: p.titulo,
              precio: p.precio,
              activo: p.activo,
              participaEnSorteo: p.participaEnSorteo,
              modalidad: p.modalidad,
              pdfPath: p.pdfPath,
              unidadesPorPack: p.unidadesPorPack,
              // Espeja el `_count` filtrado por `confirmadoAt` del select real: los pendientes no
              // son pool (F06).
              _count: { files: p.archivosConfirmados },
              fuente:
                fuente === null
                  ? null
                  : {
                      modalidad: fuente.modalidad,
                      pdfPath: fuente.pdfPath,
                      _count: { files: fuente.archivosConfirmados },
                    },
            };
          }),
    },
    // Consentimiento de recordatorios (F05/D5): se escribe en la MISMA `$tx` que la Order.
    // El fake espeja la semántica que importa: `createMany({skipDuplicates})` NO pisa una fila
    // existente (por eso devuelve `count: 0` cuando ya hay consentimiento) y `updateMany` no
    // lanza cuando no encuentra nada. Ninguno de los dos puede tumbar la venta.
    consentimientoRecordatorios: {
      createMany: async ({
        data,
      }: {
        data: Record<string, unknown>[];
      }) => {
        const nuevas = data.filter(
          (d) =>
            !consentimientos.some(
              (c) =>
                c.tenantId === d.tenantId &&
                c.emailNormalizado === d.emailNormalizado,
            ),
        );
        consentimientos.push(...(nuevas as unknown as ConsentimientoFake[]));
        return { count: nuevas.length };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tenantId: string; emailNormalizado: string };
        data: Record<string, unknown>;
      }) => {
        const filas = consentimientos.filter(
          (c) =>
            c.tenantId === where.tenantId &&
            c.emailNormalizado === where.emailNormalizado,
        );
        for (const fila of filas) Object.assign(fila, data);
        return { count: filas.length };
      },
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
    getConsentimientos: () => consentimientos,
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
  fuenteId: null,
  unidadesPorPack: 1,
  pdfPath: null,
  ...over,
});

/**
 * La COLECCIÓN de stickers (ENMIENDA v2, E14): el producto `modalidad SOBRE` con el pool. Bajo v2
 * NO se vende directo ni sale en el catálogo — existe para que sus packs referencien su pool. Su
 * `precio` se deja en un valor que no coincide con el de ningún pack, así un test que lo cobrara
 * por error no puede pasar por casualidad.
 */
const coleccion = (over: Partial<ProductoFake> = {}): ProductoFake =>
  producto({
    id: "coleccion-1",
    titulo: "Colección de stickers",
    modalidad: "SOBRE",
    precio: dec("999"),
    archivosConfirmados: 4,
    ...over,
  });

/**
 * Un PACK: un producto más (E13), con su propio precio tipeado por el Organizador, que entrega
 * `unidadesPorPack` del contenido de su fuente. El default es el ejemplo del plan: «4 stickers
 * $10.000» sobre la colección de arriba.
 */
const pack = (over: Partial<ProductoFake> = {}): ProductoFake =>
  producto({
    id: "pack-4u",
    titulo: "4 stickers",
    precio: dec("10000"),
    fuenteId: "coleccion-1",
    unidadesPorPack: 4,
    // Un pack NO tiene archivos propios (V-I1d): lo que entrega sale de la fuente.
    archivosConfirmados: 0,
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
      ip: null, // el consentimiento no participa de este caso (F05/D5)
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
      ip: null, // el consentimiento no participa de este caso (F05/D5)
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
      ip: null, // el consentimiento no participa de este caso (F05/D5)
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
        ip: null, // el consentimiento no participa de este caso (F05/D5)
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
      ip: null, // el consentimiento no participa de este caso (F05/D5)
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
        ip: null, // el consentimiento no participa de este caso (F05/D5)
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
        ip: null, // el consentimiento no participa de este caso (F05/D5)
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
        ip: null, // el consentimiento no participa de este caso (F05/D5)
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
        ip: null, // el consentimiento no participa de este caso (F05/D5)
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
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        ip: null,
        input: compraNormal,
      }),
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
      ip: null, // el consentimiento no participa de este caso (F05/D5)
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
        iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        ip: null,
        input: compraNormal,
      }),
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
        ip: null, // el consentimiento no participa de este caso (F05/D5)
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
  // checkout.pack.001 — el camino feliz de la ENMIENDA v2: un pack es un PRODUCTO, así que su
  // precio es su `Product.precio` y sus unidades su `Product.unidadesPorPack`. Ya no hay opción que
  // buscar ni `packOptionId` que mandar: el carrito vuelve a ser `{productId, cantidad}`.
  it("congela {precio del producto pack, unidadesPorPack} y cobra precio × cantidad", async () => {
    const { db, getOrden } = fakeDb([coleccion(), pack()]);
    const { flow, crearPago } = flowFake();

    const res = await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: null, // el consentimiento no participa de este caso (F05/D5)
      input: {
        email: "fan@example.cl",
        // 2 packs de 4 unidades a $10.000 cada pack.
        items: [{ productId: "pack-4u", cantidad: 2 }],
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

  // checkout.pack.002 — el gate de entrega, medido contra el pack PEDIDO (D4/I7/E17)
  it("rechaza el pack cuando la colección tiene menos archivos que sus unidades, sin crear la Order ni tocar Flow", async () => {
    // Colección de 3 y pack de 4: armar ese pack obligaría a repetir un archivo DENTRO del pack,
    // que es justo lo que el `@@unique([orderItemId, packOrdinal, productFileId])` haría estallar
    // en los efectos post-pago — ya con el pago hecho.
    const { db, getOrden } = fakeDb([
      coleccion({ archivosConfirmados: 3 }),
      pack(),
    ]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        ip: null, // el consentimiento no participa de este caso (F05/D5)
        input: {
          email: "fan@example.cl",
          items: [{ productId: "pack-4u", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();

    // Y un pack CHICO de la MISMA colección sí se vende: el gate mide contra el pack PEDIDO, no
    // contra el más grande de la Tienda. Rechazar la compra de 1 porque existe otro de 4 sin cubrir
    // sería castigar una venta que sí se puede entregar. Bajo v2 esto sale gratis: cada pack es su
    // propio producto y trae sus propias `unidadesPorPack`.
    const { db: db2, getOrden: getOrden2 } = fakeDb([
      coleccion({ archivosConfirmados: 3 }),
      pack({ id: "pack-1u", titulo: "1 sticker", precio: dec("3000"), unidadesPorPack: 1 }),
    ]);
    const { flow: flow2 } = flowFake();
    await iniciarCheckout({
      db: db2,
      flow: flow2,
      tenantId: TENANT_A,
      ip: null, // el consentimiento no participa de este caso (F05/D5)
      input: {
        email: "fan@example.cl",
        items: [{ productId: "pack-1u", cantidad: 1 }],
        respuestas: [],
      },
    });
    expect(getOrden2()).not.toBeNull();
  });

  // checkout.pack.003 — una COLECCIÓN no se compra directo (E15/E17), pero sus packs sí
  it("rechaza comprar la colección SOBRE directo y sí vende el pack que la referencia", async () => {
    const { db, getOrden } = fakeDb([coleccion(), pack()]);
    const { flow, crearPago } = flowFake();

    // El rechazo es SERVER-SIDE y no "no está en el catálogo": el catálogo es una vista y un POST a
    // mano no la mira. Sin este corte, alguien podría llevarse el pool entero pagando el precio de
    // referencia de la colección ($999), que no es el precio de nada.
    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        ip: null, // el consentimiento no participa de este caso (F05/D5)
        input: {
          email: "fan@example.cl",
          items: [{ productId: "coleccion-1", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();

    // El mismo pool, comprado como corresponde: por su pack.
    const { db: db2, getOrden: getOrden2 } = fakeDb([coleccion(), pack()]);
    const { flow: flow2 } = flowFake();
    await iniciarCheckout({
      db: db2,
      flow: flow2,
      tenantId: TENANT_A,
      ip: null, // el consentimiento no participa de este caso (F05/D5)
      input: {
        email: "fan@example.cl",
        items: [{ productId: "pack-4u", cantidad: 1 }],
        respuestas: [],
      },
    });
    expect(getOrden2()).not.toBeNull();
  });

  // checkout.pack.004 — el CASO LIBRO: pack de fuente ESTANDAR, con la fuente despublicada
  it("vende un pack de fuente ESTANDAR aunque la fuente esté despublicada, y congela sus unidades", async () => {
    /*
      «El libro $3.000» + «Pack 4 libros $10.000». Con fuente ESTANDAR alcanza UN archivo por
      grande que sea el pack: las 4 copias se derivan en presentación y no generan filas (V-I2), así
      que no hay nada que "alcance" contar.

      La fuente va `activo: false` a propósito: es el escenario «no quiero vender la unidad, solo el
      pack» de E17, que bajo v2 se resuelve despublicando el producto base en vez de con un flag
      nuevo. Si el gate mirara `activo` de la fuente, ese caso —que es el que el usuario pidió—
      quedaría invendible.
    */
    const { db, getOrden } = fakeDb([
      producto({ id: "libro", titulo: "El libro", precio: dec("3000"), activo: false, archivosConfirmados: 1 }),
      pack({ id: "pack-libros", titulo: "Pack 4 libros", precio: dec("10000"), fuenteId: "libro", unidadesPorPack: 4 }),
    ]);
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: null, // el consentimiento no participa de este caso (F05/D5)
      input: {
        email: "fan@example.cl",
        items: [{ productId: "pack-libros", cantidad: 1 }],
        respuestas: [],
      },
    });

    const items = (
      getOrden()!.items as { create: Array<Record<string, unknown>> }
    ).create;
    expect((items[0]!.precio as Prisma.Decimal).toFixed(2)).toBe("10000.00");
    expect(items[0]!.unidadesPorPack).toBe(4);
  });

  // checkout.pack.005 — el gate de entrega vale para TODOS los productos, no solo para los packs
  it("no vende un producto activo que se quedó sin archivo, y sí el que entrega por el pdfPath legacy", async () => {
    // Antes de la enmienda el checkout solo gateaba al SOBRE: un ESTANDAR activo sin archivo se
    // vendía y el Comprador pagaba por nada. La regla compartida cierra ese hueco de paso.
    const { db, getOrden } = fakeDb([
      producto({ id: "vacio", archivosConfirmados: 0 }),
    ]);
    const { flow, crearPago } = flowFake();

    await expect(
      iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        ip: null, // el consentimiento no participa de este caso (F05/D5)
        input: {
          email: "fan@example.cl",
          items: [{ productId: "vacio", cantidad: 1 }],
          respuestas: [],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getOrden()).toBeNull();
    expect(crearPago).not.toHaveBeenCalled();

    // Cero regresión con lo que prod-viejo dejó escrito: un producto SIN `ProductFile` pero con el
    // `pdfPath` legacy (ADR-0015) sigue siendo vendible. Tratarlo como vacío sacaría de la venta a
    // productos que hoy se venden bien.
    const { db: db2, getOrden: getOrden2 } = fakeDb([
      producto({ id: "legacy", archivosConfirmados: 0, pdfPath: "tenant-A/legacy.pdf" }),
    ]);
    const { flow: flow2 } = flowFake();
    await iniciarCheckout({
      db: db2,
      flow: flow2,
      tenantId: TENANT_A,
      ip: null, // el consentimiento no participa de este caso (F05/D5)
      input: {
        email: "fan@example.cl",
        items: [{ productId: "legacy", cantidad: 1 }],
        respuestas: [],
      },
    });
    expect(getOrden2()).not.toBeNull();
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
      ip: null, // el consentimiento no participa de este caso (F05/D5)
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

  // checkout.pack.007 — pack y producto normal conviven en UNA orden y el total los suma bien
  it("mezcla un pack y un producto normal en la misma orden con el total correcto", async () => {
    const { db, getOrden } = fakeDb([
      coleccion(),
      pack(),
      producto({ id: "p1", precio: dec("4500") }),
    ]);
    const { flow, crearPago } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: null, // el consentimiento no participa de este caso (F05/D5)
      input: {
        email: "fan@example.cl",
        items: [
          { productId: "pack-4u", cantidad: 2 }, // 10000 × 2 = 20000
          { productId: "p1", cantidad: 3 }, // 4500 × 3 = 13500
        ],
        respuestas: [],
      },
    });

    // 20000 + 13500 = 33500. El `unidadesPorPack: 4` del pack NO participa del total (I3):
    // multiplicarlo acá cobraría $80.000 por lo que vale $20.000.
    expect((getOrden()!.total as Prisma.Decimal).toFixed(2)).toBe("33500.00");
    expect(crearPago).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "33500" }),
    );
  });
});

describe("iniciarCheckout — consentimiento de recordatorios (F05/D5)", () => {
  const compra = {
    email: "Fan@Example.CL",
    items: [{ productId: "p1", cantidad: 1 }],
    respuestas: [],
  };

  // checkout.consentimiento.001 — el registro VERIFICABLE que exige la Ley 21.719: cuándo, desde
  // qué IP y —lo que más se olvida— QUÉ TEXTO leyó la persona. El texto lo pone el SERVER desde la
  // constante compartida; el input no tiene dónde traerlo, que es la forma de que el evaluado no
  // escriba su propia prueba.
  it("persiste timestamp, IP y el texto exacto cuando el checkbox viene marcado", async () => {
    const { db, getConsentimientos } = fakeDb([producto({ id: "p1" })]);
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: "200.1.2.3",
      input: { ...compra, aceptaRecordatorios: true },
    });

    expect(getConsentimientos()).toHaveLength(1);
    const consentimiento = getConsentimientos()[0]!;
    expect(consentimiento).toMatchObject({
      tenantId: TENANT_A,
      // Identidad normalizada para el unique + snapshot de lo que la persona escribió de verdad.
      emailNormalizado: "fan@example.cl",
      email: "Fan@Example.CL",
      orderId: "order-fake-1",
      ip: "200.1.2.3",
      textoMostrado: TEXTO_CONSENTIMIENTO_RECORDATORIOS,
    });
    // El token de baja nace con el consentimiento: el enlace del correo tiene que existir ANTES de
    // que exista la baja. Opaco y largo, no un id adivinable.
    expect(consentimiento.tokenBaja.length).toBeGreaterThanOrEqual(32);
  });

  // checkout.consentimiento.002 — «NO premarcado» no es solo un atributo del checkbox: es que la
  // AUSENCIA del dato signifique NO. Un checkout que no menciona el consentimiento (el de una
  // Tienda sin sorteo, o un cliente viejo) no puede dejar a nadie suscrito.
  it("no persiste nada cuando el checkbox no se marcó, ni cuando el input ni lo menciona", async () => {
    // La mitad de SCHEMA: un payload que ni menciona el consentimiento se parsea sin la clave — no
    // hay default que lo invente en un sentido ni en el otro.
    const parseado = iniciarCheckoutInput.parse({
      email: "fan@example.cl",
      items: [{ productId: "cms2hj3bd0008kd37rkoeifb4", cantidad: 1 }],
    });
    expect(parseado.aceptaRecordatorios).toBeUndefined();

    // La mitad de USE CASE, que es la que manda: ni `false` ni la ausencia escriben una fila. Es
    // «jamás premarcado» sostenido también para un caller que no pase por Zod (un script futuro).
    for (const aceptaRecordatorios of [false, undefined]) {
      const { db, getConsentimientos } = fakeDb([producto({ id: "p1" })]);
      const { flow } = flowFake();
      await iniciarCheckout({
        db,
        flow,
        tenantId: TENANT_A,
        ip: "200.1.2.3",
        input: { ...compra, aceptaRecordatorios },
      });
      expect(getConsentimientos()).toEqual([]);
    }
  });

  // checkout.consentimiento.003 — re-consentir en una compra nueva REFRESCA la prueba (otra fecha,
  // otra IP, otra orden) pero CONSERVA el token de baja. Si el token cambiara, el enlace «darme de
  // baja» de todos los correos ya enviados moriría — y eso es exactamente lo que RFC 8058 promete
  // que funciona. Dos casings del mismo correo son la MISMA persona (una sola fila).
  it("refresca la prueba al re-consentir pero conserva el token de baja", async () => {
    const { db, getConsentimientos } = fakeDb([producto({ id: "p1" })]);
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: "200.1.2.3",
      input: { ...compra, aceptaRecordatorios: true },
    });
    const tokenOriginal = getConsentimientos()[0]!.tokenBaja;

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: "190.9.9.9",
      input: {
        ...compra,
        email: "fan@example.cl", // el mismo correo, otro casing
        aceptaRecordatorios: true,
      },
    });

    expect(getConsentimientos()).toHaveLength(1);
    expect(getConsentimientos()[0]!.tokenBaja).toBe(tokenOriginal);
    expect(getConsentimientos()[0]!.ip).toBe("190.9.9.9");
  });

  // checkout.consentimiento.004 — la IP puede no llegar (proxy raro, request local): se guarda
  // `null` y NO se inventa. Un consentimiento sin IP sigue siendo válido; uno con una IP falsa es
  // peor que no tener ninguna.
  it("guarda null cuando el borde no entrega IP, sin inventar un valor", async () => {
    const { db, getConsentimientos } = fakeDb([producto({ id: "p1" })]);
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: null,
      input: { ...compra, aceptaRecordatorios: true },
    });

    expect(getConsentimientos()[0]!.ip).toBeNull();
  });

  // checkout.consentimiento.005 — el consentimiento es de PLATAFORMA, no un Campo de checkout
  // configurable por el Organizador (CONTEXT § Consentimiento de recordatorios). El guard
  // estructural: no puede colarse como `CheckoutFieldResponse`, porque ahí el Organizador podría
  // borrarlo, renombrarlo o ponerlo obligatorio.
  it("no viaja como respuesta de Campo de checkout", async () => {
    const { db, getOrden } = fakeDb([producto({ id: "p1" })]);
    const { flow } = flowFake();

    await iniciarCheckout({
      db,
      flow,
      tenantId: TENANT_A,
      ip: "200.1.2.3",
      input: { ...compra, aceptaRecordatorios: true },
    });

    expect(getOrden()!.checkoutResponses).toBeUndefined();
  });
});
