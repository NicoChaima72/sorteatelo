import { describe, expect, it, vi } from "vitest";

import { bootstrapPlanesPlataforma } from "~/server/facturacion/bootstrapPlanes";
import { REINTENTOS_COBRO_FLOW } from "~/server/domain/facturacion/_invoiceFlow";
import { PLANES_PLATAFORMA } from "~/server/domain/facturacion/_precios";
import type {
  CrearPlanInput,
  FlowPlan,
  FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * Tests del núcleo del bootstrap de los 2 planes de Flow (F02). Es el paso de puesta en marcha de
 * la cuenta de plataforma: crea en Flow el plan full ($25.000) y el adicional ($12.500), ambos
 * mensuales y apuntando su `urlCallback` al webhook de suscripciones (F04).
 *
 * Corre contra un `FlowPlataformaService` FAKE: el núcleo recibe el service inyectado y no toca
 * `env` ni la red (patrón "núcleo testeable + wrapper" de backend-conventions § Scripts CLI).
 */

const CALLBACK = "https://sorteatelo.cl/api/webhooks/flow-suscripciones";

/** Fake stateful de Flow: recuerda los planes creados para que la 2ª corrida los "encuentre". */
function fakeFlow(planesExistentes: string[] = []) {
  const existentes = new Set(planesExistentes);
  const creados: CrearPlanInput[] = [];

  const flow = {
    getPlan: vi.fn(async (planId: string): Promise<FlowPlan> => {
      if (!existentes.has(planId)) {
        // Flow responde con error cuando el plan no existe.
        throw new Error("Flow (plataforma) /api/plan/get respondió 400.");
      }
      return { planId };
    }),
    crearPlan: vi.fn(async (input: CrearPlanInput): Promise<FlowPlan> => {
      creados.push(input);
      existentes.add(input.planId);
      return { planId: input.planId };
    }),
  } as unknown as FlowPlataformaService;

  return { flow, creados };
}

describe("facturacion/bootstrapPlanesPlataforma", () => {
  // facturacion.bootstrap.001 — primera corrida: crea los 2 planes con montos y callback correctos
  it("crea el plan full y el adicional con sus montos, mensuales y con el urlCallback del webhook", async () => {
    const { flow, creados } = fakeFlow();

    const r = await bootstrapPlanesPlataforma({ flow, urlCallback: CALLBACK });

    expect(r.creados.map((p) => p.plan)).toEqual(["FULL", "ADICIONAL"]);
    expect(r.existentes).toEqual([]);

    expect(creados).toHaveLength(2);
    const full = creados.find((c) => c.amount === "25000");
    const adicional = creados.find((c) => c.amount === "12500");
    expect(full).toBeDefined();
    expect(adicional).toBeDefined();
    for (const c of creados) {
      expect(c.urlCallback).toBe(CALLBACK);
      // El tope de reintentos se registra EXPLÍCITAMENTE en Flow (F04): es el mismo número contra el
      // que `_invoiceFlow.ts` mide `attemp` para declarar un invoice VENCIDA (y suspender la tienda).
      // Dejarlo al default del proveedor haría que ese tope viviera en dos lugares, uno de ellos
      // fuera de nuestro control.
      expect(c.chargesRetriesNumber).toBe(REINTENTOS_COBRO_FLOW);
    }
    // Los planId son los del catálogo del dominio (no strings sueltos del script).
    expect(creados.map((c) => c.planId).sort()).toEqual(
      PLANES_PLATAFORMA.map((p) => p.flowPlanId).sort(),
    );
  });

  // facturacion.bootstrap.002 — la 2ª corrida NO duplica: los planes ya están en Flow
  it("es idempotente: una segunda corrida no vuelve a crear nada", async () => {
    const { flow, creados } = fakeFlow();

    await bootstrapPlanesPlataforma({ flow, urlCallback: CALLBACK });
    const segunda = await bootstrapPlanesPlataforma({
      flow,
      urlCallback: CALLBACK,
    });

    expect(creados).toHaveLength(2); // sigue en 2: la 2ª corrida no agregó ninguno
    expect(segunda.creados).toEqual([]);
    expect(segunda.existentes.map((p) => p.plan)).toEqual([
      "FULL",
      "ADICIONAL",
    ]);
  });

  // facturacion.bootstrap.003 — corrida parcial: solo crea el que falta
  it("crea únicamente el plan que falta cuando el otro ya existe", async () => {
    const yaEnFlow = PLANES_PLATAFORMA.find((p) => p.plan === "FULL")!;
    const { flow, creados } = fakeFlow([yaEnFlow.flowPlanId]);

    const r = await bootstrapPlanesPlataforma({ flow, urlCallback: CALLBACK });

    expect(r.creados.map((p) => p.plan)).toEqual(["ADICIONAL"]);
    expect(r.existentes.map((p) => p.plan)).toEqual(["FULL"]);
    expect(creados).toHaveLength(1);
  });
});
