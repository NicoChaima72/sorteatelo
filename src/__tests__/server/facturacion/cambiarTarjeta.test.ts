import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { confirmarCambioDeTarjeta } from "~/server/domain/facturacion/confirmarCambioDeTarjeta";
import { iniciarCambioDeTarjeta } from "~/server/domain/facturacion/iniciarCambioDeTarjeta";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Tests de «Cambiar tarjeta» (F10/D12, ADR-0026): el re-registro del medio de pago de una Tienda con
 * el plan ya activo.
 *
 * Es el mismo viaje a Flow que la activación (F03) pero con el resultado invertido: **acá no nace
 * ninguna suscripción**, solo se reemplaza la tarjeta del customer del Pagador. Y con un guard que
 * la activación no necesita: la Tienda puede tener varias membresías, y el medio de pago es de quien
 * lo puso (D1).
 */

const acceso = (userId = "u1"): AccesoPanel => ({
  userId,
  email: "org@x.cl",
  tenantIds: ["A"],
  tenantIdDelHost: "A",
});

const suscripcionViva = (extra: Record<string, unknown> = {}) => ({
  id: "sub-1",
  estado: "AL_DIA",
  pagadorId: "bc1",
  pagador: { id: "bc1", userId: "u1", flowCustomerId: "cus_1" },
  ...extra,
});

function fakeDb(suscripcion: Record<string, unknown> | null) {
  const actualizaciones: Record<string, unknown>[] = [];
  const escriturasDeSuscripcion: string[] = [];

  const db = {
    platformSubscription: {
      findUnique: async () => suscripcion,
      update: async () => {
        escriturasDeSuscripcion.push("update");
        return {};
      },
      updateMany: async () => {
        escriturasDeSuscripcion.push("updateMany");
        return { count: 1 };
      },
    },
    platformBillingCustomer: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        actualizaciones.push(data);
        return { id: "bc1" };
      },
    },
  } as unknown as PrismaClient;

  return { db, actualizaciones, escriturasDeSuscripcion };
}

function fakeFlow(over: Partial<FlowPlataformaService> = {}) {
  return {
    registrarTarjeta: vi
      .fn()
      .mockResolvedValue({ url: "https://flow.cl/registro/xyz", token: "tk" }),
    getEstadoRegistro: vi.fn().mockResolvedValue({
      status: 1,
      customerId: "cus_1",
      creditCardType: "Mastercard",
      last4CardDigits: "1111",
    }),
    crearSuscripcion: vi.fn(),
    cancelarSuscripcion: vi.fn(),
    ...over,
  } as unknown as FlowPlataformaService & {
    registrarTarjeta: ReturnType<typeof vi.fn>;
    getEstadoRegistro: ReturnType<typeof vi.fn>;
    crearSuscripcion: ReturnType<typeof vi.fn>;
  };
}

describe("domain/facturacion/iniciarCambioDeTarjeta", () => {
  // facturacion.tarjeta.001 — el tracer: el Pagador con plan vivo sale a Flow con SU customer
  it("devuelve la URL de registro para el customer del Pagador", async () => {
    const { db } = fakeDb(suscripcionViva());
    const flow = fakeFlow();

    const r = await iniciarCambioDeTarjeta({
      db,
      acceso: acceso(),
      flow,
      urlRetorno: "https://ana.sorteatelo.cl/admin/plan/retorno?modo=tarjeta",
    });

    expect(r.redirectUrl).toBe("https://flow.cl/registro/xyz");
    expect(flow.registrarTarjeta).toHaveBeenCalledWith({
      customerId: "cus_1",
      urlReturn: "https://ana.sorteatelo.cl/admin/plan/retorno?modo=tarjeta",
    });
  });

  // facturacion.tarjeta.002 — sin plan vivo no hay tarjeta que cambiar
  it("rechaza sin suscripción o con la suscripción cancelada, sin llamar a Flow", async () => {
    for (const suscripcion of [null, suscripcionViva({ estado: "CANCELADA" })]) {
      const { db } = fakeDb(suscripcion);
      const flow = fakeFlow();

      await expect(
        iniciarCambioDeTarjeta({
          db,
          acceso: acceso(),
          flow,
          urlRetorno: "https://x/retorno",
        }),
      ).rejects.toMatchObject({ code: "INVALID" });

      // Re-suscribir es el camino correcto ahí, y ese ya registra la tarjeta.
      expect(flow.registrarTarjeta).not.toHaveBeenCalled();
    }
  });

  // facturacion.tarjeta.003 — D1: el medio de pago es de quien lo puso, no de toda membresía
  it("rechaza a una membresía que no es el Pagador, sin llamar a Flow", async () => {
    const { db } = fakeDb(suscripcionViva());
    const flow = fakeFlow();

    // Otra persona administra la misma Tienda. Dejarla registrar su tarjeta sobre el customer del
    // Pagador haría que le cobren a alguien que nunca eligió pagar — y los comprobantes seguirían
    // yendo al correo del Pagador.
    await expect(
      iniciarCambioDeTarjeta({
        db,
        acceso: acceso("u-otro"),
        flow,
        urlRetorno: "https://x/retorno",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(flow.registrarTarjeta).not.toHaveBeenCalled();
  });
});

describe("domain/facturacion/confirmarCambioDeTarjeta", () => {
  // facturacion.tarjeta.004 — I3: la confirmación es server-side, y solo cambia la tarjeta
  it("verifica el registro contra Flow y reemplaza marca y últimos 4", async () => {
    const { db, actualizaciones, escriturasDeSuscripcion } = fakeDb(
      suscripcionViva(),
    );
    const flow = fakeFlow();

    const r = await confirmarCambioDeTarjeta({
      db,
      acceso: acceso(),
      flow,
      input: { token: "tk" },
    });

    expect(flow.getEstadoRegistro).toHaveBeenCalledWith("tk");
    expect(r).toEqual({ marca: "Mastercard", ultimos4: "1111" });
    expect(actualizaciones).toEqual([
      { tarjetaMarca: "Mastercard", tarjetaUltimos4: "1111" },
    ]);
    // Cambiar la tarjeta NO toca el plan: ni crea una suscripción nueva, ni cancela, ni mueve el
    // estado. La suscripción en Flow sigue siendo la misma y pasa a cobrarle a la tarjeta nueva.
    expect(escriturasDeSuscripcion).toEqual([]);
    expect(flow.crearSuscripcion).not.toHaveBeenCalled();
  });

  // facturacion.tarjeta.005 — un registro que Flow no confirmó no cambia nada
  it("no toca la tarjeta si Flow no confirma el registro", async () => {
    const { db, actualizaciones } = fakeDb(suscripcionViva());
    const flow = fakeFlow({
      getEstadoRegistro: vi.fn().mockResolvedValue({ status: 0 }),
    } as Partial<FlowPlataformaService>);

    await expect(
      confirmarCambioDeTarjeta({
        db,
        acceso: acceso(),
        flow,
        input: { token: "tk" },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(actualizaciones).toEqual([]);
  });

  // facturacion.tarjeta.006 — un token ajeno no puede plantar la tarjeta de otro
  it("rechaza un token que corresponde a otro customer de Flow", async () => {
    const { db, actualizaciones } = fakeDb(suscripcionViva());
    const flow = fakeFlow({
      getEstadoRegistro: vi.fn().mockResolvedValue({
        status: 1,
        customerId: "cus_AJENO",
        creditCardType: "Visa",
        last4CardDigits: "9999",
      }),
    } as Partial<FlowPlataformaService>);

    await expect(
      confirmarCambioDeTarjeta({
        db,
        acceso: acceso(),
        flow,
        input: { token: "tk" },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(actualizaciones).toEqual([]);
  });
});
