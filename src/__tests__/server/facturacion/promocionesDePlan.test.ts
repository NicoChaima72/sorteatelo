import { Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ejecutarPromocionesDePlan } from "~/server/facturacion/promocionesDePlan";
import {
  ErrorFlowPlataforma,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * Ejecución diferida de la promoción de plan (F06, D7/I8) — el fix del **blocker 6** de la 4ª pasada
 * del E2E.
 *
 * Al cancelar, la promoción de la adicional más antigua se ANOTA (`planProgramado` +
 * `planProgramadoDesde`); pedirle el cambio a Flow en ese momento le cobraba a la tienda vecina la
 * diferencia de un período que ya estaba pagado. Acá se prueba quién ejecuta esa promoción y, sobre
 * todo, **cuándo**: recién cuando el período que Flow está cobrando ya empezó dentro de la vigencia.
 */

const VIGENCIA = new Date("2026-08-26T00:00:00Z");

type Fila = Record<string, unknown>;

/** La adicional de B, con su promoción a full anotada y su período nuevo ya empezado. */
const SUB_PROMOVIBLE: Fila = {
  id: "sub-B",
  tenantId: "B",
  estado: "AL_DIA",
  plan: "ADICIONAL",
  flowSubscriptionId: "flow-sub-B",
  flowPlanId: "sorteatelo-tienda-adicional",
  montoBruto: new Prisma.Decimal("12500"),
  planProgramado: "FULL",
  planProgramadoDesde: VIGENCIA,
  periodoInicio: VIGENCIA,
  cancelacionSolicitadaAt: null,
};

function fakeDb(filas: Fila[]) {
  const estado = { suscripciones: filas.map((f) => ({ ...f })) };

  const coincide = (fila: Fila, where: Fila): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const filtro = v as { in?: unknown[]; not?: unknown };
        if (Array.isArray(filtro.in)) return filtro.in.includes(fila[k]);
        if ("not" in filtro) return fila[k] !== filtro.not;
        return true;
      }
      return fila[k] === v;
    });

  const platformSubscription = {
    findMany: async ({ where }: { where?: Fila } = {}) =>
      estado.suscripciones.filter((f) => coincide(f, where ?? {})),
    /**
     * Guard ATÓMICO, como en el resto de la feature: el `WHERE` condicional decide y el `count` es lo
     * que dice si esta corrida ganó. Si el fake ignorara el filtro, dos corridas solapadas del cron
     * serían invisibles al test.
     */
    updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
      const filas = estado.suscripciones.filter((f) => coincide(f, where));
      for (const fila of filas) Object.assign(fila, data);
      return { count: filas.length };
    },
  };

  return { db: { platformSubscription } as unknown as PrismaClient, estado };
}

function fakeFlow(overrides: Record<string, unknown> = {}) {
  const mocks = {
    cambiarPlan: vi.fn(async () => ({
      subscriptionId: "flow-sub-B",
      status: 1,
      planId: "sorteatelo-tienda-full",
    })),
    ...overrides,
  };
  return { mocks, flow: mocks as unknown as FlowPlataformaService };
}

describe("facturacion/promocionesDePlan", () => {
  // facturacion.promocion.001 — el período nuevo ya empezó: ahí sí se ejecuta
  it("cambia el plan en Flow y sella el plan local cuando el período en curso ya es el nuevo", async () => {
    const { db, estado } = fakeDb([SUB_PROMOVIBLE]);
    const { flow, mocks } = fakeFlow();

    const r = await ejecutarPromocionesDePlan({ db, flow });

    expect(mocks.cambiarPlan).toHaveBeenCalledWith({
      subscriptionId: "flow-sub-B",
      nuevoPlanId: "sorteatelo-tienda-full",
    });
    expect(r.ejecutadas).toBe(1);

    const b = estado.suscripciones[0]!;
    expect(b.plan).toBe("FULL");
    expect(b.flowPlanId).toBe("sorteatelo-tienda-full");
    expect(String(b.montoBruto)).toBe("25000");
    expect(b.montoBruto).toBeInstanceOf(Prisma.Decimal);
    // La marca se apaga: si quedara, el cron volvería a pedirle el cambio a Flow todos los días.
    expect(b.planProgramado).toBeNull();
    expect(b.planProgramadoDesde).toBeNull();
  });

  // facturacion.promocion.002 — EL BLOCKER 6: el período en curso ya está pagado al precio viejo
  it("NO cambia el plan mientras el período que se está cobrando sea el anterior a la vigencia", async () => {
    const { db, estado } = fakeDb([
      {
        ...SUB_PROMOVIBLE,
        // El período que corre empezó ANTES de la vigencia: es el mes que el Organizador ya pagó a
        // precio de adicional. Pedirle el cambio a Flow ahora le emite la diferencia sobre ESE mes.
        periodoInicio: new Date("2026-07-26T00:00:00Z"),
      },
    ]);
    const { flow, mocks } = fakeFlow();

    const r = await ejecutarPromocionesDePlan({ db, flow });

    expect(mocks.cambiarPlan).not.toHaveBeenCalled();
    expect(r.ejecutadas).toBe(0);
    // La promoción sigue anotada: le toca cuando Flow cobre el período siguiente.
    expect(estado.suscripciones[0]!.planProgramado).toBe("FULL");
    expect(estado.suscripciones[0]!.plan).toBe("ADICIONAL");
  });

  // facturacion.promocion.003 — sin saber qué período corre, no se toca nada (falla segura)
  it("no ejecuta una promoción sin fecha de vigencia ni sin período espejado", async () => {
    for (const incompleta of [
      { planProgramadoDesde: null },
      { periodoInicio: null },
    ]) {
      const { db, estado } = fakeDb([{ ...SUB_PROMOVIBLE, ...incompleta }]);
      const { flow, mocks } = fakeFlow();

      const r = await ejecutarPromocionesDePlan({ db, flow });

      expect(mocks.cambiarPlan).not.toHaveBeenCalled();
      expect(r.ejecutadas).toBe(0);
      expect(estado.suscripciones[0]!.plan).toBe("ADICIONAL");
    }
  });

  // facturacion.promocion.004 — `changePlan` NO es idempotente: el 1001 es el resultado buscado
  it("sella la promoción igual cuando Flow responde 1001 «ya está en ese plan»", async () => {
    const { db, estado } = fakeDb([SUB_PROMOVIBLE]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { flow } = fakeFlow({
      cambiarPlan: vi.fn(async () => {
        throw new ErrorFlowPlataforma({
          ruta: "/api/subscription/changePlan",
          httpStatus: 400,
          codigoFlow: 1001,
          mensajeFlow: "The selected plan is the same as the current one",
        });
      }),
    });

    const r = await ejecutarPromocionesDePlan({ db, flow });

    expect(r.ejecutadas).toBe(1);
    expect(estado.suscripciones[0]!.plan).toBe("FULL");
    expect(estado.suscripciones[0]!.planProgramado).toBeNull();
    expect(info).toHaveBeenCalled();
  });

  // facturacion.promocion.005 — un fallo de Flow no sella ni se lleva puesta la corrida
  it("deja la promoción anotada si Flow falla, y sigue con las demás suscripciones", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db, estado } = fakeDb([
      SUB_PROMOVIBLE,
      {
        ...SUB_PROMOVIBLE,
        id: "sub-C",
        tenantId: "C",
        flowSubscriptionId: "flow-sub-C",
      },
    ]);
    const { flow } = fakeFlow({
      cambiarPlan: vi.fn(async ({ subscriptionId }: { subscriptionId: string }) => {
        if (subscriptionId === "flow-sub-B") throw new Error("flow 503");
        return { subscriptionId, status: 1 };
      }),
    });

    const r = await ejecutarPromocionesDePlan({ db, flow });

    expect(r.ejecutadas).toBe(1);
    const b = estado.suscripciones.find((f) => f.id === "sub-B")!;
    expect(b.plan).toBe("ADICIONAL");
    expect(b.planProgramado).toBe("FULL"); // se reintenta mañana
    expect(estado.suscripciones.find((f) => f.id === "sub-C")!.plan).toBe("FULL");
    expect(error).toHaveBeenCalled();
  });

  // facturacion.promocion.006 — una tienda que se va no se promueve
  it("ignora las suscripciones canceladas, en pausa o con la cancelación ya pedida", async () => {
    const { db, estado } = fakeDb([
      { ...SUB_PROMOVIBLE, id: "s1", estado: "CANCELADA" },
      { ...SUB_PROMOVIBLE, id: "s2", estado: "EN_PAUSA_POR_PAGO" },
      {
        ...SUB_PROMOVIBLE,
        id: "s3",
        cancelacionSolicitadaAt: new Date("2026-08-27T00:00:00Z"),
      },
    ]);
    const { flow, mocks } = fakeFlow();

    const r = await ejecutarPromocionesDePlan({ db, flow });

    expect(mocks.cambiarPlan).not.toHaveBeenCalled();
    expect(r.ejecutadas).toBe(0);
    expect(estado.suscripciones.every((f) => f.plan === "ADICIONAL")).toBe(true);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
