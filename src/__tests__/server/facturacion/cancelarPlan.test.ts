import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { cancelarPlan } from "~/server/domain/facturacion/cancelarPlan";
import type { FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Tests de la cancelación del plan (F06, D6/D7, I8). Un solo use case, `cancelarPlan`, con tres
 * responsabilidades que se testean por separado: pedirle a Flow el `cancel_at_period_end`, recalcular
 * el pricing del Pagador (promover la adicional más antigua) y decidir el correo (5) de D10.
 *
 * `db` FAKE stateful, mismo patrón que `activarPlan.test.ts`: para poder afirmar QUÉ se persistió.
 */

const AHORA = new Date("2026-07-26T12:00:00Z");
const FIN_PERIODO = new Date("2026-08-26T00:00:00Z");

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

type Fila = Record<string, unknown>;

/** La suscripción FULL de la tienda A, al día. El caso base de casi todos los tests. */
const SUB_FULL: Fila = {
  id: "sub-A",
  tenantId: "A",
  pagadorId: "bc1",
  plan: "FULL",
  estado: "AL_DIA",
  flowSubscriptionId: "flow-sub-A",
  periodoFin: FIN_PERIODO,
  cancelacionSolicitadaAt: null,
  cancelacionEfectivaAt: null,
  planProgramado: null,
  planProgramadoDesde: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

interface Escenario {
  suscripciones?: Fila[];
  /**
   * Simula que OTRA corrida concurrente selló la cancelación justo antes de que esta llegue a
   * escribir. Se aplica una sola vez, entre la llamada a Flow y el `updateMany` — que es exactamente
   * la ventana donde dos requests del mismo botón se cruzan.
   */
  otraCorridaGana?: boolean;
}

function fakeDb(s: Escenario = {}) {
  const estado = {
    suscripciones: [...(s.suscripciones ?? [])] as Fila[],
  };

  const coincide = (fila: Fila, where: Fila): boolean =>
    Object.entries(where).every(([k, v]) => {
      // `{ not: x }` es el único filtro compuesto que este use case usa (excluir la propia tienda).
      if (v !== null && typeof v === "object") {
        const not = (v as { not?: unknown }).not;
        return not === undefined ? true : fila[k] !== not;
      }
      return fila[k] === v;
    });

  /** Adjunta las relaciones que el use case pide en su `select`. */
  const conRelaciones = (fila: Fila): Fila => ({
    ...fila,
    // El correo del PAGADOR es distinto del de la sesión a propósito: así el test puede distinguir
    // si el use case le escribe al cliente de la Plataforma o a quien apretó el botón.
    pagador: { id: fila.pagadorId, email: "pagador@x.cl" },
    tenant: { nombre: "Mi Tienda" },
  });

  const platformSubscription = {
    findUnique: async ({ where }: { where: Fila }) => {
      const fila = estado.suscripciones.find((f) => coincide(f, where));
      return fila ? conRelaciones(fila) : null;
    },
    findMany: async ({ where }: { where?: Fila } = {}) =>
      estado.suscripciones.filter((f) => coincide(f, where ?? {})),
    update: async ({ where, data }: { where: Fila; data: Fila }) => {
      const fila = estado.suscripciones.find((f) => coincide(f, where));
      if (fila) Object.assign(fila, data);
      return fila ?? {};
    },
    /**
     * Modela el guard ATÓMICO como lo hace Postgres: el `WHERE` condicional decide, y el `count` es
     * lo que le dice al caller si ganó. Si el fake ignorara ese filtro, el guard de concurrencia
     * sería INVISIBLE al test — la lección del `updateMany` de cupones (F03) y del ledger (F04).
     */
    updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
      if (s.otraCorridaGana) {
        s.otraCorridaGana = false;
        const perdida = estado.suscripciones.find((f) => f.id === where.id);
        if (perdida) {
          perdida.cancelacionSolicitadaAt = new Date("2026-07-26T11:59:00Z");
          perdida.cancelacionEfectivaAt = FIN_PERIODO;
        }
      }
      const filas = estado.suscripciones.filter((f) => coincide(f, where));
      for (const fila of filas) Object.assign(fila, data);
      return { count: filas.length };
    },
  };

  const db = { platformSubscription } as unknown as PrismaClient;
  return { db, estado };
}

/** Fake de Flow con mocks como PROPIEDADES (`@typescript-eslint/unbound-method`), igual que F03. */
function fakeFlow(overrides: Record<string, unknown> = {}) {
  const mocks = {
    cancelarSuscripcion: vi.fn(async () => ({
      subscriptionId: "flow-sub-A",
      status: 1,
      cancel_at_period_end: 1,
      period_end: "2026-08-26",
    })),
    cambiarPlan: vi.fn(async () => ({
      subscriptionId: "flow-sub-B",
      status: 1,
    })),
    ...overrides,
  };
  return { mocks, flow: mocks as unknown as FlowPlataformaService };
}

describe("domain/facturacion/cancelarPlan", () => {
  // facturacion.cancelar.001 — cancel_at_period_end: la tienda sigue vendiendo hasta el fin del período
  it("cancela al fin del período y NO corta la venta todavía", async () => {
    const { db, estado } = fakeDb({ suscripciones: [{ ...SUB_FULL }] });
    const { flow, mocks } = fakeFlow();

    const r = await cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA });

    expect(mocks.cancelarSuscripcion).toHaveBeenCalledWith({
      subscriptionId: "flow-sub-A",
      alFinDelPeriodo: true,
    });

    const fila = estado.suscripciones[0]!;
    expect(fila.cancelacionSolicitadaAt).toEqual(AHORA);
    expect(fila.cancelacionEfectivaAt).toEqual(FIN_PERIODO);
    // El ESTADO no se toca (D6): la tienda vende hasta que Flow cierre el período y lo notifique
    // (F04). Marcarla CANCELADA acá le quitaría un mes ya pagado.
    expect(fila.estado).toBe("AL_DIA");
    expect(r.cancelacionEfectivaAtIso).toBe(FIN_PERIODO.toISOString());
  });

  // facturacion.cancelar.002 — correo (5) de D10, al PAGADOR y con la fecha hasta la que vende
  it("decide el correo de cancelación para el Pagador, con la fecha de término", async () => {
    const { db } = fakeDb({ suscripciones: [{ ...SUB_FULL }] });
    const { flow } = fakeFlow();

    const r = await cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA });

    expect(r.correos).toHaveLength(1);
    const correo = r.correos[0]!;
    // El PAGADOR de la suscripción (D1/D10), no quien apretó el botón: una Tienda admite más de una
    // membresía y el cliente de la Plataforma es quien puso la tarjeta.
    expect(correo.destinatario).toBe("pagador@x.cl");
    expect(correo.datos.tipo).toBe("CANCELACION_CONFIRMADA");
    expect(correo.datos.nombreTienda).toBe("Mi Tienda");
    expect(correo.datos.cancelacionEfectivaAt).toEqual(FIN_PERIODO);
  });

  // facturacion.cancelar.003 — D7/I8: al cancelar la full, la ADICIONAL MÁS ANTIGUA se promueve
  it("programa el cambio a full de la adicional más antigua del mismo Pagador", async () => {
    const { db, estado } = fakeDb({
      suscripciones: [
        { ...SUB_FULL },
        {
          ...SUB_FULL,
          id: "sub-B",
          tenantId: "B",
          plan: "ADICIONAL",
          flowSubscriptionId: "flow-sub-B",
          createdAt: new Date("2026-03-01T00:00:00Z"),
        },
        {
          ...SUB_FULL,
          id: "sub-C",
          tenantId: "C",
          plan: "ADICIONAL",
          flowSubscriptionId: "flow-sub-C",
          createdAt: new Date("2026-05-01T00:00:00Z"),
        },
      ],
    });
    const { flow, mocks } = fakeFlow();

    await cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA });

    // Una sola promoción, y es la de la adicional MÁS ANTIGUA (B, no C).
    expect(mocks.cambiarPlan).toHaveBeenCalledTimes(1);
    expect(mocks.cambiarPlan).toHaveBeenCalledWith({
      subscriptionId: "flow-sub-B",
      nuevoPlanId: "sorteatelo-tienda-full",
    });

    const b = estado.suscripciones.find((f) => f.id === "sub-B")!;
    // PROGRAMADO, no aplicado (D7): el `plan` vigente no se toca — el precio nuevo rige desde la
    // próxima renovación. Cobrarle full este mes sería retroactivo.
    expect(b.plan).toBe("ADICIONAL");
    expect(b.planProgramado).toBe("FULL");

    const c = estado.suscripciones.find((f) => f.id === "sub-C")!;
    expect(c.planProgramado).toBeNull();
  });

  // facturacion.cancelar.004 — idempotencia: cancelar dos veces no repite Flow ni el correo
  it("cancelar de nuevo no vuelve a llamar a Flow ni manda un segundo correo", async () => {
    const { db } = fakeDb({
      suscripciones: [
        {
          ...SUB_FULL,
          cancelacionSolicitadaAt: new Date("2026-07-20T10:00:00Z"),
          cancelacionEfectivaAt: FIN_PERIODO,
        },
      ],
    });
    const { flow, mocks } = fakeFlow();

    const r = await cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA });

    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
    // Un correo no se puede des-enviar: dos «cancelamos tu plan» por un doble click harían dudar de
    // si se canceló dos veces algo que solo se cancela una.
    expect(r.correos).toHaveLength(0);
    // Igual responde la fecha: la UI que reintentó tiene que poder mostrar hasta cuándo vende.
    expect(r.cancelacionEfectivaAtIso).toBe(FIN_PERIODO.toISOString());
  });

  // facturacion.cancelar.009 — dos cancelaciones CONCURRENTES mandan UN solo correo
  it("si otra corrida sella la cancelación primero, esta no manda correo ni recalcula", async () => {
    const { db } = fakeDb({
      suscripciones: [
        { ...SUB_FULL },
        {
          ...SUB_FULL,
          id: "sub-B",
          tenantId: "B",
          plan: "ADICIONAL",
          flowSubscriptionId: "flow-sub-B",
          createdAt: new Date("2026-03-01T00:00:00Z"),
        },
      ],
      otraCorridaGana: true,
    });
    const { flow, mocks } = fakeFlow();

    const r = await cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA });

    // El guard de entrada NO alcanza acá: las dos corridas leyeron `cancelacionSolicitadaAt: null`
    // antes de que ninguna escribiera. Quien decide es el `count` del guard atómico.
    expect(r.correos).toHaveLength(0);
    // Y tampoco se promueve dos veces la adicional del Pagador.
    expect(mocks.cambiarPlan).not.toHaveBeenCalled();
    // Igual responde la fecha que quedó sellada, que es lo que la UI tiene que mostrar.
    expect(r.cancelacionEfectivaAtIso).toBe(FIN_PERIODO.toISOString());
  });

  // facturacion.cancelar.005 — sin plan que cancelar ⇒ rechazo server-side, cero llamadas a Flow
  it("rechaza cancelar una tienda sin suscripción y no toca Flow", async () => {
    const { db } = fakeDb({ suscripciones: [] });
    const { flow, mocks } = fakeFlow();

    await expect(
      cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA }),
    ).rejects.toThrow(/plan/i);
    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
  });

  // facturacion.cancelar.006 — una suscripción YA cancelada (período cerrado) no se re-cancela
  it("rechaza cancelar una suscripción que ya está CANCELADA", async () => {
    const { db } = fakeDb({
      suscripciones: [{ ...SUB_FULL, estado: "CANCELADA" }],
    });
    const { flow, mocks } = fakeFlow();

    await expect(
      cancelarPlan({ db, acceso: acceso(["A"]), flow, ahora: AHORA }),
    ).rejects.toThrow(/plan/i);
    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
  });

  // facturacion.cancelar.007 — scoping: sin membresía sobre la Tienda del host, FORBIDDEN
  it("rechaza a quien no es miembro de la Tienda (selecciona-jamás-autoriza)", async () => {
    const { db } = fakeDb({ suscripciones: [{ ...SUB_FULL }] });
    const { flow, mocks } = fakeFlow();

    await expect(
      cancelarPlan({ db, acceso: acceso([]), flow, ahora: AHORA }),
    ).rejects.toThrow();
    expect(mocks.cancelarSuscripcion).not.toHaveBeenCalled();
  });
});

/**
 * Guard ESTRUCTURAL de D6: cancelar (eje comercial) y despublicar (eje operativo) son acciones
 * distintas y ninguna arrastra a la otra.
 *
 * Se vigila por IMPORTS y no con un test de comportamiento porque el invariante es «esto NUNCA debe
 * empezar a pasar»: hoy `despublicarTienda` no toca la facturación, así que un fake no tendría nada
 * que observar y el test pasaría por vacío — seguiría pasando el día que alguien agregue la
 * cancelación ahí. La consecuencia de esa regresión es cara y silenciosa: un Organizador que baja la
 * tienda una semana para reorganizarse volvería y encontraría su plan cancelado.
 */
describe("D6 — el eje comercial y el operativo no se mezclan", () => {
  const SRC = fileURLToPath(new URL("../../../", import.meta.url)); // src/

  // facturacion.cancelar.008 — despublicar NO altera la suscripción
  it("despublicarTienda no importa nada de facturación", () => {
    const fuente = readFileSync(
      SRC + "server/domain/tenants/despublicarTienda.ts",
      "utf8",
    );
    const modulos = [...fuente.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);

    expect(modulos).not.toContain("~/server/domain/facturacion/cancelarPlan");
    expect(modulos.filter((m) => m.includes("facturacion"))).toEqual([]);
    // Ni por la vía directa de Prisma: la única tabla que toca es `tenant`.
    expect(fuente).not.toMatch(/platformSubscription|platformExemption/);
  });
});
