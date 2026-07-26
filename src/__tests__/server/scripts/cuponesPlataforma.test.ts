import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  crearCuponDePlataforma,
  crearCuponInput,
  finDelDiaUTC,
  listarCuponesDePlataforma,
} from "~/server/facturacion/cuponesPlataforma";
import type { FlowCupon, FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Tests del núcleo del CLI de [[Cupón de plataforma]] (F08, D9, ADR-0026). El cupón vive en DOS
 * lados —el descuento en Flow, el código repartible y su trazabilidad en nuestra DB— y este núcleo
 * es lo único que los crea juntos, en la misma corrida.
 *
 * Corre contra un `FlowPlataformaService` fake y un `db` fake: el núcleo recibe los dos inyectados y
 * no toca `env` ni la red (patrón núcleo testeable + wrapper, backend-conventions § Scripts CLI).
 */

const AHORA = new Date("2026-07-26T12:00:00Z");

function fakeFlow(over: Partial<FlowPlataformaService> = {}) {
  const mocks = {
    crearCupon: vi.fn(
      async (input: { name: string }): Promise<FlowCupon> => ({
        id: `flow-cup-${input.name}`,
      }),
    ),
  };
  return { flow: { ...mocks, ...over } as unknown as FlowPlataformaService, mocks };
}

interface CuponFila {
  id: string;
  codigo: string;
  flowCouponId: string;
  tipo: string;
  porcentaje: number | null;
  montoDescuento: Prisma.Decimal | null;
  duracionMeses: number | null;
  expiraAt: Date | null;
  maxCanjes: number | null;
  canjes: number;
  activo: boolean;
  createdAt: Date;
  redemptions?: unknown[];
}

function fakeDb(cupones: Partial<CuponFila>[] = []) {
  const filas = cupones.map((c, i) => ({
    id: `c${i + 1}`,
    codigo: "X",
    flowCouponId: "f1",
    tipo: "PORCENTAJE",
    porcentaje: 50,
    montoDescuento: null,
    duracionMeses: null,
    expiraAt: null,
    maxCanjes: null,
    canjes: 0,
    activo: true,
    createdAt: AHORA,
    redemptions: [],
    ...c,
  })) as CuponFila[];

  const db = {
    platformCoupon: {
      findUnique: async ({ where }: { where: { codigo?: string } }) =>
        filas.find((f) => f.codigo === where.codigo) ?? null,
      findMany: async () => filas,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const codigo = data.codigo as string;
        if (filas.some((f) => f.codigo === codigo)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        // Los DEFAULTS del schema los aplica Postgres, no el caller: el fake los modela para que
        // el test pueda afirmar sobre ellos (un cupón nace con 0 canjes y activo).
        const fila = {
          id: `c${filas.length + 1}`,
          canjes: 0,
          activo: true,
          createdAt: AHORA,
          ...data,
        } as CuponFila;
        filas.push(fila);
        return fila;
      },
    },
  } as unknown as PrismaClient;

  return { db, filas };
}

describe("facturacion/crearCuponDePlataforma", () => {
  // facturacion.cupones.001 — la corrida crea el cupón en Flow Y la fila local, ligados
  it("crea el cupón en Flow y la fila local en la misma corrida, con el código normalizado", async () => {
    const { db, filas } = fakeDb();
    const { flow, mocks } = fakeFlow();

    const r = await crearCuponDePlataforma({
      db,
      flow,
      input: {
        codigo: " army 2026 ",
        tipo: "PORCENTAJE",
        porcentaje: 50,
        duracionMeses: 3,
        maxCanjes: 1,
        nota: "canje personal de la autora",
      },
      ahora: AHORA,
    });

    // El código se normaliza en LOS DOS extremos (crear y canjear): el unique de Postgres es
    // case-sensitive, así que sin esto «army2026» y «ARMY2026» serían dos cupones distintos.
    expect(r.codigo).toBe("ARMY2026");
    expect(filas[0]).toMatchObject({
      codigo: "ARMY2026",
      flowCouponId: expect.stringContaining("flow-cup-") as unknown as string,
      tipo: "PORCENTAJE",
      porcentaje: 50,
      duracionMeses: 3,
      maxCanjes: 1,
      canjes: 0,
      activo: true,
    });

    // Lo que viaja a Flow es el descuento; el código repartible es NUESTRO (Flow no tiene ese
    // concepto, D9) y por eso va como `name`, para poder reconocerlo en el panel de Flow.
    expect(mocks.crearCupon).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ARMY2026",
        percentOff: 50,
        duracionPeriodos: 3,
        maxRedemptions: 1,
      }),
    );
  });

  // facturacion.cupones.002 — un código repetido NO deja un cupón inerte en Flow
  it("rechaza un código ya existente antes de crear nada en Flow", async () => {
    const { db, filas } = fakeDb([{ codigo: "ARMY2026" }]);
    const { flow, mocks } = fakeFlow();

    await expect(
      crearCuponDePlataforma({
        db,
        flow,
        // En minúsculas y con espacios: la colisión se detecta sobre el código NORMALIZADO, que es
        // como está en la DB. Comparar el texto crudo dejaría entrar un duplicado.
        input: { codigo: "army 2026", tipo: "PORCENTAJE", porcentaje: 20 },
        ahora: AHORA,
      }),
    ).rejects.toThrow(/ARMY2026/);

    // Lo que importa: no se llamó a Flow. Un cupón creado allá que acá no existe es inerte —nadie
    // lo puede canjear, porque el canje entra por el código— pero ensucia la cuenta para siempre.
    expect(mocks.crearCupon).not.toHaveBeenCalled();
    expect(filas).toHaveLength(1);
  });

  // facturacion.cupones.003 — el tipo manda cuál de los dos montos va (validación del input)
  it("no acepta un cupón que declare un tipo y traiga el descuento del otro", () => {
    const casos = [
      { codigo: "AAA111", tipo: "PORCENTAJE" as const }, // sin porcentaje
      { codigo: "AAA111", tipo: "PORCENTAJE" as const, montoDescuento: "5000" },
      { codigo: "AAA111", tipo: "MONTO" as const, porcentaje: 50 },
      { codigo: "AAA111", tipo: "PORCENTAJE" as const, porcentaje: 0 }, // fuera de 1..100
      { codigo: "AAA111", tipo: "PORCENTAJE" as const, porcentaje: 101 },
      // Monto con decimales: la plata es Decimal y el CLP no tiene centavos (I2).
      { codigo: "AAA111", tipo: "MONTO" as const, montoDescuento: "5000.5" },
    ];
    for (const caso of casos) {
      expect(crearCuponInput.safeParse(caso).success).toBe(false);
    }

    // Los dos válidos, para que el test no pase por prohibirlo todo.
    expect(
      crearCuponInput.safeParse({ codigo: "AAA111", tipo: "PORCENTAJE", porcentaje: 50 })
        .success,
    ).toBe(true);
    expect(
      crearCuponInput.safeParse({ codigo: "AAA111", tipo: "MONTO", montoDescuento: "5000" })
        .success,
    ).toBe(true);
  });

  // facturacion.cupones.004 — un cupón que nace vencido no se crea
  it("rechaza una expiración que ya pasó, sin tocar Flow", async () => {
    const { db } = fakeDb();
    const { flow, mocks } = fakeFlow();

    await expect(
      crearCuponDePlataforma({
        db,
        flow,
        input: {
          codigo: "TARDE1",
          tipo: "PORCENTAJE",
          porcentaje: 10,
          expiraAt: new Date("2026-07-25T00:00:00Z"), // ayer
        },
        ahora: AHORA,
      }),
    ).rejects.toThrow(/ya pasó/);
    expect(mocks.crearCupon).not.toHaveBeenCalled();
  });
});

describe("facturacion/listarCuponesDePlataforma", () => {
  // facturacion.cupones.005 — los canjes salen de las REDENCIONES, no del contador
  it("cuenta los canjes sobre las redenciones y muestra quién entró por cada código", async () => {
    const { db } = fakeDb([
      {
        codigo: "ARMY2026",
        tipo: "PORCENTAJE",
        porcentaje: 50,
        duracionMeses: 1,
        maxCanjes: 2,
        // El contador DIVERGE a propósito en este escenario: así está declarado en el schema (existe
        // solo para el guard atómico de la carrera). Si el listado lo reportara, diría 7.
        canjes: 7,
        redemptions: [
          {
            tenantId: "t1",
            subscriptionId: "sub-1", // canje CONSUMADO
            createdAt: new Date("2026-07-20T10:00:00Z"),
            tenant: { nombre: "Tienda de la autora" },
            pagador: { email: "autora@x.cl" },
          },
          {
            tenantId: "t2",
            subscriptionId: "sub-2",
            createdAt: new Date("2026-07-21T10:00:00Z"),
            tenant: { nombre: "Demo" },
            pagador: { email: "autora@x.cl" }, // el MISMO Pagador: el «quién» de D9
          },
          {
            // Reserva ABANDONADA: tipeó el código y no volvió de Flow. Ocupa cupo pero se libera
            // sola al reintentar ⇒ NO es un canje.
            tenantId: "t3",
            subscriptionId: null,
            createdAt: new Date("2026-07-22T10:00:00Z"),
            tenant: { nombre: "La que abandonó" },
            pagador: { email: "otra@x.cl" },
          },
        ],
      },
      { codigo: "MONTO5K", tipo: "MONTO", porcentaje: null, montoDescuento: new Prisma.Decimal("5000"), activo: false },
    ]);

    const r = await listarCuponesDePlataforma({ db });

    expect(r[0]).toMatchObject({
      codigo: "ARMY2026",
      descuento: "50%",
      duracion: "1 mes",
      canjes: 2, // NO 7 (el contador) y NO 3 (contando la reserva abandonada)
      reservasEnCurso: 1,
      maxCanjes: 2,
      activo: true,
    });
    // El «quién» de D9: los dos canjes son del MISMO Pagador con dos tiendas distintas — que es
    // exactamente lo que un cupón con tope querría poder ver.
    expect(
      r[0]?.redenciones.map((x) => [x.tenantNombre, x.pagadorEmail, x.consumado]),
    ).toEqual([
      ["Tienda de la autora", "autora@x.cl", true],
      ["Demo", "autora@x.cl", true],
      ["La que abandonó", "otra@x.cl", false],
    ]);

    // El cupón de monto se lee como plata y el kill switch se ve: un cupón desactivado sigue
    // existiendo (sus canjes le sobreviven) y el listado tiene que decirlo.
    expect(r[1]).toMatchObject({
      codigo: "MONTO5K",
      descuento: "$5000",
      duracion: "siempre",
      activo: false,
      canjes: 0,
      reservasEnCurso: 0,
    });
  });
});

describe("facturacion/cuponesPlataforma — bordes que el camino feliz esconde", () => {
  // facturacion.cupones.006 — la carrera P2002 nombra el cupón que quedó suelto en Flow
  it("si la escritura local falla, el error nombra el flowCouponId huérfano", async () => {
    const { db } = fakeDb();
    // El pre-chequeo no ve la fila (otra corrida la insertó justo después), así que el árbitro real
    // es el `@unique` — la rama que porta el único dato con el que se limpia a mano.
    (db.platformCoupon.create as unknown) = async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    };
    const { flow } = fakeFlow();

    await expect(
      crearCuponDePlataforma({
        db,
        flow,
        input: { codigo: "CARRERA1", tipo: "PORCENTAJE", porcentaje: 10 },
        ahora: AHORA,
      }),
    ).rejects.toThrow(/flow-cup-CARRERA1/);
  });

  // facturacion.cupones.007 — un 200 de Flow SIN id no puede dejar una fila canjeable
  it("no escribe la fila si Flow no devuelve un id de cupón", async () => {
    const { db, filas } = fakeDb();
    const { flow } = fakeFlow({
      crearCupon: vi.fn(async () => ({}) as FlowCupon),
    });

    // Sin este guard la fila quedaría con `flowCouponId: "undefined"`: un código VIVO que le haría
    // reventar el `subscription/create` a un Organizador que no tiene nada que ver con el cupón.
    await expect(
      crearCuponDePlataforma({
        db,
        flow,
        input: { codigo: "SINID1", tipo: "PORCENTAJE", porcentaje: 10 },
        ahora: AHORA,
      }),
    ).rejects.toThrow(/no devolvió un id/);
    expect(filas).toHaveLength(0);
  });

  // facturacion.cupones.008 — `--expira DD` deja canjear TODO ese día (política, no cableado)
  it("la expiración de un día se sella al final de ese día, en los dos extremos", () => {
    const limite = finDelDiaUTC("2026-12-31");

    // Nuestro lado: `evaluarCanje` compara con `<=`, así que el 31 a las 23:00 todavía vale.
    expect(limite.getTime()).toBeGreaterThan(
      new Date("2026-12-31T23:00:00Z").getTime(),
    );
    // El lado de Flow: lo que viaja es `toISOString().slice(0, 10)`. Sellarlo a las 00:00 del día
    // siguiente habría mandado a Flow un día de MÁS.
    expect(limite.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});
