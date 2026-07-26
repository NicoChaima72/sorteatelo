import { Prisma, type PlatformSubscriptionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { barrerAvisosDeFacturacion } from "~/server/facturacion/avisosProgramados";

/**
 * Tests del barrido del **cron diario de facturación** (F09/D11, ADR-0026): los dos correos que Flow
 * no dispara — el aviso previo de cada renovación (7) y el aviso de que la cortesía se termina (6).
 *
 * El `db` es FAKE pero modela los filtros y —sobre todo— los **guards atómicos** de verdad
 * (`updateMany` condicional sobre la marca de idempotencia). Si el fake ignorara esos `where`, la
 * idempotencia del cron sería INVISIBLE al test, que es justo la lección de F03/F04/F06: un correo
 * no se puede des-enviar, y el cron de Vercel es best-effort (puede duplicar una corrida).
 */

const AHORA = new Date("2026-08-10T12:00:00Z");

interface SuscripcionFake {
  id: string;
  estado: PlatformSubscriptionStatus;
  proximoCobroAt: Date | null;
  renovacionAvisadaPara: Date | null;
  cancelacionSolicitadaAt: Date | null;
  montoBruto: string;
  planProgramado?: "FULL" | "ADICIONAL" | null;
  planProgramadoDesde?: Date | null;
  nombreTienda: string;
  emailPagador: string;
}

function suscripcion(over: Partial<SuscripcionFake> = {}): SuscripcionFake {
  return {
    id: "sub-1",
    estado: "AL_DIA",
    proximoCobroAt: new Date("2026-08-11T04:00:00Z"),
    renovacionAvisadaPara: null,
    cancelacionSolicitadaAt: null,
    montoBruto: "25000",
    planProgramado: null,
    planProgramadoDesde: null,
    nombreTienda: "Tienda de Ana",
    emailPagador: "ana@pagadora.cl",
    ...over,
  };
}

interface ExencionFake {
  id: string;
  /** `null` = cortesía PERPETUA (el GRANDFATHER del despliegue): no vence, no se avisa. */
  exentaHasta: Date | null;
  avisoExpiracionEnviadoAt: Date | null;
  nombreTienda: string;
  /** La Tienda exenta puede además tener suscripción (cortesía otorgada SOBRE un plan). */
  estadoSuscripcion?: PlatformSubscriptionStatus | null;
  emailPagador?: string | null;
  /** Email del Organizador (membresía más antigua): el receptor cuando no hay Pagador. */
  emailOrganizador?: string | null;
}

function exencion(over: Partial<ExencionFake> = {}): ExencionFake {
  return {
    id: "ex-1",
    exentaHasta: new Date("2026-08-15T00:00:00Z"),
    avisoExpiracionEnviadoAt: null,
    nombreTienda: "Tienda de Ana",
    estadoSuscripcion: null,
    emailPagador: null,
    emailOrganizador: "ana@organizadora.cl",
    ...over,
  };
}

/** Rango `{ gt?, lte? }` de Prisma sobre una fecha nullable. */
function enRango(
  valor: Date | null,
  rango: { gt?: Date; lte?: Date } | undefined,
): boolean {
  if (rango === undefined) return true;
  if (valor === null) return false;
  if (rango.gt !== undefined && valor.getTime() <= rango.gt.getTime()) return false;
  if (rango.lte !== undefined && valor.getTime() > rango.lte.getTime()) return false;
  return true;
}

/**
 * Evalúa el `where` del guard atómico sobre la marca de idempotencia: `OR: [{ campo: null },
 * { campo: { not | lt } }]`. Modelarlo de verdad es lo que hace visible el guard.
 */
function cumpleGuardMarca(
  marca: Date | null,
  or: { igual?: Date | null; not?: Date; lt?: Date }[],
): boolean {
  return or.some((cond) => {
    if ("igual" in cond) return marca === null && cond.igual === null;
    if (cond.not !== undefined) {
      return marca !== null && marca.getTime() !== cond.not.getTime();
    }
    if (cond.lt !== undefined) {
      return marca !== null && marca.getTime() < cond.lt.getTime();
    }
    return false;
  });
}

function fakeDb(
  suscripciones: SuscripcionFake[],
  /** Simula la carrera: otra corrida sella la marca justo antes del `updateMany`. */
  otraCorridaGana: (id: string) => boolean = () => false,
  exenciones: ExencionFake[] = [],
) {
  const db = {
    platformSubscription: {
      findMany: async (args: {
        where: {
          estado?: { in: PlatformSubscriptionStatus[] };
          cancelacionSolicitadaAt?: null;
          proximoCobroAt?: { gt?: Date; lte?: Date };
        };
      }) => {
        const w = args.where;
        return suscripciones
          .filter(
            (s) =>
              (w.estado === undefined || w.estado.in.includes(s.estado)) &&
              (w.cancelacionSolicitadaAt === undefined ||
                s.cancelacionSolicitadaAt === null) &&
              enRango(s.proximoCobroAt, w.proximoCobroAt),
          )
          .map((s) => ({
            id: s.id,
            proximoCobroAt: s.proximoCobroAt,
            renovacionAvisadaPara: s.renovacionAvisadaPara,
            montoBruto: new Prisma.Decimal(s.montoBruto),
            planProgramado: s.planProgramado ?? null,
            planProgramadoDesde: s.planProgramadoDesde ?? null,
            tenant: { nombre: s.nombreTienda },
            pagador: { email: s.emailPagador },
          }));
      },
      updateMany: async (args: {
        where: {
          id: string;
          OR: { renovacionAvisadaPara: null | { not?: Date; lt?: Date } }[];
        };
        data: { renovacionAvisadaPara: Date };
      }) => {
        const s = suscripciones.find((x) => x.id === args.where.id);
        if (!s) return { count: 0 };
        // La carrera: otra corrida ya selló esta misma marca antes de que llegáramos.
        if (otraCorridaGana(s.id)) {
          s.renovacionAvisadaPara = args.data.renovacionAvisadaPara;
          return { count: 0 };
        }
        const or = args.where.OR.map(
          (c) => c.renovacionAvisadaPara ?? { igual: null },
        );
        if (!cumpleGuardMarca(s.renovacionAvisadaPara, or)) return { count: 0 };
        s.renovacionAvisadaPara = args.data.renovacionAvisadaPara;
        return { count: 1 };
      },
    },
    platformExemption: {
      findMany: async (args: { where: { exentaHasta?: { gt?: Date; lte?: Date } } }) =>
        exenciones
          .filter((e) => enRango(e.exentaHasta, args.where.exentaHasta))
          .map((e) => ({
            id: e.id,
            exentaHasta: e.exentaHasta,
            tenant: {
              nombre: e.nombreTienda,
              platformSubscription: e.estadoSuscripcion
                ? {
                    estado: e.estadoSuscripcion,
                    pagador: { email: e.emailPagador ?? "pagador@x.cl" },
                  }
                : null,
              memberships: e.emailOrganizador
                ? [{ user: { email: e.emailOrganizador } }]
                : [],
            },
          })),
      updateMany: async (args: {
        where: {
          id: string;
          OR: { avisoExpiracionEnviadoAt: null | { lt?: Date } }[];
        };
        data: { avisoExpiracionEnviadoAt: Date };
      }) => {
        const e = exenciones.find((x) => x.id === args.where.id);
        if (!e) return { count: 0 };
        if (otraCorridaGana(e.id)) {
          e.avisoExpiracionEnviadoAt = args.data.avisoExpiracionEnviadoAt;
          return { count: 0 };
        }
        const or = args.where.OR.map(
          (c) => c.avisoExpiracionEnviadoAt ?? { igual: null },
        );
        if (!cumpleGuardMarca(e.avisoExpiracionEnviadoAt, or)) return { count: 0 };
        e.avisoExpiracionEnviadoAt = args.data.avisoExpiracionEnviadoAt;
        return { count: 1 };
      },
    },
  };

  return { db: db as never, suscripciones, exenciones };
}

describe("facturacion/barrerAvisosDeFacturacion — aviso previo de renovación (7)", () => {
  // facturacion.avisos.001 — el tracer: el cobro inminente produce el correo y sella la marca
  it("avisa el cobro que viene y deja la marca del período avisado", async () => {
    const { db, suscripciones } = fakeDb([suscripcion()]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos).toHaveLength(1);
    expect(r.correos[0]).toMatchObject({
      destinatario: "ana@pagadora.cl",
      datos: {
        tipo: "RENOVACION_PROXIMA",
        nombreTienda: "Tienda de Ana",
        montoBruto: "25000",
      },
    });
    // La marca ES la llave de la idempotencia: la fecha del cobro que se avisó (no un boolean —
    // hay que volver a avisar el mes siguiente, con otro `proximoCobroAt`).
    expect(suscripciones[0]!.renovacionAvisadaPara).toEqual(
      new Date("2026-08-11T04:00:00Z"),
    );
  });

  // facturacion.avisos.002 — idempotente entre corridas, pero re-avisa el período siguiente
  it("no repite el aviso del mismo cobro y sí avisa el del mes que viene", async () => {
    const { db, suscripciones } = fakeDb([suscripcion()]);

    await barrerAvisosDeFacturacion({ db, ahora: AHORA });
    const segunda = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(segunda.correos).toEqual([]);

    // Flow cobró y corrió la fecha: es OTRO cobro, y este sí hay que avisarlo. Por eso la marca
    // guarda una FECHA y no un booleano — con un flag, el aviso saldría una sola vez en la vida.
    suscripciones[0]!.proximoCobroAt = new Date("2026-09-11T04:00:00Z");
    const mesSiguiente = await barrerAvisosDeFacturacion({
      db,
      ahora: new Date("2026-09-10T12:00:00Z"),
    });

    expect(mesSiguiente.correos).toHaveLength(1);
  });

  // facturacion.avisos.003 — dos corridas CONCURRENTES mandan un solo correo (guard atómico)
  it("si otra corrida sella la marca primero, esta no manda el correo", async () => {
    // El cron de Vercel puede solaparse (una corrida lenta y la siguiente ya disparada). Las dos
    // leen `renovacionAvisadaPara: null` y las dos concluyen que hay que avisar; quien decide es el
    // `count` del `updateMany` condicional, no la lectura.
    const { db } = fakeDb([suscripcion()], () => true);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos).toEqual([]);
  });

  // facturacion.avisos.004 — a quién NO se le anuncia un cobro que no va a ocurrir
  it("no anuncia cobros de planes cancelados, en pausa, lejanos ni ya vencidos", async () => {
    const { db } = fakeDb([
      // Pidió la cancelación: `cancel_at_period_end` ⇒ NO hay cobro nuevo. Anunciarle uno sería
      // decirle que su cancelación no funcionó.
      suscripcion({ id: "a", cancelacionSolicitadaAt: new Date("2026-08-01") }),
      // Dunning agotado: la tienda está en pausa y lo que corresponde es pagar la deuda (el banner y
      // el correo (3) ya lo dicen), no anunciar la mensualidad siguiente.
      suscripcion({ id: "b", estado: "EN_PAUSA_POR_PAGO" }),
      suscripcion({ id: "c", estado: "CANCELADA" }),
      // Fuera de la ventana de 2 días: todavía no es un aviso previo, es una molestia.
      suscripcion({ id: "d", proximoCobroAt: new Date("2026-08-20T04:00:00Z") }),
      // La fecha ya pasó: eso no es un aviso PREVIO. El cobro real lo cuentan los correos del
      // webhook (comprobante o cobro fallido).
      suscripcion({ id: "e", proximoCobroAt: new Date("2026-08-09T04:00:00Z") }),
      // Sin fecha de cobro (Flow todavía no la reportó): no hay nada que anunciar.
      suscripcion({ id: "f", proximoCobroAt: null }),
    ]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos).toEqual([]);
  });

  // facturacion.avisos.005 — el monto anunciado es el que se VA a cobrar, no el del mes pasado
  it("anuncia el monto del cambio de plan ya programado cuando rige para ese cobro", async () => {
    const { db } = fakeDb([
      // Promoción D7: el Pagador canceló su tienda full y esta adicional pasa a full en la próxima
      // renovación. Anunciar $12.500 y cobrar $25.000 sería la peor sorpresa posible.
      suscripcion({
        id: "a",
        montoBruto: "12500",
        planProgramado: "FULL",
        planProgramadoDesde: new Date("2026-08-11T04:00:00Z"),
      }),
      // El cambio programado rige DESPUÉS de este cobro: el mes que viene todavía se cobra el actual.
      suscripcion({
        id: "b",
        montoBruto: "12500",
        planProgramado: "FULL",
        planProgramadoDesde: new Date("2026-09-11T04:00:00Z"),
      }),
    ]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos.map((c) => c.datos.montoBruto)).toEqual(["25000", "12500"]);
  });

  // facturacion.avisos.011 — el borde exacto de la ventana de barrido
  it("incluye el cobro que cae justo en el límite de la ventana y no el de un instante después", async () => {
    const limite = new Date(AHORA.getTime() + 2 * 24 * 60 * 60 * 1000);
    const { db } = fakeDb([
      suscripcion({ id: "a", proximoCobroAt: limite }),
      suscripcion({ id: "b", proximoCobroAt: new Date(limite.getTime() + 1) }),
    ]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    // El de `b` no se pierde: entra en la corrida de mañana, todavía con un día de anticipación.
    expect(r.correos).toHaveLength(1);
  });
});

describe("facturacion/barrerAvisosDeFacturacion — expiración de la cortesía (6)", () => {
  // facturacion.avisos.006 — el tracer de la otra mitad: la cortesía que se termina se avisa una vez
  it("avisa al Organizador que su cortesía se termina y sella la marca", async () => {
    const { db, exenciones } = fakeDb([], () => false, [exencion()]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos).toHaveLength(1);
    expect(r.correos[0]).toMatchObject({
      // Sin Pagador (una tienda cortesía no tiene tarjeta ni suscripción Flow, D8), el receptor es
      // el Organizador de la Tienda — la membresía más antigua, el mismo criterio con el que el
      // repo resuelve «el Organizador» para el reply-to de los correos al Comprador.
      destinatario: "ana@organizadora.cl",
      datos: { tipo: "EXENCION_POR_VENCER", nombreTienda: "Tienda de Ana" },
    });
    expect(exenciones[0]!.avisoExpiracionEnviadoAt).not.toBeNull();

    // Segunda corrida del mismo día: la marca ya está puesta y no sale un segundo correo.
    const segunda = await barrerAvisosDeFacturacion({ db, ahora: AHORA });
    expect(segunda.correos).toEqual([]);
  });

  // facturacion.avisos.007 — el correo NO puede decir lo que el banner decidió callar (F07)
  it("no avisa el fin de la cortesía a quien tiene un plan que sostiene la venta", async () => {
    const { db } = fakeDb([], () => false, [
      // Cortesía otorgada SOBRE un plan vivo: cuando venza no cambia nada — Flow le sigue cobrando
      // y la tienda sigue vendiendo. El banner ya calla en este caso; el correo tiene que callar
      // igual, o le estaría diciendo «vas a necesitar un plan» a quien lo tiene y lo paga.
      exencion({ id: "a", estadoSuscripcion: "AL_DIA" }),
      exencion({ id: "b", estadoSuscripcion: "COBRO_PENDIENTE" }),
    ]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos).toEqual([]);
  });

  // facturacion.avisos.008 — con el plan en pausa sí hay algo que avisar, y el receptor es el Pagador
  it("avisa cuando el plan detrás no sostiene la venta, y le escribe al Pagador", async () => {
    const { db } = fakeDb([], () => false, [
      exencion({
        id: "a",
        // Dunning agotado ANTES de la cortesía: al vencer, la tienda vuelve a la pausa. Eso sí es
        // un evento que hay que anunciar.
        estadoSuscripcion: "EN_PAUSA_POR_PAGO",
        emailPagador: "pagador@x.cl",
        emailOrganizador: "otro@x.cl",
      }),
      exencion({ id: "b", estadoSuscripcion: "CANCELADA", emailPagador: "cancelado@x.cl" }),
    ]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    // Con suscripción, el receptor es su Pagador (el cliente de la Plataforma, D10) y no quien
    // administre la tienda: puede haber más de una membresía y la tarjeta la puso uno solo.
    expect(r.correos.map((c) => c.destinatario)).toEqual([
      "pagador@x.cl",
      "cancelado@x.cl",
    ]);
  });

  // facturacion.avisos.009 — a quién NO se le anuncia un vencimiento
  it("no avisa la cortesía perpetua, la lejana ni la ya vencida", async () => {
    const { db } = fakeDb([], () => false, [
      // Perpetua (el GRANDFATHER del despliegue, D3): no vence nunca, avisarle sería inventarle
      // un problema.
      exencion({ id: "a", exentaHasta: null }),
      // Todavía fuera de la ventana de 7 días.
      exencion({ id: "b", exentaHasta: new Date("2026-09-15T00:00:00Z") }),
      // Ya venció: eso no es un preaviso sino un hecho consumado, y tiene su propio aviso en el
      // gate (`EXENCION_EXPIRADA`, con la tienda ya en pausa).
      exencion({ id: "c", exentaHasta: new Date("2026-08-01T00:00:00Z") }),
    ]);

    const r = await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    expect(r.correos).toEqual([]);
  });

  // facturacion.avisos.010 — estirar la cortesía a mano vuelve a habilitar el aviso
  it("una cortesía estirada por DB directa vuelve a avisarse en su ventana nueva", async () => {
    const { db, exenciones } = fakeDb([], () => false, [exencion()]);

    await barrerAvisosDeFacturacion({ db, ahora: AHORA });

    // El Operador la estira dos meses (D8: las exenciones se administran por DB directa). La marca
    // vieja queda FUERA de la ventana nueva, así que el aviso vuelve a salir cuando corresponda —
    // sin que nadie tenga que acordarse de limpiar la columna a mano.
    exenciones[0]!.exentaHasta = new Date("2026-10-15T00:00:00Z");
    const despues = await barrerAvisosDeFacturacion({
      db,
      ahora: new Date("2026-10-10T12:00:00Z"),
    });

    expect(despues.correos).toHaveLength(1);
  });
});
