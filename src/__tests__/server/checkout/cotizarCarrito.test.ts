import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { cotizarCarrito } from "~/server/domain/checkout/cotizarCarrito";
import {
  cotizarCarritoInput,
  iniciarCheckoutInput,
  MAX_CANTIDAD_POR_ITEM,
} from "~/server/domain/checkout/schemas";

/**
 * Tests del use case `cotizarCarrito` (F01 de `storefront-carrito-total-y-drawer`) con un `db` FAKE:
 * el foco es el DINERO y el SCOPING, no la integración Prisma.
 *
 * Lo que esta cotización existe para garantizar es que el número que el Comprador ve en el drawer
 * sea el que `iniciarCheckout` va a cobrar: mismos precios (los VIGENTES de la DB, no los que
 * duermen en el `localStorage`), misma regla de vendibilidad y la misma aritmética en `Decimal`
 * server-side (I2). Por eso los tests comparan contra el precio de la FILA y no contra el que
 * "mandó" el cliente — que ni siquiera existe como input.
 */

interface ProductoFake {
  id: string;
  tenantId: string;
  titulo: string;
  precio: Prisma.Decimal;
  activo: boolean;
  portadaUrl: string | null;
  /** `SOBRE` = COLECCIÓN (pool, no se vende directo). V-I7: un pack se persiste SIEMPRE ESTANDAR. */
  modalidad: "ESTANDAR" | "SOBRE";
  /** Cuántas unidades entrega UNA unidad de este producto (1 = producto normal). */
  unidadesPorPack: number;
  /** Archivos CONFIRMADOS propios. */
  archivosConfirmados: number;
  /** `Product.pdfPath` legacy. */
  pdfPath: string | null;
  /** La FUENTE del pack (`null` ⇒ entrega lo suyo). */
  fuente: {
    modalidad: "ESTANDAR" | "SOBRE";
    archivosConfirmados: number;
    pdfPath: string | null;
  } | null;
  /** Dato server-only que JAMÁS debe aparecer en la proyección. */
  descripcion: string;
}

const dec = (v: string) => new Prisma.Decimal(v);

const prod = (over: Partial<ProductoFake>): ProductoFake => ({
  id: "p",
  tenantId: "A",
  titulo: "Producto",
  precio: dec("3000"),
  activo: true,
  portadaUrl: null,
  modalidad: "ESTANDAR",
  unidadesPorPack: 1,
  archivosConfirmados: 1,
  pdfPath: null,
  fuente: null,
  descripcion: "no debe viajar",
  ...over,
});

/** Proyecta una fila fake al shape que devuelve Prisma con `SELECCION_PRODUCTO_ENTREGABLE`. */
function comoFila(p: ProductoFake) {
  return {
    id: p.id,
    titulo: p.titulo,
    precio: p.precio,
    activo: p.activo,
    portadaUrl: p.portadaUrl,
    modalidad: p.modalidad,
    pdfPath: p.pdfPath,
    unidadesPorPack: p.unidadesPorPack,
    _count: { files: p.archivosConfirmados },
    fuente:
      p.fuente === null
        ? null
        : {
            modalidad: p.fuente.modalidad,
            pdfPath: p.fuente.pdfPath,
            _count: { files: p.fuente.archivosConfirmados },
          },
  };
}

function fakeDb(productos: ProductoFake[]) {
  return {
    product: {
      findMany: async ({
        where,
      }: {
        where: { tenantId: string; id?: { in: string[] } };
      }) =>
        productos
          // El corte por tenant lo hace la DB (I1): un producto ajeno NO vuelve, y por eso el use
          // case no necesita —ni puede— re-filtrarlo. El fake lo emula para que el aislamiento se
          // pruebe de verdad y no por una condición inventada acá adentro.
          .filter(
            (p) =>
              p.tenantId === where.tenantId &&
              (where.id === undefined || where.id.in.includes(p.id)),
          )
          .map(comoFila),
    },
  } as unknown as PrismaClient;
}

describe("domain/checkout/cotizarCarrito (total del carrito, display-only)", () => {
  // carrito.cotizar.001 — el total es Σ (precio VIGENTE × cantidad) en Decimal, con subtotal por línea
  it("cotiza con el precio vigente de la DB y suma el total en Decimal", async () => {
    const db = fakeDb([
      prod({ id: "libro", titulo: "El libro", precio: dec("3000") }),
      prod({ id: "pack", titulo: "Pack 4", precio: dec("10000") }),
    ]);

    const res = await cotizarCarrito({
      db,
      tenantId: "A",
      items: [
        { productId: "libro", cantidad: 2 },
        { productId: "pack", cantidad: 3 },
      ],
    });

    expect(res.lineas.map((l) => [l.productId, l.precioUnitario, l.subtotal])).toEqual([
      ["libro", "3000", "6000"],
      ["pack", "10000", "30000"],
    ]);
    expect(res.total).toBe("36000"); // 3000×2 + 10000×3, en Decimal server-side
  });

  /*
    carrito.cotizar.002 — AISLAMIENTO cross-tenant (I1) + producto inexistente.

    Los dos casos van juntos porque desde la cotización tienen que ser INDISTINGUIBLES: un carrito
    con el id de un producto de otra Tienda no puede enterarse de que ese producto existe (ni por su
    título, ni por su precio, ni porque el total cambie). El `tenantId` sale del contexto y jamás del
    input, así que la única defensa es que la fila no vuelva del `findMany` — y eso es lo que este
    test fija emulando el corte en el fake.
  */
  it("un producto de otra Tienda o inexistente no cotiza ni suma al total", async () => {
    const db = fakeDb([
      prod({ id: "propio", tenantId: "A", precio: dec("3000") }),
      prod({ id: "ajeno", tenantId: "B", titulo: "De la otra tienda", precio: dec("99000") }),
    ]);

    const res = await cotizarCarrito({
      db,
      tenantId: "A",
      items: [
        { productId: "propio", cantidad: 1 },
        { productId: "ajeno", cantidad: 5 },
        { productId: "fantasma", cantidad: 7 },
      ],
    });

    expect(res.lineas.map((l) => l.productId)).toEqual(["propio"]);
    expect(res.total).toBe("3000");
  });

  /*
    carrito.cotizar.003 — la cotización usa la MISMA regla de vendibilidad que `iniciarCheckout` (D4).

    Este es el test que justifica que el use case importe `seVendeDirecto`/`esProductoEntregable` en
    vez de mirar solo `activo`. Si el drawer cotizara con una regla más laxa, le mostraría al
    Comprador un total que incluye algo que el checkout va a rechazar apenas apriete «Ir a pagar» —
    y el número que vio deja de ser el número que paga, que es justo lo que esta feature vino a
    arreglar. Los tres descartes son los tres rechazos de `iniciarCheckout`, en el mismo orden.
  */
  it("descarta lo que el checkout rechazaría: inactivo, colección y pack sin pool suficiente", async () => {
    const db = fakeDb([
      prod({ id: "vendible", precio: dec("1000") }),
      prod({ id: "inactivo", activo: false, precio: dec("2000") }),
      // Una COLECCIÓN (`modalidad SOBRE`) existe para que sus packs referencien su pool; su `precio`
      // es de referencia y no se cobra en ninguna parte.
      prod({ id: "coleccion", modalidad: "SOBRE", archivosConfirmados: 9, precio: dec("4000") }),
      // Pack de 4 sobre una colección que hoy tiene 3 archivos: no se puede armar sin repetir.
      prod({
        id: "packCorto",
        unidadesPorPack: 4,
        archivosConfirmados: 0,
        fuente: { modalidad: "SOBRE", archivosConfirmados: 3, pdfPath: null },
        precio: dec("8000"),
      }),
      // El mismo pack, con el pool ya cubierto: este SÍ cotiza.
      prod({
        id: "packOk",
        unidadesPorPack: 4,
        archivosConfirmados: 0,
        fuente: { modalidad: "SOBRE", archivosConfirmados: 4, pdfPath: null },
        precio: dec("8000"),
      }),
    ]);

    const res = await cotizarCarrito({
      db,
      tenantId: "A",
      items: [
        { productId: "vendible", cantidad: 1 },
        { productId: "inactivo", cantidad: 1 },
        { productId: "coleccion", cantidad: 1 },
        { productId: "packCorto", cantidad: 1 },
        { productId: "packOk", cantidad: 1 },
      ],
    });

    expect(res.lineas.map((l) => l.productId)).toEqual(["vendible", "packOk"]);
    expect(res.total).toBe("9000"); // 1000 + 8000; los tres descartados no suman
  });

  /*
    carrito.cotizar.004 — la FORMA de la línea: lo que trae y, sobre todo, lo que NO.

    Se assertea el set de claves con `toEqual` (mismo criterio que `page.render.resolver.006`) porque
    esta query la consume una superficie PÚBLICA sin sesión (ADR-0004): cualquier campo que se cuele
    en el `select` viaja al navegador de cualquiera que abra la tienda. `pdfPath` y el `_count` del
    pool entran al use case para decidir la vendibilidad y tienen que MORIR ahí — el inventario de la
    Tienda no es asunto del Comprador (V-I6), y una key de bucket menos todavía (ADR-0002).
  */
  it("la línea trae portada y unidades, y nada de lo que el use case leyó para decidir", async () => {
    const db = fakeDb([
      prod({
        id: "pack",
        titulo: "Pack 4 stickers",
        precio: dec("10000"),
        portadaUrl: "https://cdn.example/portada.png",
        unidadesPorPack: 4,
        archivosConfirmados: 0,
        pdfPath: "A/secreto.pdf",
        fuente: { modalidad: "SOBRE", archivosConfirmados: 12, pdfPath: "A/pool.pdf" },
      }),
    ]);

    const res = await cotizarCarrito({
      db,
      tenantId: "A",
      items: [{ productId: "pack", cantidad: 2 }],
    });

    expect(res.lineas[0]).toEqual({
      productId: "pack",
      titulo: "Pack 4 stickers",
      portadaUrl: "https://cdn.example/portada.png",
      precioUnitario: "10000",
      cantidad: 2,
      subtotal: "20000",
      unidadesPorPack: 4,
    });
    // El JSON completo tampoco puede nombrar el pool ni la ruta del archivo por ninguna vía.
    const serializado = JSON.stringify(res);
    expect(serializado).not.toContain("secreto.pdf");
    expect(serializado).not.toContain("pool.pdf");
  });

  /*
    carrito.cotizar.005 (D1) — el precio que manda es el VIGENTE, no el que duerme en el carrito.

    El escenario real: el Comprador dejó el carrito abierto y el Organizador subió el precio. El
    mismo carrito —los mismos `{productId, cantidad}`, que es TODO lo que el cliente puede aportar—
    cotiza distinto porque cambió la fila. Se prueba corriendo la MISMA llamada contra dos estados de
    la DB: es la única forma de expresar «el server manda» cuando el input ni siquiera tiene dónde
    poner un precio.
  */
  it("un precio cambiado en la DB cambia la cotización del mismo carrito", async () => {
    const carrito = [{ productId: "libro", cantidad: 2 }];

    const antes = await cotizarCarrito({
      db: fakeDb([prod({ id: "libro", precio: dec("3000") })]),
      tenantId: "A",
      items: carrito,
    });
    const despues = await cotizarCarrito({
      db: fakeDb([prod({ id: "libro", precio: dec("4500") })]),
      tenantId: "A",
      items: carrito,
    });

    expect(antes.total).toBe("6000");
    expect(despues.total).toBe("9000");
    // Y la línea también se actualiza: el drawer repinta el unitario, no solo el total.
    expect(despues.lineas[0]!.precioUnitario).toBe("4500");
  });

  /*
    carrito.cotizar.006 — el input de la cotización es EL MISMO que el del checkout, sin nada de plata.

    Las dos mitades importan. (a) Que sea el mismo array de ítems no es cosmética: si la cotización
    aceptara cantidades que el checkout rechaza (o al revés), el Comprador vería un total para un
    carrito que después no se puede pagar. Se verifica corriendo los MISMOS payloads inválidos por
    los dos schemas y exigiendo el mismo veredicto. (b) Que un `precio` que venga del cliente se
    DESCARTE es I2 escrito como test: Zod hace strip de las claves desconocidas, así que aunque
    alguien lo mande, jamás llega al use case (que además no tiene dónde recibirlo).
  */
  it("comparte el contrato de ítems con iniciarCheckout y descarta cualquier precio del cliente", () => {
    const conItems = (items: unknown) => ({
      email: "a@b.cl", // lo que iniciarCheckout pide de más; a la cotización se le ignora
      items,
    });
    const INVALIDOS: Array<[string, unknown]> = [
      ["carrito vacío", []],
      ["cantidad 0", [{ productId: "cme0000000000000000000000", cantidad: 0 }]],
      ["cantidad negativa", [{ productId: "cme0000000000000000000000", cantidad: -3 }]],
      ["cantidad no entera", [{ productId: "cme0000000000000000000000", cantidad: 1.5 }]],
      [
        "sobre el tope",
        [{ productId: "cme0000000000000000000000", cantidad: MAX_CANTIDAD_POR_ITEM + 1 }],
      ],
      ["productId que no es cuid", [{ productId: "42", cantidad: 1 }]],
      [
        "producto repetido",
        [
          { productId: "cme0000000000000000000000", cantidad: 1 },
          { productId: "cme0000000000000000000000", cantidad: 2 },
        ],
      ],
    ];

    for (const [caso, items] of INVALIDOS) {
      expect(cotizarCarritoInput.safeParse({ items }).success, caso).toBe(false);
      // El mismo payload es igual de inválido para el checkout: un solo contrato, no dos.
      expect(iniciarCheckoutInput.safeParse(conItems(items)).success, caso).toBe(false);
    }

    // Un carrito válido pasa por los dos… y el `precio` que un cliente curioso agregue se cae solo.
    const conPrecio = {
      items: [{ productId: "cme0000000000000000000000", cantidad: 2, precio: 1 }],
    };
    const parseada = cotizarCarritoInput.safeParse(conPrecio);
    expect(parseada.success).toBe(true);
    expect(parseada.data?.items[0]).toEqual({
      productId: "cme0000000000000000000000",
      cantidad: 2,
    });
  });
});
