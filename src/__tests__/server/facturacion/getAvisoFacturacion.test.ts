import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getAvisoFacturacion } from "~/server/domain/facturacion/getAvisoFacturacion";

/**
 * Tests de `getAvisoFacturacion` (F05/D4) — la query que el chrome del panel consulta en TODA página
 * para decidir dos cosas: qué banner de morosidad mostrar y si el rail se reduce a «Plan».
 *
 * Es una query de CHROME: corre en cada página del panel, así que lo que se afirma acá incluye que no
 * gaste consultas cuando no hay nada que avisar (el caso del 99% de las tiendas).
 */

const AHORA = new Date("2026-07-26T12:00:00Z");

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

interface Escenario {
  estado?: "ALTA" | "CONFIGURACION" | "PUBLICADA" | "SUSPENDIDA";
  suscripcion?: { estado: "AL_DIA" | "COBRO_PENDIENTE" | "EN_PAUSA_POR_PAGO" | "CANCELADA" } | null;
  exencion?: { exentaHasta: Date | null } | null;
  /** Invoices de la suscripción, en el orden que los devolvería el `orderBy` del use case. */
  invoices?: { paymentLink: string | null }[];
}

function fakeDb(s: Escenario = {}) {
  const consultasDeInvoice: unknown[] = [];
  const db = {
    tenant: {
      findUnique: async () => ({
        estado: s.estado ?? "PUBLICADA",
        platformSubscription: s.suscripcion ?? null,
        platformExemption: s.exencion ?? null,
      }),
    },
    platformInvoice: {
      findFirst: async (args: unknown) => {
        consultasDeInvoice.push(args);
        return s.invoices?.[0] ?? null;
      },
    },
  } as unknown as PrismaClient;
  return { db, consultasDeInvoice };
}

describe("domain/facturacion/getAvisoFacturacion", () => {
  // facturacion.aviso.001 — scoping: el input SELECCIONA entre lo ya autorizado, jamás autoriza (I1)
  it("sin membresía en la Tienda del host es FORBIDDEN", async () => {
    const { db } = fakeDb();
    await expect(
      getAvisoFacturacion({ db, acceso: acceso([]), ahora: AHORA }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // facturacion.aviso.002 — la tienda al día no ve banner, y no se paga una query de invoices por ella
  it("la tienda al día no avisa nada y no consulta invoices", async () => {
    const { db, consultasDeInvoice } = fakeDb({
      suscripcion: { estado: "AL_DIA" },
    });

    const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    expect(r).toEqual({
      aviso: null,
      paymentLink: null,
      enPausa: false,
      exentaHastaIso: null,
    });
    // Esta query corre en CADA página del panel: sin aviso no hay `paymentLink` que buscar.
    expect(consultasDeInvoice).toHaveLength(0);
  });

  // facturacion.aviso.003 — dunning en curso: avisa CON el link para pagar, y la tienda sigue vendiendo
  it("con el cobro fallido avisa y trae el paymentLink, sin poner el panel en modo restringido", async () => {
    const { db } = fakeDb({
      suscripcion: { estado: "COBRO_PENDIENTE" },
      invoices: [{ paymentLink: "https://flow.cl/pay/abc" }],
    });

    const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    expect(r.aviso).toBe("COBRO_PENDIENTE");
    expect(r.paymentLink).toBe("https://flow.cl/pay/abc");
    // D4 literal: durante los reintentos de Flow solo se AVISA — el panel queda entero.
    expect(r.enPausa).toBe(false);
  });

  // facturacion.aviso.004 — agotado el dunning: avisa, trae el link y restringe el panel
  it("en pausa por pago avisa, trae el paymentLink y marca el modo restringido", async () => {
    const { db } = fakeDb({
      suscripcion: { estado: "EN_PAUSA_POR_PAGO" },
      invoices: [{ paymentLink: "https://flow.cl/pay/xyz" }],
    });

    const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    expect(r).toEqual({
      aviso: "EN_PAUSA_POR_PAGO",
      paymentLink: "https://flow.cl/pay/xyz",
      enPausa: true,
      exentaHastaIso: null,
    });
  });

  // facturacion.aviso.005 — sin plan y cortesía vencida: los otros 2 motivos, sin link que ofrecer
  it("sin plan y con la exención vencida avisa el motivo exacto, sin paymentLink", async () => {
    for (const [escenario, esperado] of [
      [{ suscripcion: null }, "SIN_PLAN"],
      [
        { suscripcion: null, exencion: { exentaHasta: new Date("2026-01-01T00:00:00Z") } },
        "EXENCION_EXPIRADA",
      ],
    ] as const) {
      const { db } = fakeDb(escenario);
      const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

      expect(r.aviso).toBe(esperado);
      expect(r.enPausa).toBe(true);
      // No hay invoice impago que regularizar: acá se re-suscribe, no se paga un link.
      expect(r.paymentLink).toBeNull();
    }
  });

  // facturacion.aviso.006 — la tienda que todavía se configura no ve banner de morosidad
  it("una tienda en configuración no avisa nada ni queda restringida", async () => {
    const { db } = fakeDb({ estado: "CONFIGURACION", suscripcion: null });

    const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    // Sería el peor recibimiento posible: una tienda recién creada, que todavía no publica ni debe
    // nada, con un cartel rojo diciéndole que no tiene plan.
    expect(r).toEqual({
      aviso: null,
      paymentLink: null,
      enPausa: false,
      exentaHastaIso: null,
    });
  });

  // facturacion.aviso.007 — despublicada morosa: avisa la deuda pero NO restringe el panel (D6)
  it("una tienda despublicada con el cobro fallido avisa la deuda sin restringir el panel", async () => {
    const { db } = fakeDb({
      estado: "CONFIGURACION",
      suscripcion: { estado: "COBRO_PENDIENTE" },
      invoices: [{ paymentLink: "https://flow.cl/pay/abc" }],
    });

    const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    // Despublicar no cancela la suscripción (D6): la deuda sigue viva y hay que decirlo.
    expect(r.aviso).toBe("COBRO_PENDIENTE");
    expect(r.enPausa).toBe(false);
  });

  // facturacion.aviso.009 — cortesía por vencer: avisa con su fecha y sin gastar la query de invoices
  it("avisa la cortesía por vencer con la fecha de término, sin consultar invoices", async () => {
    const exentaHasta = new Date("2026-07-30T12:00:00Z"); // faltan 4 días: dentro de la ventana
    const { db, consultasDeInvoice } = fakeDb({
      suscripcion: null,
      exencion: { exentaHasta },
    });

    const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    expect(r.aviso).toBe("EXENCION_POR_EXPIRAR");
    // La cortesía TODAVÍA vale: la tienda vende y el panel queda entero. Es un preaviso.
    expect(r.enPausa).toBe(false);
    // El banner nombra el día: «termina pronto» obligaría al Organizador a averiguar cuándo.
    expect(r.exentaHastaIso).toBe(exentaHasta.toISOString());
    // Una tienda cortesía no tiene suscripción ni invoices: buscar un `paymentLink` sería gastar
    // una consulta —en CADA página del panel— por algo que no existe.
    expect(consultasDeInvoice).toHaveLength(0);
    expect(r.paymentLink).toBeNull();
  });

  // facturacion.aviso.010 — fuera de la ventana no se molesta a nadie (ni a la perpetua del D3)
  it("no avisa nada a la cortesía perpetua ni a la que vence dentro de un mes", async () => {
    for (const exentaHasta of [null, new Date("2026-08-26T12:00:00Z")]) {
      const { db } = fakeDb({ suscripcion: null, exencion: { exentaHasta } });

      const r = await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

      // La perpetua es la del grandfathering del despliegue (D3): no vence nunca y no tiene por qué
      // ver un cartel. La de un mes tampoco: el aviso llega cuando hay algo que hacer.
      expect(r).toEqual({
        aviso: null,
        paymentLink: null,
        enPausa: false,
        exentaHastaIso: null,
      });
    }
  });

  // facturacion.aviso.008 — el link sale de un invoice IMPAGO, nunca de uno ya pagado
  it("busca el paymentLink solo entre los invoices impagos de esta suscripción", async () => {
    const { db, consultasDeInvoice } = fakeDb({
      suscripcion: { estado: "EN_PAUSA_POR_PAGO" },
      invoices: [{ paymentLink: "https://flow.cl/pay/xyz" }],
    });

    await getAvisoFacturacion({ db, acceso: acceso(["A"]), ahora: AHORA });

    // Ofrecerle el link de un cobro ya pagado sería invitarlo a pagar dos veces la misma mensualidad.
    expect(consultasDeInvoice[0]).toMatchObject({
      where: {
        subscription: { tenantId: "A" },
        estado: { in: ["FALLIDA", "VENCIDA"] },
        paymentLink: { not: null },
      },
    });
  });
});
