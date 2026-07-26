import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getEstadoPlan } from "~/server/domain/facturacion/getEstadoPlan";

/**
 * Tests de `getEstadoPlan` (F03/F10, D12) — la query que alimenta el paso «Activa tu plan» y la
 * futura página «Plan» del admin.
 *
 * Lo que se afirma acá es sobre todo lo que la query NO puede hacer: no puede dejar que el cliente
 * proponga un precio (I4), no puede devolver de la tarjeta nada más que marca y últimos 4 (I7), y no
 * puede leer la tarjeta de quien está mirando en vez de la del Pagador real de la Tienda (D1).
 */

const AHORA = new Date("2026-07-26T12:00:00Z");

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

interface Escenario {
  /** Suscripción de ESTA Tienda ("A"), con su Pagador embebido como la trae el `select`. */
  suscripcion?: Record<string, unknown> | null;
  /** Otras suscripciones del Pagador de la sesión (las que deciden FULL vs ADICIONAL). */
  otras?: Record<string, unknown>[];
  /** El `PlatformBillingCustomer` del User de la sesión. */
  customerDeLaSesion?: Record<string, unknown> | null;
  exencion?: { motivo: string; exentaHasta: Date | null } | null;
  /** Espejo de los cobros de Flow (`PlatformInvoice`) que alimenta el historial de la página Plan. */
  invoices?: Record<string, unknown>[];
}

function fakeDb(s: Escenario = {}): PrismaClient {
  return {
    platformSubscription: {
      findUnique: async () => s.suscripcion ?? null,
      findMany: async () => s.otras ?? [],
    },
    platformExemption: { findUnique: async () => s.exencion ?? null },
    platformBillingCustomer: {
      findUnique: async () => s.customerDeLaSesion ?? null,
    },
    platformInvoice: {
      // El `where` llega SIEMPRE scopeado por la relación (`subscription.tenantId`): el fake lo
      // exige para que un día que se caiga el scoping el test lo vea, en vez de devolver todo.
      findMany: async (args: { where: { subscription: { tenantId: string } } }) => {
        if (args.where.subscription.tenantId !== "A") {
          throw new Error("historial pedido sin scoping por la Tienda del host");
        }
        return s.invoices ?? [];
      },
    },
  } as unknown as PrismaClient;
}

const suscripcionFull = (extra: Record<string, unknown> = {}) => ({
  estado: "AL_DIA",
  plan: "FULL",
  montoBruto: new Prisma.Decimal("25000"),
  periodoFin: new Date("2026-08-26T00:00:00Z"),
  proximoCobroAt: new Date("2026-08-26T00:00:00Z"),
  cancelacionEfectivaAt: null,
  planProgramado: null,
  pagador: { tarjetaMarca: "Visa", tarjetaUltimos4: "4242" },
  ...extra,
});

describe("domain/facturacion/getEstadoPlan", () => {
  // facturacion.estadoPlan.001 — sin nada activado: no hay plan, y el precio es el de la 1ª tienda
  it("una tienda sin plan ni exención cotiza FULL y no tiene tarjeta", async () => {
    const r = await getEstadoPlan({
      db: fakeDb(),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.suscripcion).toBeNull();
    expect(r.exenta).toBe(false);
    expect(r.tarjeta).toBeNull();
    expect(r.planQueCorresponde).toBe("FULL");
    expect(r.montoQueCorresponde).toBe("25000");
    expect(r.esTiendaAdicional).toBe(false);
  });

  // facturacion.estadoPlan.002 — I4: el precio lo decide el SERVER contando las activas del Pagador
  it("cotiza ADICIONAL (mitad de precio) si el Pagador ya tiene otra tienda activa", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({
        customerDeLaSesion: { id: "bc1", tarjetaMarca: null, tarjetaUltimos4: null },
        otras: [
          {
            id: "s0",
            tenantId: "OTRA",
            plan: "FULL",
            estado: "AL_DIA",
            createdAt: new Date("2026-06-01T00:00:00Z"),
          },
        ],
      }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.planQueCorresponde).toBe("ADICIONAL");
    expect(r.montoQueCorresponde).toBe("12500");
    // Lo que la UI usa para EXPLICAR la mitad de precio en vez de mostrar un número sin razón.
    expect(r.esTiendaAdicional).toBe(true);
  });

  // facturacion.estadoPlan.003 — una tienda CANCELADA del mismo Pagador no cuenta como tienda activa
  it("no cobra precio de tienda adicional por una suscripción cancelada del Pagador", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({
        customerDeLaSesion: { id: "bc1", tarjetaMarca: null, tarjetaUltimos4: null },
        otras: [
          {
            id: "s0",
            tenantId: "OTRA",
            plan: "FULL",
            estado: "CANCELADA",
            createdAt: new Date("2026-06-01T00:00:00Z"),
          },
        ],
      }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.planQueCorresponde).toBe("FULL");
    expect(r.montoQueCorresponde).toBe("25000");
  });

  // facturacion.estadoPlan.004 — el monto sale como STRING de Decimal, sin aritmética en el cliente
  it("expone los montos como string entero de Decimal (CLP sin decimales)", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({ suscripcion: suscripcionFull() }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.suscripcion?.montoBruto).toBe("25000");
    expect(typeof r.suscripcion?.montoBruto).toBe("string");
    expect(r.montoQueCorresponde).toBe("25000");
  });

  // facturacion.estadoPlan.005 — I7: de la tarjeta salen SOLO marca y últimos 4
  it("de la tarjeta devuelve únicamente marca y últimos 4", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({ suscripcion: suscripcionFull() }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.tarjeta).toEqual({ marca: "Visa", ultimos4: "4242" });
    // Nada reversible ni nada del PAN puede colarse aunque el select crezca.
    expect(Object.keys(r.tarjeta!)).toEqual(["marca", "ultimos4"]);
  });

  // facturacion.estadoPlan.006 — D1: la tarjeta es la del PAGADOR de la Tienda, no la de quien mira
  it("muestra la tarjeta del Pagador de la Tienda, no la del User de la sesión", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({
        // El Pagador real de la Tienda puso una Mastercard…
        suscripcion: suscripcionFull({
          pagador: { tarjetaMarca: "Mastercard", tarjetaUltimos4: "1111" },
        }),
        // …y quien está mirando es otra membresía, con SU propia tarjeta registrada en otra tienda.
        customerDeLaSesion: {
          id: "bc-otro",
          tarjetaMarca: "Visa",
          tarjetaUltimos4: "9999",
        },
      }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.tarjeta).toEqual({ marca: "Mastercard", ultimos4: "1111" });
  });

  // facturacion.estadoPlan.007 — exención PERPETUA: exenta, y con el motivo a la vista
  it("una exención perpetua deja la tienda exenta", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({ exencion: { motivo: "CORTESIA", exentaHasta: null } }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.exenta).toBe(true);
    expect(r.exencion).toEqual({ motivo: "CORTESIA", exentaHastaIso: null });
  });

  // facturacion.estadoPlan.008 — D8: la vigencia se evalúa LAZY contra `ahora`, sin cron
  it("una exención con fecha vencida deja de eximir, evaluada contra el instante recibido", async () => {
    const escenario = {
      exencion: {
        motivo: "GRANDFATHER",
        exentaHasta: new Date("2026-07-20T00:00:00Z"),
      },
    };

    const vencida = await getEstadoPlan({
      db: fakeDb(escenario),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });
    expect(vencida.exenta).toBe(false);
    // La fila sigue ahí (la UI puede explicar «tu cortesía venció el …»): lo que cambió es el gate.
    expect(vencida.exencion?.motivo).toBe("GRANDFATHER");

    // El MISMO dato, un día antes del corte, sí exime.
    const vigente = await getEstadoPlan({
      db: fakeDb(escenario),
      acceso: acceso(["A"]),
      ahora: new Date("2026-07-19T00:00:00Z"),
    });
    expect(vigente.exenta).toBe(true);
  });

  // facturacion.estadoPlan.010 — qué pasa al vencer la cortesía: ¿se queda sin plan o no? (F07/D8)
  it("dice si al vencer la exención la Tienda se queda sin plan, y no lo espeja el cliente", async () => {
    const cortesia = {
      motivo: "CORTESIA",
      exentaHasta: new Date("2026-07-30T12:00:00Z"),
    };

    // Cortesía sola: al vencer no queda nada que sostenga la venta ⇒ la página explica el después.
    const sinPlan = await getEstadoPlan({
      db: fakeDb({ exencion: cortesia }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });
    expect(sinPlan.quedaSinPlanAlVencerLaExencion).toBe(true);

    // Cortesía otorgada SOBRE una suscripción viva: el vencimiento es un no-evento. Prometerle
    // «vas a poder activar tu plan» a quien ya lo tiene —y a quien Flow le cobra todos los meses—
    // sería falso; y el `montoQueCorresponde` que acompaña esa frase ni siquiera es el suyo.
    for (const estado of ["AL_DIA", "COBRO_PENDIENTE"] as const) {
      const conPlan = await getEstadoPlan({
        db: fakeDb({ exencion: cortesia, suscripcion: suscripcionFull({ estado }) }),
        acceso: acceso(["A"]),
        ahora: AHORA,
      });
      expect(conPlan.quedaSinPlanAlVencerLaExencion).toBe(false);
    }

    // En cambio un plan que YA no sostiene la venta no cambia nada: al vencer la cortesía la tienda
    // queda igual de parada, así que el después sí hay que explicarlo.
    for (const estado of ["CANCELADA", "EN_PAUSA_POR_PAGO"] as const) {
      const conPlanMuerto = await getEstadoPlan({
        db: fakeDb({ exencion: cortesia, suscripcion: suscripcionFull({ estado }) }),
        acceso: acceso(["A"]),
        ahora: AHORA,
      });
      expect(conPlanMuerto.quedaSinPlanAlVencerLaExencion).toBe(true);
    }
  });

  // facturacion.estadoPlan.011 — F10: el historial de cobros, scopeado y sin invitar a pagar dos veces
  it("devuelve el historial de cobros de la Tienda y solo ofrece link en los impagos", async () => {
    const r = await getEstadoPlan({
      db: fakeDb({
        suscripcion: suscripcionFull(),
        invoices: [
          {
            id: "inv-2",
            estado: "FALLIDA",
            montoBruto: new Prisma.Decimal("25000"),
            emitidaAt: new Date("2026-07-26T00:00:00Z"),
            pagadaAt: null,
            createdAt: new Date("2026-07-26T00:00:00Z"),
            paymentLink: "https://flow.cl/pagar/abc",
          },
          {
            id: "inv-1",
            estado: "PAGADA",
            montoBruto: new Prisma.Decimal("25000"),
            emitidaAt: new Date("2026-06-26T00:00:00Z"),
            pagadaAt: new Date("2026-06-26T02:00:00Z"),
            createdAt: new Date("2026-06-26T00:00:00Z"),
            // Flow deja el link aunque el cobro ya se haya pagado…
            paymentLink: "https://flow.cl/pagar/viejo",
          },
        ],
      }),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });

    expect(r.historial).toEqual([
      {
        id: "inv-2",
        estado: "FALLIDA",
        montoBruto: "25000",
        fechaIso: "2026-07-26T00:00:00.000Z",
        paymentLink: "https://flow.cl/pagar/abc",
      },
      {
        id: "inv-1",
        estado: "PAGADA",
        montoBruto: "25000",
        fechaIso: "2026-06-26T00:00:00.000Z",
        // …y acá se corta a propósito: ofrecerle el link de un cobro ya pagado sería invitar al
        // Organizador a pagar dos veces la misma mensualidad.
        paymentLink: null,
      },
    ]);
  });

  // facturacion.estadoPlan.012 — F10: cambiar la tarjeta es cosa del Pagador, no de toda membresía
  it("solo le ofrece cambiar la tarjeta al Pagador de la Tienda", async () => {
    const conPagador = (userId: string) =>
      fakeDb({
        suscripcion: suscripcionFull({
          pagador: {
            userId,
            tarjetaMarca: "Visa",
            tarjetaUltimos4: "4242",
          },
        }),
      });

    // Quien puso la tarjeta es quien la puede cambiar: registrar una nueva sobre el customer de Flow
    // del Pagador desde otra membresía sería hacer que pague alguien que no eligió pagar.
    const elPagador = await getEstadoPlan({
      db: conPagador("u1"),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });
    expect(elPagador.soyElPagador).toBe(true);

    const otraMembresia = await getEstadoPlan({
      db: conPagador("u-otro"),
      acceso: acceso(["A"]),
      ahora: AHORA,
    });
    expect(otraMembresia.soyElPagador).toBe(false);
    // Y el `userId` del Pagador NO sale al cliente: lo que viaja es la respuesta, no el dato.
    expect(JSON.stringify(otraMembresia)).not.toContain("u-otro");
  });

  // facturacion.estadoPlan.009 — sin membresía del tenant del host ⇒ FORBIDDEN (ADR-0005)
  it("rechaza a quien no tiene membresía de la Tienda del host", async () => {
    await expect(
      getEstadoPlan({
        db: fakeDb(),
        acceso: { ...acceso(["A"]), tenantIdDelHost: "AJENO" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
