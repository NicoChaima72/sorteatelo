import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { activarPlanTrasRegistro } from "~/server/domain/facturacion/activarPlanTrasRegistro";
import { iniciarRegistroTarjeta } from "~/server/domain/facturacion/iniciarRegistroTarjeta";
import type { FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Tests del flujo «Activa tu plan» (F03, D2/D12, I3/I4). Dos use cases:
 *
 * 1. `iniciarRegistroTarjeta` — resuelve/crea el customer de Flow del Pagador, reserva el cupón
 *    opcional y devuelve la URL de `customer/register` a la que redirigir.
 * 2. `activarPlanTrasRegistro` — al volver del redirect, confirma el registro SERVER-SIDE contra
 *    `getRegisterStatus` (I3: el redirect del navegador no prueba nada), calcula el plan server-side
 *    (I4) y crea la suscripción.
 *
 * `db` FAKE stateful: las tablas `Platform*` que el flujo toca, para poder afirmar QUÉ se persistió.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

type Fila = Record<string, unknown>;

interface Escenario {
  /** Suscripciones YA existentes, indexadas por tenantId. */
  suscripciones?: Fila[];
  /** El Pagador ya tiene customer de Flow. */
  conCustomer?: boolean;
  exentaHasta?: Date | null;
  cupones?: Fila[];
  redenciones?: Fila[];
  estadoTienda?: string;
  /**
   * Hace fallar la `$transaction` ANTES de ejecutar su callback — así el fake modela un rollback de
   * verdad (nada persistido), que es lo que hace Postgres. Si el error se lanzara a mitad del
   * callback, el fake (que no sabe revertir) dejaría escrituras a medias y el test afirmaría sobre un
   * estado que en producción no existe.
   */
  txFalla?: Error;
}

function fakeDb(s: Escenario = {}) {
  const estado = {
    suscripciones: [...(s.suscripciones ?? [])] as Fila[],
    customers: s.conCustomer
      ? ([{ id: "bc1", userId: "u1", flowCustomerId: "flow-cus-1", email: "org@x.cl" }] as Fila[])
      : ([] as Fila[]),
    cupones: [...(s.cupones ?? [])] as Fila[],
    redenciones: [...(s.redenciones ?? [])] as Fila[],
    tenantEstado: s.estadoTienda ?? "CONFIGURACION",
  };

  const coincide = (fila: Fila, where: Fila): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v !== null && typeof v === "object") return true; // filtros compuestos: los ignora el fake
      return fila[k] === v;
    });

  const tabla = (filas: () => Fila[]) => ({
    findUnique: async ({ where }: { where: Fila }) =>
      filas().find((f) => coincide(f, where)) ?? null,
    findFirst: async ({ where }: { where?: Fila } = {}) =>
      filas().find((f) => coincide(f, where ?? {})) ?? null,
    findMany: async ({ where }: { where?: Fila } = {}) =>
      filas().filter((f) => coincide(f, where ?? {})),
  });

  const tx = {
    tenant: {
      findUniqueOrThrow: async () => ({
        id: "A",
        nombre: "Mi Tienda",
        slug: "mi-tienda",
        estado: estado.tenantEstado,
        tosVersion: "2026-07-17",
      }),
      update: async ({ data }: { data: { estado: string } }) => {
        estado.tenantEstado = data.estado;
        return { id: "A" };
      },
    },
    platformExemption: {
      findUnique: async () =>
        "exentaHasta" in s ? { exentaHasta: s.exentaHasta ?? null } : null,
    },
    platformSubscription: {
      ...tabla(() => estado.suscripciones),
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: `sub-${estado.suscripciones.length + 1}`, ...data };
        estado.suscripciones.push(fila);
        return fila;
      },
      update: async ({ where, data }: { where: Fila; data: Fila }) => {
        const fila = estado.suscripciones.find((f) => coincide(f, where));
        if (fila) Object.assign(fila, data);
        return fila ?? {};
      },
      count: async ({ where }: { where?: Fila } = {}) =>
        estado.suscripciones.filter((f) => coincide(f, where ?? {})).length,
    },
    platformBillingCustomer: {
      ...tabla(() => estado.customers),
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: `bc-${estado.customers.length + 1}`, ...data };
        estado.customers.push(fila);
        return fila;
      },
      update: async ({ where, data }: { where: Fila; data: Fila }) => {
        const fila = estado.customers.find((f) => coincide(f, where));
        if (fila) Object.assign(fila, data);
        return fila ?? {};
      },
    },
    platformCoupon: {
      ...tabla(() => estado.cupones),
      // Modela el guard ATÓMICO del cupo tal como lo hace Postgres: el `where` condicional es lo
      // que impide pasarse del tope, y el `data` puede ser un `increment` (reservar) o un
      // `decrement` (liberar). Distinguir los dos es lo que hace que el fake pueda cazar un doble
      // decremento — con un `+1` fijo, la liberación era invisible al test.
      updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
        const fila = estado.cupones.find((f) => f.id === where.id);
        if (!fila) return { count: 0 };
        // `activo: true` viaja en el where solo al RESERVAR: devolverle un cupo a un cupón que se
        // desactivó en el medio tiene que seguir funcionando.
        if (where.activo === true && fila.activo !== true) return { count: 0 };

        const delta = data.canjes as
          | { increment?: number; decrement?: number }
          | undefined;
        const max = fila.maxCanjes as number | null;
        const usados = fila.canjes as number;

        if (delta?.increment !== undefined) {
          if (max !== null && usados >= max) return { count: 0 };
          fila.canjes = usados + delta.increment;
          return { count: 1 };
        }
        if (delta?.decrement !== undefined) {
          fila.canjes = usados - delta.decrement;
          return { count: 1 };
        }
        return { count: 1 };
      },
    },
    platformCouponRedemption: {
      ...tabla(() => estado.redenciones),
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: `red-${estado.redenciones.length + 1}`, ...data };
        estado.redenciones.push(fila);
        return fila;
      },
      update: async ({ where, data }: { where: Fila; data: Fila }) => {
        const fila = estado.redenciones.find((f) => coincide(f, where));
        if (fila) Object.assign(fila, data);
        return fila ?? {};
      },
      deleteMany: async ({ where }: { where: Fila }) => {
        const quedan = estado.redenciones.filter((f) => !coincide(f, where));
        const count = estado.redenciones.length - quedan.length;
        estado.redenciones = quedan;
        return { count };
      },
    },
    flowCredential: { findUnique: async () => ({ tenantId: "A" }) },
    product: { findFirst: async () => ({ id: "p1" }) },
    raffle: { findFirst: async () => null },
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

/**
 * Fake de Flow: registra las llamadas para poder afirmar QUÉ se le mandó.
 *
 * Devuelve el MISMO objeto dos veces: `flow` casteado al service (lo que reciben los use cases) y
 * `mocks` con sus tipos inferidos (contra el que se asertan las llamadas). No es ceremonia: los
 * miembros de `FlowPlataformaService` están declarados como MÉTODOS, y leer un método desestimado de
 * su objeto es justo lo que prohíbe `@typescript-eslint/unbound-method`. Mismo espíritu que el
 * `fakeStorage` de `panel/basesPdf.test.ts`, cuyos mocks también son propiedades, no métodos.
 */
function fakeFlow(overrides: Record<string, unknown> = {}) {
  const mocks = {
    crearCustomer: vi.fn(async () => ({ customerId: "flow-cus-nuevo" })),
    getCustomer: vi.fn(async () => ({ customerId: "flow-cus-1" })),
    registrarTarjeta: vi.fn(async () => ({
      url: "https://sandbox.flow.cl/app/subscription/register",
      token: "reg-token-1",
    })),
    getEstadoRegistro: vi.fn(async () => ({
      status: 1,
      customerId: "flow-cus-1",
      creditCardType: "Visa",
      last4CardDigits: "4242",
    })),
    crearSuscripcion: vi.fn(async () => ({
      subscriptionId: "flow-sub-1",
      status: 1,
      period_start: "2026-07-26",
      period_end: "2026-08-26",
      next_invoice_date: "2026-08-26",
    })),
    cancelarSuscripcion: vi.fn(async () => ({
      subscriptionId: "flow-sub-1",
      status: 4,
    })),
    ...overrides,
  };
  return { mocks, flow: mocks as unknown as FlowPlataformaService };
}

describe("domain/facturacion/iniciarRegistroTarjeta", () => {
  // facturacion.activar.001 — crea el customer de Flow del Pagador y devuelve la URL del redirect
  it("crea el customer de Flow si el Pagador no tenía y devuelve la URL de registro", async () => {
    const { db, estado } = fakeDb();
    const { flow, mocks } = fakeFlow();

    const r = await iniciarRegistroTarjeta({
      db,
      acceso: acceso(["A"]),
      flow,
      input: {},
      urlRetorno: "https://mi-tienda.sorteatelo.cl/admin/plan/retorno",
    });

    expect(r.redirectUrl).toContain("sandbox.flow.cl");
    expect(mocks.crearCustomer).toHaveBeenCalledTimes(1);
    expect(estado.customers).toHaveLength(1);
    // El `externalId` del customer es el userId del Pagador: es lo que liga Flow con nuestra DB.
    expect(mocks.crearCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "u1", email: "org@x.cl" }),
    );
  });

  // facturacion.activar.002 — el Pagador que ya tiene customer NO crea otro (idempotente)
  it("reusa el customer de Flow existente del Pagador", async () => {
    const { db, estado } = fakeDb({ conCustomer: true });
    const { flow, mocks } = fakeFlow();

    await iniciarRegistroTarjeta({
      db,
      acceso: acceso(["A"]),
      flow,
      input: {},
      urlRetorno: "https://x/retorno",
    });

    expect(mocks.crearCustomer).not.toHaveBeenCalled();
    expect(estado.customers).toHaveLength(1);
  });

  // facturacion.activar.003 — una tienda EXENTA no pasa por la tarjeta (D8)
  it("rechaza el registro de tarjeta de una tienda exenta", async () => {
    const { db } = fakeDb({ conCustomer: true, exentaHasta: null });
    await expect(
      iniciarRegistroTarjeta({
        db,
        acceso: acceso(["A"]),
        flow: fakeFlow().flow,
        input: {},
        urlRetorno: "https://x/retorno",
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  // facturacion.activar.004 — con plan activo no se vuelve a pedir tarjeta (evita doble cobro)
  it("rechaza si la Tienda ya tiene un plan activo", async () => {
    const { db } = fakeDb({
      conCustomer: true,
      suscripciones: [{ id: "s1", tenantId: "A", estado: "AL_DIA", pagadorId: "bc1" }],
    });
    await expect(
      iniciarRegistroTarjeta({
        db,
        acceso: acceso(["A"]),
        flow: fakeFlow().flow,
        input: {},
        urlRetorno: "https://x/retorno",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  // facturacion.activar.005 — cupón inválido: mensaje NEUTRAL y sin reservar nada
  it("rechaza un código inválido con mensaje neutral y sin consumir canjes", async () => {
    const { db, estado } = fakeDb({ conCustomer: true, cupones: [] });
    await expect(
      iniciarRegistroTarjeta({
        db,
        acceso: acceso(["A"]),
        flow: fakeFlow().flow,
        input: { codigo: "NOEXISTE" },
        urlRetorno: "https://x/retorno",
      }),
    ).rejects.toThrow(/no es válido/i);
    expect(estado.redenciones).toHaveLength(0);
  });

  // facturacion.activar.006 — cupón válido: se RESERVA antes del redirect (sobrevive al viaje a Flow)
  it("reserva el canje del cupón válido antes de redirigir, normalizando el código", async () => {
    const { db, estado } = fakeDb({
      conCustomer: true,
      cupones: [
        {
          id: "c1",
          codigo: "ARMY2026",
          flowCouponId: "flow-cup-1",
          activo: true,
          expiraAt: null,
          maxCanjes: 1,
          canjes: 0,
        },
      ],
    });

    await iniciarRegistroTarjeta({
      db,
      acceso: acceso(["A"]),
      flow: fakeFlow().flow,
      input: { codigo: "  army 2026 " }, // tipeado a mano, con espacios y minúsculas
      urlRetorno: "https://x/retorno",
    });

    expect(estado.redenciones).toHaveLength(1);
    expect(estado.redenciones[0]).toMatchObject({
      couponId: "c1",
      tenantId: "A",
      codigo: "ARMY2026",
      subscriptionId: null, // reservado: se liga a la suscripción cuando exista
    });
    // El contador se consumió: el código personal queda agotado para otras tiendas.
    expect(estado.cupones[0]!.canjes).toBe(1);
  });

  // facturacion.activar.007 — un intento ABANDONADO devuelve el cupo: el cupón no se quema solo
  it("libera la reserva de un intento abandonado y le devuelve el cupo al cupón", async () => {
    const { db, estado } = fakeDb({
      conCustomer: true,
      cupones: [
        {
          id: "c1",
          codigo: "ARMY2026",
          flowCouponId: "flow-cup-1",
          activo: true,
          expiraAt: null,
          maxCanjes: 1,
          canjes: 1, // consumido por el intento anterior
        },
      ],
      // El Organizador se fue del formulario de Flow sin ingresar la tarjeta: la reserva quedó suelta.
      redenciones: [
        {
          id: "red-1",
          couponId: "c1",
          tenantId: "A",
          pagadorId: "bc1",
          codigo: "ARMY2026",
          subscriptionId: null,
        },
      ],
    });

    // Vuelve a entrar, esta vez SIN código.
    await iniciarRegistroTarjeta({
      db,
      acceso: acceso(["A"]),
      flow: fakeFlow().flow,
      input: {},
      urlRetorno: "https://x/retorno",
    });

    expect(estado.redenciones).toHaveLength(0);
    expect(estado.cupones[0]!.canjes).toBe(0);
  });

  // facturacion.activar.008 — la liberación NO devuelve el cupo dos veces (regresión: el orden
  // borrar-primero es lo que impide que un cupón regale más canjes que su maxCanjes)
  it("no devuelve el mismo cupo dos veces si se reintenta la liberación", async () => {
    const { db, estado } = fakeDb({
      conCustomer: true,
      cupones: [
        {
          id: "c1",
          codigo: "ARMY2026",
          flowCouponId: "flow-cup-1",
          activo: true,
          expiraAt: null,
          maxCanjes: 3,
          canjes: 2, // dos canjes reales, uno de ellos el abandonado de esta tienda
        },
      ],
      redenciones: [
        {
          id: "red-1",
          couponId: "c1",
          tenantId: "A",
          pagadorId: "bc1",
          codigo: "ARMY2026",
          subscriptionId: null,
        },
      ],
    });

    const entrarSinCodigo = () =>
      iniciarRegistroTarjeta({
        db,
        acceso: acceso(["A"]),
        flow: fakeFlow().flow,
        input: {},
        urlRetorno: "https://x/retorno",
      });

    await entrarSinCodigo();
    await entrarSinCodigo(); // reintento / doble clic: ya no hay nada que liberar

    // Un solo decremento por la única reserva que existía. Con el orden invertido
    // (decrementar y después borrar), acá habría quedado en 0 y el cupón regalaría un canje extra.
    expect(estado.cupones[0]!.canjes).toBe(1);
    expect(estado.redenciones).toHaveLength(0);
  });
});

describe("domain/facturacion/activarPlanTrasRegistro", () => {
  const base = { input: { token: "reg-token-1" }, acceso: acceso(["A"]) };

  // facturacion.activar.010 — I3: se confirma contra getRegisterStatus, no contra el redirect
  it("confirma el registro SERVER-SIDE y solo entonces crea la suscripción", async () => {
    const { db, estado } = fakeDb({ conCustomer: true });
    const { flow, mocks } = fakeFlow();

    const r = await activarPlanTrasRegistro({ db, flow, ...base });

    expect(mocks.getEstadoRegistro).toHaveBeenCalledWith("reg-token-1");
    expect(mocks.crearSuscripcion).toHaveBeenCalledTimes(1);
    expect(r.activado).toBe(true);
    expect(estado.suscripciones).toHaveLength(1);
    // La tarjeta (marca + últimos 4) queda persistida; NUNCA el PAN.
    expect(estado.customers[0]).toMatchObject({
      tarjetaMarca: "Visa",
      tarjetaUltimos4: "4242",
    });
  });

  // facturacion.activar.017 — la Tienda quedó EXENTA durante el viaje a Flow (F07/D3): no se cobra
  it("no crea suscripción si la Tienda quedó exenta entre el redirect y la vuelta", async () => {
    // El escenario real: el Organizador arranca el registro de tarjeta el día del despliegue de la
    // facturación y, mientras está en el formulario de Flow, corre el grandfathering (F07/D3) y su
    // tienda —ya publicada— queda exenta a perpetuidad. Sin este guard volvería con la tarjeta
    // registrada y se le crearía el cobro mensual: exenta Y suscrita, vendiendo gratis por el gate
    // mientras Flow le cobra $25.000 todos los meses.
    const { db, estado } = fakeDb({ conCustomer: true, exentaHasta: null });
    const { flow, mocks } = fakeFlow();

    await expect(
      activarPlanTrasRegistro({ db, flow, ...base }),
    ).rejects.toMatchObject({ code: "INVALID" });

    // Lo que importa: NO se llegó a crear el cobro en Flow. Un rechazo posterior a `crearSuscripcion`
    // dejaría una suscripción viva que habría que compensar (D16-A).
    expect(mocks.crearSuscripcion).not.toHaveBeenCalled();
    expect(estado.suscripciones).toHaveLength(0);
  });

  // facturacion.activar.011 — registro NO OK ⇒ no se crea nada (I3)
  it("no crea suscripción si Flow dice que el registro no quedó OK", async () => {
    const { db, estado } = fakeDb({ conCustomer: true });
    const { flow, mocks } = fakeFlow({
      getEstadoRegistro: vi.fn(async () => ({ status: 0 })),
    });

    await expect(
      activarPlanTrasRegistro({ db, flow, ...base }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(mocks.crearSuscripcion).not.toHaveBeenCalled();
    expect(estado.suscripciones).toHaveLength(0);
  });

  // facturacion.activar.012 — I4: el plan lo calcula el SERVER contando las activas del Pagador
  it("cobra FULL la primera tienda del Pagador y ADICIONAL la siguiente, ignorando el cliente", async () => {
    // Primera tienda del Pagador: no tiene ninguna activa ⇒ FULL ($25.000).
    const primera = fakeDb({ conCustomer: true });
    await activarPlanTrasRegistro({ db: primera.db, flow: fakeFlow().flow, ...base });
    expect(primera.estado.suscripciones[0]).toMatchObject({
      plan: "FULL",
      flowPlanId: "sorteatelo-tienda-full",
    });
    expect(String(primera.estado.suscripciones[0]!.montoBruto)).toBe("25000");

    // Segunda tienda del MISMO Pagador (ya tiene una activa) ⇒ ADICIONAL ($12.500).
    const segunda = fakeDb({
      conCustomer: true,
      suscripciones: [
        { id: "s0", tenantId: "OTRA", estado: "AL_DIA", pagadorId: "bc1", plan: "FULL" },
      ],
    });
    await activarPlanTrasRegistro({ db: segunda.db, flow: fakeFlow().flow, ...base });
    const nueva = segunda.estado.suscripciones.find((f) => f.tenantId === "A");
    expect(nueva).toMatchObject({
      plan: "ADICIONAL",
      flowPlanId: "sorteatelo-tienda-adicional",
    });
    expect(String(nueva!.montoBruto)).toBe("12500");
  });

  // facturacion.activar.013 — el cupón reservado viaja a Flow y queda ligado a la suscripción
  it("manda el couponId reservado a Flow y liga el canje a la suscripción creada", async () => {
    const { db, estado } = fakeDb({
      conCustomer: true,
      cupones: [
        {
          id: "c1",
          codigo: "ARMY2026",
          flowCouponId: "flow-cup-1",
          activo: true,
          expiraAt: null,
          maxCanjes: 1,
          canjes: 1,
        },
      ],
      redenciones: [
        {
          id: "red-1",
          couponId: "c1",
          tenantId: "A",
          pagadorId: "bc1",
          codigo: "ARMY2026",
          subscriptionId: null,
        },
      ],
    });
    const { flow, mocks } = fakeFlow();

    await activarPlanTrasRegistro({ db, flow, ...base });

    expect(mocks.crearSuscripcion).toHaveBeenCalledWith(
      expect.objectContaining({ couponId: "flow-cup-1" }),
    );
    // El canje deja de estar "reservado": ahora apunta a la suscripción real (trazabilidad D9).
    expect(estado.redenciones[0]!.subscriptionId).toBe("sub-1");
  });

  // facturacion.activar.014 — recargar la página de retorno no duplica la suscripción
  it("es idempotente: con el plan ya activo no vuelve a crear nada en Flow", async () => {
    const { db, estado } = fakeDb({
      conCustomer: true,
      suscripciones: [
        { id: "s1", tenantId: "A", estado: "AL_DIA", pagadorId: "bc1", plan: "FULL" },
      ],
    });
    const { flow, mocks } = fakeFlow();

    const r = await activarPlanTrasRegistro({ db, flow, ...base });

    expect(mocks.crearSuscripcion).not.toHaveBeenCalled();
    expect(estado.suscripciones).toHaveLength(1);
    expect(r.activado).toBe(true);
    expect(r.yaEstaba).toBe(true);
  });

  // facturacion.activar.015 — D16-A (compensación): si la escritura local falla DESPUÉS de crear el
  // cobro en Flow, la suscripción recién creada se CANCELA en Flow. Sin esto, el guard de idempotencia
  // (que solo mira nuestra DB) deja pasar el reintento y el Pagador queda con DOS cobros mensuales.
  it("compensa en Flow cancelando la suscripción si la escritura local falla", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, estado } = fakeDb({
      conCustomer: true,
      txFalla: new Error("connection pool timeout"),
    });
    const { flow, mocks } = fakeFlow();

    // El error que ve el Organizador es el ORIGINAL, no el de la compensación.
    await expect(
      activarPlanTrasRegistro({ db, flow, ...base }),
    ).rejects.toThrow(/connection pool timeout/);

    expect(mocks.crearSuscripcion).toHaveBeenCalledTimes(1);
    // INMEDIATA, no al fin del período: esta suscripción no debería existir, no hay período que
    // respetar. Cancelar de más es recuperable (el Organizador reintenta); cobrar de más, no.
    expect(mocks.cancelarSuscripcion).toHaveBeenCalledWith({
      subscriptionId: "flow-sub-1",
      alFinDelPeriodo: false,
    });
    expect(estado.suscripciones).toHaveLength(0);
    spy.mockRestore();
  });

  // facturacion.activar.016 — la compensación que TAMBIÉN falla no enmascara la causa raíz: queda una
  // suscripción huérfana en Flow (la caza el webhook de F04, D16-C) y en el log su `flowSubscriptionId`
  // para poder cancelarla a mano.
  it("propaga el error original aunque la cancelación compensatoria falle, y lo loguea", async () => {
    const errores: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errores.push(args.map((a) => JSON.stringify(a) ?? String(a)).join(" "));
      });
    const { db, estado } = fakeDb({
      conCustomer: true,
      txFalla: new Error("connection pool timeout"),
    });
    const { flow } = fakeFlow({
      cancelarSuscripcion: vi.fn(() => {
        throw new Error("Flow respondió 503");
      }),
    });

    await expect(
      activarPlanTrasRegistro({ db, flow, ...base }),
    ).rejects.toThrow(/connection pool timeout/);

    expect(estado.suscripciones).toHaveLength(0);
    const log = errores.join(" ");
    expect(log).toMatch(/HU[ÉE]RFANA/i);
    // El id de Flow tiene que estar en el log: es lo único con lo que se cancela a mano.
    expect(log).toContain("flow-sub-1");
    spy.mockRestore();
  });
});
