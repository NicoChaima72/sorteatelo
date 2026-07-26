import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { procesarNotificacionSuscripcion } from "~/server/domain/facturacion/procesarNotificacionSuscripcion";
import type {
  FlowPlataformaService,
  FlowSuscripcion,
} from "~/server/services/flowPlataforma";

/**
 * Use case del webhook de suscripciones (F04, D4/D15/D16-C, I2/I3/I9).
 *
 * Lo que estos tests fijan:
 * - **I3**: el estado se lee de `subscription/get` (server-side, credenciales de plataforma), jamás
 *   del cuerpo del POST — el webhook solo aporta un IDENTIFICADOR que hay que verificar.
 * - **Idempotencia**: el ledger `PlatformInvoice` (unique por `flowInvoiceId`) hace que el replay no
 *   duplique filas NI reenvíe correos.
 * - **D4**: quién deja de vender y quién no. El corte exige un invoice VENCIDA.
 * - **D16-C**: la red de detección de suscripciones huérfanas en Flow.
 *
 * `db` FAKE stateful de las 2 tablas que el flujo toca, para poder afirmar QUÉ se persistió.
 */

const SUB_ID = "flow-sub-1";

type Fila = Record<string, unknown>;

interface Escenario {
  /** La suscripción local existe (default: sí, AL_DIA). `null` = no hay fila (huérfana/tardía). */
  suscripcion?: Fila | null;
  invoices?: Fila[];
  txFalla?: Error;
  /**
   * Simula una notificación CONCURRENTE que gana la carrera: se ejecuta justo antes de que la corrida
   * bajo test intente su avance atómico, así que esta ve el estado ya movido y su guard devuelve
   * `count: 0`. Es la única forma honesta de probar con un fake que la decisión de correo sale del
   * guard de la DB y no de una lectura previa.
   */
  otraCorridaGana?: (estado: { suscripciones: Fila[]; invoices: Fila[] }) => void;
}

function fakeDb(s: Escenario = {}) {
  const estado = {
    suscripciones:
      s.suscripcion === null
        ? []
        : [
            {
              id: "sub-local-1",
              tenantId: "A",
              flowSubscriptionId: SUB_ID,
              estado: "AL_DIA",
              montoBruto: new Prisma.Decimal("25000"),
              cancelacionSolicitadaAt: null,
              cancelacionEfectivaAt: null,
              ...(s.suscripcion ?? {}),
            } as Fila,
          ],
    invoices: [...(s.invoices ?? [])] as Fila[],
  };

  /**
   * Modela los filtros que el use case usa DE VERDAD, incluidos los que sostienen la atomicidad
   * (`not` / `notIn`): si el fake los ignorara, los guards de concurrencia serían invisibles al test
   * — la misma lección del `updateMany` de cupones en F03, que sumaba +1 fijo y hacía invisible la
   * liberación.
   */
  const coincide = (fila: Fila, where: Fila): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v !== null && typeof v === "object") {
        const filtro = v as { in?: unknown[]; not?: unknown; notIn?: unknown[] };
        if (Array.isArray(filtro.in)) return filtro.in.includes(fila[k]);
        if (Array.isArray(filtro.notIn)) return !filtro.notIn.includes(fila[k]);
        if ("not" in filtro) return fila[k] !== filtro.not;
        return true;
      }
      return fila[k] === v;
    });

  /** Deja pasar solo los campos definidos, como hace Prisma con un `undefined`. */
  const asignar = (fila: Fila, data: Fila) => {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) fila[k] = v;
    }
  };

  const conRelaciones = (f: Fila) => ({
    ...f,
    tenant: { id: "A", nombre: "Tienda de Ana" },
    pagador: { id: "bc1", email: "ana@x.cl" },
  });

  /** Dispara (una sola vez) la corrida concurrente que gana la carrera. */
  let yaPiso = false;
  const pisar = () => {
    if (s.otraCorridaGana && !yaPiso) {
      yaPiso = true;
      s.otraCorridaGana(estado);
    }
  };

  const tx = {
    platformSubscription: {
      findUnique: async ({ where }: { where: Fila }) => {
        const f = estado.suscripciones.find((x) => coincide(x, where));
        return f ? conRelaciones(f) : null;
      },
      updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
        pisar();
        const filas = estado.suscripciones.filter((x) => coincide(x, where));
        for (const f of filas) asignar(f, data);
        return { count: filas.length };
      },
    },
    platformInvoice: {
      findFirst: async ({ where }: { where: Fila }) =>
        estado.invoices.find((f) => coincide(f, where)) ?? null,
      findMany: async ({ where }: { where?: Fila } = {}) =>
        estado.invoices.filter((f) => coincide(f, where ?? {})),
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Fila[];
        skipDuplicates?: boolean;
      }) => {
        pisar();
        let count = 0;
        for (const fila of data) {
          // El árbitro real es el unique de `flowInvoiceId`.
          const existe = estado.invoices.some(
            (x) => x.flowInvoiceId === fila.flowInvoiceId,
          );
          if (existe) {
            if (!skipDuplicates) throw new Error("unique violation");
            continue;
          }
          estado.invoices.push({ id: `inv-${estado.invoices.length + 1}`, ...fila });
          count++;
        }
        return { count };
      },
      updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
        const filas = estado.invoices.filter((f) => coincide(f, where));
        for (const f of filas) asignar(f, data);
        return { count: filas.length };
      },
    },
  };

  const db = {
    ...tx,
    $transaction: async <T>(fn: (t: unknown) => Promise<T>) => {
      if (s.txFalla) throw s.txFalla;
      return fn(tx);
    },
  } as unknown as PrismaClient;

  return { db, estado };
}

/** Fake del service de plataforma. Mocks como PROPIEDADES (`unbound-method`, precedente F03). */
function fakeFlow(suscripcion: Partial<FlowSuscripcion> = {}) {
  const mocks = {
    getSuscripcion: vi.fn(
      async (): Promise<FlowSuscripcion> => ({
        subscriptionId: SUB_ID,
        status: 1,
        morose: 0,
        period_start: "2026-07-26",
        period_end: "2026-08-26",
        next_invoice_date: "2026-08-26",
        invoices: [],
        ...suscripcion,
      }),
    ),
    cancelarSuscripcion: vi.fn(async () => ({ subscriptionId: SUB_ID })),
  };
  return { flow: mocks as unknown as FlowPlataformaService, mocks };
}

/** Un invoice de Flow pagado / fallido / incobrable, según los campos que mira la derivación. */
const invPagado = (id = "fi-1") => ({
  id,
  paid: 1,
  amount: 25000,
  outstanding: 0,
  payment_date: "2026-07-26",
  period_start: "2026-07-26",
  period_end: "2026-08-26",
});
const invFallido = (id = "fi-1") => ({
  id,
  paid: 0,
  amount: 25000,
  outstanding: 25000,
  attemp: 1,
  next_attemp_date: "2026-08-02",
  paymentLink: "https://flow.cl/pagar/abc",
});
const invIncobrable = (id = "fi-1") => ({
  id,
  paid: 0,
  amount: 25000,
  outstanding: 25000,
  attemp: 3,
  paymentLink: "https://flow.cl/pagar/abc",
});

describe("domain/facturacion/procesarNotificacionSuscripcion", () => {
  // facturacion.notificacion.001 — I3: verifica contra Flow y NO confía en el body
  it("verifica el estado contra la API de Flow (no usa el cuerpo del POST)", async () => {
    const { db } = fakeDb();
    const { flow, mocks } = fakeFlow({ invoices: [invPagado()] });

    await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(mocks.getSuscripcion).toHaveBeenCalledWith(SUB_ID);
  });

  // facturacion.notificacion.002 — cobro OK ⇒ espejo del invoice + AL_DIA + comprobante
  it("un invoice pagado se espeja, deja la suscripción AL_DIA y dispara el comprobante", async () => {
    const { db, estado } = fakeDb();
    const { flow } = fakeFlow({ invoices: [invPagado()] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(r.ruteo).toBe("PROCESADA");
    expect(estado.invoices).toHaveLength(1);
    expect(estado.invoices[0]).toMatchObject({
      flowInvoiceId: "fi-1",
      flowSubscriptionId: SUB_ID,
      estado: "PAGADA",
    });
    // El monto se espeja como Decimal, nunca como number (I2).
    expect(estado.invoices[0]!.montoBruto).toBeInstanceOf(Prisma.Decimal);
    expect(String(estado.invoices[0]!.montoBruto)).toBe("25000");
    expect(estado.suscripciones[0]!.estado).toBe("AL_DIA");
    expect(r.correos.map((c) => c.datos.tipo)).toEqual(["COMPROBANTE_PAGO"]);
    expect(r.correos[0]!.destinatario).toBe("ana@x.cl");
  });

  // facturacion.notificacion.003 — idempotencia: el replay no duplica ni reenvía
  it("el replay de la misma notificación no duplica el invoice ni reenvía correos", async () => {
    const { db, estado } = fakeDb();
    const { flow } = fakeFlow({ invoices: [invPagado()] });

    await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });
    const segunda = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.invoices).toHaveLength(1); // ledger por flowInvoiceId
    expect(segunda.correos).toEqual([]); // nada que avisar: no hubo transición
  });

  // facturacion.notificacion.004 — cobro fallido ⇒ COBRO_PENDIENTE, SIGUE vendiendo, correo con link
  it("un cobro fallido deja COBRO_PENDIENTE y manda el correo con paymentLink y próximo intento", async () => {
    const { db, estado } = fakeDb();
    const { flow } = fakeFlow({ morose: 1, invoices: [invFallido()] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.invoices[0]).toMatchObject({
      estado: "FALLIDA",
      paymentLink: "https://flow.cl/pagar/abc",
      intentos: 1,
    });
    expect(estado.suscripciones[0]!.estado).toBe("COBRO_PENDIENTE");
    expect(r.correos.map((c) => c.datos.tipo)).toEqual(["COBRO_FALLIDO"]);
    expect(r.correos[0]!.datos.paymentLink).toBe("https://flow.cl/pagar/abc");
    expect(r.correos[0]!.datos.proximoIntentoAt).toBeInstanceOf(Date);
  });

  // facturacion.notificacion.005 — dunning agotado ⇒ EN_PAUSA_POR_PAGO + correo de pausa
  it("un invoice incobrable deja la suscripción EN_PAUSA_POR_PAGO y avisa", async () => {
    const { db, estado } = fakeDb({
      suscripcion: { estado: "COBRO_PENDIENTE" },
      invoices: [
        {
          id: "inv-1",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-1",
          flowSubscriptionId: SUB_ID,
          estado: "FALLIDA",
          montoBruto: new Prisma.Decimal("25000"),
        },
      ],
    });
    const { flow } = fakeFlow({ morose: 2, invoices: [invIncobrable()] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.invoices[0]!.estado).toBe("VENCIDA");
    expect(estado.suscripciones[0]!.estado).toBe("EN_PAUSA_POR_PAGO");
    expect(r.correos.map((c) => c.datos.tipo)).toEqual(["TIENDA_EN_PAUSA"]);
  });

  // facturacion.notificacion.006 — pago posterior ⇒ regularizada (comprobante + aviso)
  it("el pago posterior saca la tienda de la pausa y manda comprobante + regularizada", async () => {
    const { db, estado } = fakeDb({
      suscripcion: { estado: "EN_PAUSA_POR_PAGO" },
      invoices: [
        {
          id: "inv-1",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-1",
          flowSubscriptionId: SUB_ID,
          estado: "VENCIDA",
          montoBruto: new Prisma.Decimal("25000"),
        },
      ],
    });
    const { flow } = fakeFlow({ morose: 0, invoices: [invPagado()] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.suscripciones[0]!.estado).toBe("AL_DIA");
    expect(r.correos.map((c) => c.datos.tipo)).toEqual([
      "COMPROBANTE_PAGO",
      "TIENDA_REGULARIZADA",
    ]);
  });

  // facturacion.notificacion.007 — un invoice PAGADA no retrocede por una notificación rancia
  it("una notificación rancia NO devuelve a FALLIDA un invoice ya PAGADA (ni suspende la tienda)", async () => {
    const { db, estado } = fakeDb({
      invoices: [
        {
          id: "inv-1",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-1",
          flowSubscriptionId: SUB_ID,
          estado: "PAGADA",
          montoBruto: new Prisma.Decimal("25000"),
        },
      ],
    });
    const { flow } = fakeFlow({ morose: 0, invoices: [invIncobrable()] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.invoices[0]!.estado).toBe("PAGADA");
    expect(estado.suscripciones[0]!.estado).toBe("AL_DIA");
    expect(r.correos).toEqual([]);
  });

  // facturacion.notificacion.008 — el monto de un invoice PAGADA es inmutable
  it("no reescribe el monto de un invoice ya PAGADA", async () => {
    const { db, estado } = fakeDb({
      invoices: [
        {
          id: "inv-1",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-1",
          flowSubscriptionId: SUB_ID,
          estado: "PAGADA",
          montoBruto: new Prisma.Decimal("25000"),
        },
      ],
    });
    // Flow reporta OTRO monto para el mismo invoice ya pagado.
    const { flow } = fakeFlow({
      invoices: [{ ...invPagado(), amount: 99999 }],
    });

    await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(String(estado.invoices[0]!.montoBruto)).toBe("25000");
  });

  // facturacion.notificacion.009 — cancelada en Flow ⇒ CANCELADA, sin correos del webhook
  it("una suscripción cancelada en Flow queda CANCELADA y no dispara los correos del webhook", async () => {
    const { db, estado } = fakeDb();
    const { flow } = fakeFlow({ status: 4, invoices: [] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.suscripciones[0]!.estado).toBe("CANCELADA");
    expect(r.correos).toEqual([]);
  });

  // facturacion.notificacion.010 — D16-C: huérfana en Flow ⇒ se cancela + alerta
  it("una notificación de una suscripción SIN fila local la cancela en Flow y deja alerta (D16-C)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db, estado } = fakeDb({ suscripcion: null });
    const { flow, mocks } = fakeFlow({
      // Fuera de la ventana de gracia: no es una carrera con la activación.
      period_start: "2026-06-01",
      invoices: [invPagado()],
    });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
      ahora: new Date("2026-07-26T12:00:00Z"),
    });

    expect(r.ruteo).toBe("HUERFANA_CANCELADA");
    expect(mocks.cancelarSuscripcion).toHaveBeenCalledWith({
      subscriptionId: SUB_ID,
      alFinDelPeriodo: false,
    });
    expect(error).toHaveBeenCalled();
    // Cero escrituras: no hay a qué colgar el invoice.
    expect(estado.invoices).toHaveLength(0);
    expect(r.correos).toEqual([]);
  });

  // facturacion.notificacion.011 — la carrera con la activación NO se cancela
  it("NO cancela una suscripción recién creada sin fila local todavía (carrera con la activación)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = fakeDb({ suscripcion: null });
    const { flow, mocks } = fakeFlow({
      period_start: "2026-07-26",
      invoices: [invPagado()],
    });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
      ahora: new Date("2026-07-26T00:01:00Z"), // un minuto después de nacer
    });

    expect(r.ruteo).toBe("HUERFANA_EN_GRACIA");
    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  // facturacion.notificacion.012 — notificación TARDÍA de un slot reusado: ni cancelar ni escribir
  it("una notificación de una suscripción Flow ANTERIOR del mismo slot se ignora sin cancelar nada", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // El slot local se reusó (D6): su flowSubscriptionId es OTRO, pero el ledger recuerda el viejo.
    const { db, estado } = fakeDb({
      suscripcion: { flowSubscriptionId: "flow-sub-2" },
      invoices: [
        {
          id: "inv-viejo",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-viejo",
          flowSubscriptionId: SUB_ID, // snapshot de la suscripción Flow anterior
          estado: "PAGADA",
          montoBruto: new Prisma.Decimal("25000"),
        },
      ],
    });
    const { flow, mocks } = fakeFlow({
      period_start: "2026-01-01",
      invoices: [invPagado("fi-otro")],
    });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
      ahora: new Date("2026-07-26T12:00:00Z"),
    });

    expect(r.ruteo).toBe("TARDIA");
    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
    expect(estado.invoices).toHaveLength(1); // no escribió el invoice ajeno al slot actual
    expect(warn).toHaveBeenCalled();
  });

  // facturacion.notificacion.013 — la compensación de la huérfana que falla no rompe el ack
  it("si cancelar la huérfana en Flow falla, no propaga el error (queda la alerta)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db } = fakeDb({ suscripcion: null });
    const { flow, mocks } = fakeFlow({
      period_start: "2026-06-01",
      invoices: [],
    });
    mocks.cancelarSuscripcion.mockRejectedValue(new Error("flow 503"));

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
      ahora: new Date("2026-07-26T12:00:00Z"),
    });

    expect(r.ruteo).toBe("HUERFANA_CANCELADA");
    expect(error).toHaveBeenCalled();
  });

  // facturacion.notificacion.015 — CONCURRENCIA: dos notificaciones del mismo invoice, UN correo
  it("si otra notificación simultánea gana el avance, esta NO manda el correo de nuevo", async () => {
    // La otra corrida commitea el invoice como PAGADA y la suscripción como AL_DIA justo antes de que
    // esta intente su avance ⇒ los dos guards atómicos devuelven count 0 y no hay correo que mandar.
    const { db, estado } = fakeDb({
      suscripcion: { estado: "EN_PAUSA_POR_PAGO" },
      otraCorridaGana: (e) => {
        e.invoices.push({
          id: "inv-otra",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-1",
          flowSubscriptionId: SUB_ID,
          estado: "PAGADA",
          montoBruto: new Prisma.Decimal("25000"),
        });
        e.suscripciones[0]!.estado = "AL_DIA";
      },
    });
    const { flow } = fakeFlow({ morose: 0, invoices: [invPagado()] });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    // El estado converge igual (lo dejó la otra corrida), pero el correo salió UNA sola vez.
    expect(estado.suscripciones[0]!.estado).toBe("AL_DIA");
    expect(estado.invoices).toHaveLength(1);
    expect(r.correos).toEqual([]);
  });

  // facturacion.notificacion.016 — D16-C: edad DESCONOCIDA no autoriza cancelar
  it("una huérfana sin period_start NO se cancela: el dato ausente no autoriza la acción destructiva", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = fakeDb({ suscripcion: null });
    const { flow, mocks } = fakeFlow({
      period_start: null, // Flow no lo informó (o llegó impresentable)
      invoices: [invPagado()],
    });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
      ahora: new Date("2026-07-26T12:00:00Z"),
    });

    expect(r.ruteo).toBe("HUERFANA_EN_GRACIA");
    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  // facturacion.notificacion.017 — los datos del cobro abierto se refrescan entre reintentos
  it("un segundo reintento fallido refresca intentos y próximo intento sin reenviar el correo", async () => {
    const { db, estado } = fakeDb({
      suscripcion: { estado: "COBRO_PENDIENTE" },
      invoices: [
        {
          id: "inv-1",
          subscriptionId: "sub-local-1",
          flowInvoiceId: "fi-1",
          flowSubscriptionId: SUB_ID,
          estado: "FALLIDA",
          montoBruto: new Prisma.Decimal("25000"),
          intentos: 1,
        },
      ],
    });
    const { flow } = fakeFlow({
      morose: 1,
      invoices: [{ ...invFallido(), attemp: 2, next_attemp_date: "2026-08-09" }],
    });

    const r = await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    expect(estado.invoices[0]!.intentos).toBe(2);
    expect(estado.invoices[0]!.estado).toBe("FALLIDA");
    // Un COBRO_FALLIDO por invoice, no uno por reintento.
    expect(r.correos).toEqual([]);
  });

  // facturacion.notificacion.014 — la fecha del próximo cobro se espeja para el cron de F09
  it("espeja las fechas del período y el próximo cobro de Flow", async () => {
    const { db, estado } = fakeDb();
    const { flow } = fakeFlow({ invoices: [invPagado()] });

    await procesarNotificacionSuscripcion({
      db,
      flow,
      input: { flowSubscriptionId: SUB_ID },
    });

    const sub = estado.suscripciones[0]!;
    expect(sub.periodoFin).toBeInstanceOf(Date);
    expect(sub.proximoCobroAt).toBeInstanceOf(Date);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
