import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { exportarVentasCsv } from "~/server/domain/panel/exportarVentasCsv";

/**
 * Tests del use case `exportarVentasCsv` con `db` FAKE (F07 de
 * `tasks/26-07-25-checkout-campos-configurables.md`, D9).
 *
 * El CSV se arma SERVER-SIDE y tenant-scoped: una fila por orden, columnas fijas + una columna por
 * `clave` presente en el conjunto exportado. Los valores viajan CANÓNICOS (números crudos,
 * `true`/`false`) para que la planilla los pueda sumar y filtrar — humanizar es cosa del panel
 * (`valorDeRespuesta`), no del archivo.
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
  orderBy: unknown;
  select: Record<string, unknown>;
}

/** Fake db: filtra por tenant y devuelve las órdenes YA ordenadas (desc, como el listado). */
function fakeDb(ordenesOrdenadas: OrdenFake[]) {
  const args: ArgsFindMany[] = [];
  const db = {
    order: {
      findMany: async (a: ArgsFindMany) => {
        args.push(a);
        return ordenesOrdenadas.filter((o) => o.tenantId === a.where.tenantId);
      },
    },
  } as unknown as PrismaClient;
  return { db, args };
}

const dec = (v: string) => new Prisma.Decimal(v);

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

const item = (titulo: string, cantidad: number, precio: string) => ({
  cantidad,
  precio: dec(precio),
  product: { titulo },
});

/** Las líneas del CSV, sin el BOM, sin la línea final vacía. */
const lineas = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

/**
 * Dos ventas de la Tienda A (la más nueva con respuestas de checkout, la vieja sin ninguna: es la
 * degradación I9) + una de la Tienda B como ruido de tenancy.
 */
const ORDENES: OrdenFake[] = [
  {
    id: "o2",
    tenantId: "A",
    email: "compradora@x.cl",
    estado: "PAGADO",
    total: dec("5000"),
    createdAt: new Date("2026-01-05T15:30:00-03:00"),
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
    ],
  },
  {
    id: "o1",
    tenantId: "A",
    email: "otra@x.cl",
    estado: "PENDIENTE",
    total: dec("3000"),
    createdAt: new Date("2026-01-04T09:05:00-03:00"),
    items: [item("Libro 1", 1, "3000")],
    payment: null,
    checkoutResponses: [],
  },
  {
    id: "oB",
    tenantId: "B",
    email: "ajena@x.cl",
    estado: "PAGADO",
    total: dec("9999"),
    createdAt: new Date("2026-01-05T10:00:00-03:00"),
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
];

describe("domain/panel/exportarVentasCsv (fake db, tenant-scoped)", () => {
  // panel.ventas.csv.001 — columnas fijas + una fila por venta, y JAMÁS una fila de otro tenant
  it("arma una fila por venta del tenant, con las columnas fijas del panel", async () => {
    const { db, args } = fakeDb(ORDENES);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });
    const filas = lineas(contenido);

    // Las columnas FIJAS son el PREFIJO del encabezado, en el orden en que se leen en el panel
    // (las dinámicas se agregan después, siempre a la derecha).
    expect(
      filas[0]!.startsWith(
        "Fecha,Correo,Total,Comisión,Te queda,Estado,Productos",
      ),
    ).toBe(true);
    // La venta pagada, con sus montos CRUDOS (sin `$` ni separador de miles: la planilla los tiene
    // que poder sumar), el estado canónico y la fecha en la hora de Chile.
    expect(
      filas[1]!.startsWith(
        "2026-01-05 15:30,compradora@x.cl,5000,160,4840,PAGADO,",
      ),
    ).toBe(true);
    // La PENDIENTE no tiene comisión ni neto: celdas VACÍAS, no un «—» (eso es relleno de columna
    // en la pantalla; en una planilla un guion es un dato que rompe cualquier fórmula).
    expect(
      filas[2]!.startsWith("2026-01-04 09:05,otra@x.cl,3000,,,PENDIENTE,"),
    ).toBe(true);

    // Una fila por orden de la Tienda A (encabezado + 2), ni una de la Tienda B.
    expect(filas).toHaveLength(3);
    expect(contenido).not.toContain("ajena@x.cl");
    expect(contenido).not.toContain("no debe aparecer");

    // La tenancy es la del `where`, resuelto server-side: es la única condición que aísla.
    expect(args[0]!.where).toEqual({ tenantId: "A" });
  });

  // panel.ventas.csv.002 — una columna por clave presente; la venta que no respondió, celda vacía
  it("agrega una columna por clave respondida y deja vacía la celda de quien no la respondió", async () => {
    const { db } = fakeDb(ORDENES);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });
    const filas = lineas(contenido);

    // Las dinámicas van a la derecha de las fijas, con la ETIQUETA congelada como encabezado (que
    // es lo que el Organizador reconoce; la `clave` es identidad interna).
    expect(filas[0]).toBe(
      "Fecha,Correo,Total,Comisión,Te queda,Estado,Productos,Teléfono,Talla",
    );
    // El `'` del teléfono es la neutralización de fórmula, que tiene su propio test (csv.006).
    expect(filas[1]!.endsWith(",'+56912345678,M")).toBe(true);
    // I9 — la venta previa a la feature no tiene respuestas: las dos celdas quedan VACÍAS y la fila
    // conserva el mismo número de columnas (una planilla con filas de largo distinto no se abre).
    expect(filas[2]!.endsWith(",,")).toBe(true);
    expect(filas.every((f) => f.split(",").length === 9)).toBe(true);
  });

  // panel.ventas.csv.003 — escapado RFC 4180: comas, comillas y saltos de línea
  it("entrecomilla y escapa las celdas con coma, comilla o salto de línea", async () => {
    const { db } = fakeDb([
      {
        id: "o9",
        tenantId: "A",
        email: "compradora@x.cl",
        estado: "PAGADO",
        total: dec("5000"),
        createdAt: new Date("2026-01-05T15:30:00-03:00"),
        items: [item('Pack "Todo en 1", edición 2026', 1, "5000")],
        payment: { fee: dec("160"), estado: "PAGADO" },
        checkoutResponses: [
          {
            clave: "direccion",
            etiqueta: "Dirección",
            tipo: "TEXTO",
            valor: "Depto 402\nTorre B",
          },
          { clave: "talla", etiqueta: "Talla", tipo: "SELECT", valor: "M" },
        ],
      },
    ]);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });

    // Comilla → se DUPLICA, y el campo entero va entre comillas por la coma del título.
    expect(contenido).toContain('"1 × Pack ""Todo en 1"", edición 2026"');
    // Un salto de línea dentro de una celda es legal en CSV, pero SOLO entrecomillado (si no,
    // parte la fila en dos y la planilla queda corrida).
    expect(contenido).toContain('"Depto 402\nTorre B"');
    // Y no se entrecomilla de más: un valor limpio viaja pelado (si no, la planilla lee `"M"`
    // como texto con comillas en las herramientas que no desescapan).
    expect(contenido.trimEnd().endsWith(",M")).toBe(true);
  });

  // panel.ventas.csv.004 — el archivo que Excel abre bien: BOM UTF-8 + CRLF + nombre con fecha
  it("arranca con el BOM UTF-8 y separa las filas con CRLF", async () => {
    const { db } = fakeDb(ORDENES);

    const { contenido, nombreArchivo } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
      ahora: new Date("2026-07-26T10:00:00-04:00"),
    });

    // Sin BOM, Excel abre el archivo en la codificación del sistema y «Teléfono» sale «TelÃ©fono».
    expect(contenido.startsWith("﻿")).toBe(true);
    expect(contenido.startsWith("﻿Fecha,Correo,")).toBe(true);
    // Un solo BOM, al principio: repetirlo por fila metería basura en cada celda de la 1ª columna.
    expect(contenido.split("﻿")).toHaveLength(2);
    // CRLF entre filas (RFC 4180), no `\n` suelto.
    expect(contenido).toContain("\r\n");
    // El archivo se nombra con el DÍA de Chile, para que dos exports del mismo día no se pisen con
    // uno de ayer en la carpeta de Descargas.
    expect(nombreArchivo).toBe("ventas-2026-07-26.csv");
  });

  // panel.ventas.csv.005 — el valor va CANÓNICO, no humanizado: la planilla tiene que poder sumarlo
  it("exporta el valor canónico (true/false, número crudo), no el humanizado del panel", async () => {
    const { db } = fakeDb([
      {
        id: "o9",
        tenantId: "A",
        email: "compradora@x.cl",
        estado: "PAGADO",
        total: dec("5000"),
        createdAt: new Date("2026-01-05T15:30:00-03:00"),
        items: [item("Libro", 1, "5000")],
        payment: { fee: dec("160"), estado: "PAGADO" },
        checkoutResponses: [
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
    ]);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });
    const fila = lineas(contenido)[1]!;

    // El panel muestra «Sí» (`valorDeRespuesta`); el archivo NO — `true`/`false` es lo que Excel
    // filtra y cuenta. Son las dos caras de la Opción A del usuario (F01): el valor se guarda
    // canónico y cada superficie decide.
    expect(fila.endsWith(",true,8320000")).toBe(true);
    expect(contenido).not.toContain("Sí");
    // Y el número CRUDO, igual que en el detalle: es un código postal, no una cantidad. Con
    // separador de miles Excel lo leería como texto y se acabó la fórmula.
    expect(contenido).not.toContain("8.320.000");
  });

  // panel.ventas.csv.006 — una celda no puede volverse FÓRMULA al abrir el archivo
  it("neutraliza las celdas que Excel interpretaría como fórmula, sin tocar los números", async () => {
    const { db } = fakeDb([
      {
        id: "o9",
        tenantId: "A",
        email: "compradora@x.cl",
        estado: "PAGADO",
        total: dec("5000"),
        createdAt: new Date("2026-01-05T15:30:00-03:00"),
        items: [item("Libro", 1, "5000")],
        payment: { fee: dec("160"), estado: "PAGADO" },
        checkoutResponses: [
          {
            clave: "telefono",
            etiqueta: "Teléfono",
            tipo: "TELEFONO",
            valor: "+56912345678",
          },
          {
            clave: "comentario",
            etiqueta: "Comentario",
            tipo: "TEXTO",
            valor: '=HYPERLINK("http://malo.cl","gana un premio")',
          },
        ],
      },
    ]);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });

    // El teléfono se congela con `+` adelante (F05). Sin neutralizar, Excel lee `+56912345678`
    // como una SUMA y muestra 56912345678: el `+` desaparece y el dato queda mal. Con el prefijo
    // de texto, la celda se lee tal cual se respondió.
    expect(contenido).toContain("'+56912345678");
    // Y el texto libre del Comprador no puede ejecutarse en la planilla del Organizador: es dato
    // de un desconocido llegando a un Excel ajeno (I7).
    expect(contenido).toContain("'=HYPERLINK");
    // Lo que SÍ es número sigue siendo número: montos y NUMERO no llevan prefijo (arrancan con
    // dígito) — si lo llevaran, se acabarían las fórmulas, que es el punto del export.
    expect(contenido).toContain(",5000,160,4840,PAGADO,");
    expect(contenido).not.toContain("'5000");
  });

  // panel.ventas.csv.007 — el encabezado sale del snapshot: campo renombrado y etiquetas repetidas
  it("titula cada columna con la etiqueta vigente y desambigua dos claves que se llaman igual", async () => {
    const venta = (
      id: string,
      dia: string,
      checkoutResponses: RespuestaFake[],
    ): OrdenFake => ({
      id,
      tenantId: "A",
      email: `${id}@x.cl`,
      estado: "PAGADO",
      total: dec("1000"),
      createdAt: new Date(`${dia}T12:00:00-03:00`),
      items: [item("Libro", 1, "1000")],
      payment: { fee: dec("30"), estado: "PAGADO" },
      checkoutResponses,
    });

    // Desc por fecha, como llegan de la DB. La venta NUEVA trae el campo ya renombrado («Fono» →
    // «Teléfono») y una segunda «Talla»: el Organizador borró la vieja y creó otra (D5 — cambiar
    // de tipo obliga a eso), y la derivación de clave le puso el sufijo anti-colisión.
    const { db } = fakeDb([
      venta("o2", "2026-01-05", [
        {
          clave: "telefono",
          etiqueta: "Teléfono",
          tipo: "TELEFONO",
          valor: "56911112222",
        },
        { clave: "talla_2", etiqueta: "Talla", tipo: "SELECT", valor: "L" },
      ]),
      venta("o1", "2026-01-04", [
        {
          clave: "telefono",
          etiqueta: "Fono",
          tipo: "TELEFONO",
          valor: "56933334444",
        },
        { clave: "talla", etiqueta: "Talla", tipo: "TEXTO", valor: "M" },
      ]),
    ]);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });
    const filas = lineas(contenido);

    // Renombrado: UNA sola columna, titulada como el campo se llama HOY (que es como el
    // Organizador lo va a buscar). Las dos respuestas caen en ella, cada una en su fila.
    expect(filas[0]).toBe(
      "Fecha,Correo,Total,Comisión,Te queda,Estado,Productos,Teléfono,Talla (talla_2),Talla (talla)",
    );
    expect(filas[0]).not.toContain("Fono,");
    expect(filas[1]!.endsWith(",56911112222,L,")).toBe(true);
    expect(filas[2]!.endsWith(",56933334444,,M")).toBe(true);
  });

  // panel.ventas.csv.008 — fail-closed: sin membresía no hay archivo (I1/I7)
  it("sin membresía ⇒ FORBIDDEN (no exporta un CSV global)", async () => {
    await expect(
      exportarVentasCsv({ db: fakeDb(ORDENES).db, acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // panel.ventas.csv.009 — el export NO hereda la paginación del listado
  it("exporta TODAS las ventas de la Tienda, no solo la primera página del panel", async () => {
    const muchas = Array.from({ length: 40 }, (_, i) => ({
      ...ORDENES[1]!,
      id: `x${i}`,
      email: `c${i}@x.cl`,
    }));
    const { db, args } = fakeDb(muchas);

    const { contenido } = await exportarVentasCsv({
      db,
      acceso: acceso(["A"]),
    });

    // Encabezado + 40 filas. El listado del panel pagina de a 15 (`PAGE_SIZE`); el archivo NO —
    // exportar «lo que se ve en pantalla» sería entregar un CSV incompleto sin decirlo.
    expect(lineas(contenido)).toHaveLength(41);
    // Y la query no lleva `take` ni `cursor`: la ausencia es el mecanismo, no una casualidad.
    expect(args[0]).not.toHaveProperty("take");
    expect(args[0]).not.toHaveProperty("cursor");
  });
});
