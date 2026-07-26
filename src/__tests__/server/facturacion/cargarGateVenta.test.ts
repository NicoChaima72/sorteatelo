import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { cargarGateVenta } from "~/server/domain/facturacion/cargarGateVenta";

/**
 * Tests del LECTOR del gate de venta (F05/D5) — el único punto que carga de la DB los tres hechos
 * (estado de la Tienda + estado de su suscripción + su exención) y los pasa al núcleo puro.
 *
 * Es la pieza que comparten las tres superficies de F05: el SSR del storefront, el checkout y el
 * guard del panel. Que sea UNA sola es el punto: tres lecturas distintas de «¿puede vender?»
 * derivarían tarde o temprano.
 */

const AHORA = new Date("2026-07-26T12:00:00Z");

interface TenantFake {
  id: string;
  slug: string;
  estado: "ALTA" | "CONFIGURACION" | "PUBLICADA" | "SUSPENDIDA";
  platformSubscription: { estado: "AL_DIA" | "COBRO_PENDIENTE" | "EN_PAUSA_POR_PAGO" | "CANCELADA" } | null;
  platformExemption: { exentaHasta: Date | null } | null;
}

const tenantFake = (over: Partial<TenantFake> = {}): TenantFake => ({
  id: "tenant-1",
  slug: "mitienda",
  estado: "PUBLICADA",
  platformSubscription: { estado: "AL_DIA" },
  platformExemption: null,
  ...over,
});

/** `db` fake: solo `tenant.findUnique`, que es todo lo que este lector toca. */
function fakeDb(tenants: TenantFake[]) {
  const consultas: unknown[] = [];
  const db = {
    tenant: {
      findUnique: async (args: { where: { id?: string; slug?: string } }) => {
        consultas.push(args.where);
        const t = tenants.find(
          (x) =>
            (args.where.id !== undefined && x.id === args.where.id) ||
            (args.where.slug !== undefined && x.slug === args.where.slug),
        );
        return t ?? null;
      },
    },
  } as unknown as PrismaClient;
  return { db, consultas };
}

describe("domain/facturacion/cargarGateVenta", () => {
  // facturacion.cargaGate.001 — resuelve por slug (storefront) y por id (checkout/panel)
  it("resuelve la misma Tienda por slug o por id", async () => {
    const { db, consultas } = fakeDb([tenantFake()]);

    const porSlug = await cargarGateVenta({ db, where: { slug: "mitienda" }, ahora: AHORA });
    const porId = await cargarGateVenta({ db, where: { id: "tenant-1" }, ahora: AHORA });

    expect(porSlug.puedeVender).toBe(true);
    expect(porId).toEqual(porSlug);
    expect(consultas).toEqual([{ slug: "mitienda" }, { id: "tenant-1" }]);
  });

  // facturacion.cargaGate.002 — compone los hechos de la DB en el gate + el interruptor de pausa
  it("una tienda publicada con el dunning agotado no vende y queda en pausa", async () => {
    const { db } = fakeDb([
      tenantFake({ platformSubscription: { estado: "EN_PAUSA_POR_PAGO" } }),
    ]);

    const gate = await cargarGateVenta({ db, where: { slug: "mitienda" }, ahora: AHORA });

    expect(gate).toEqual({
      puedeVender: false,
      exenta: false,
      motivo: "EN_PAUSA_POR_PAGO",
      estadoSuscripcion: "EN_PAUSA_POR_PAGO",
      // La exención viaja junto a la decisión (F07/D8): el hecho ya se leyó para evaluar el gate y
      // el chrome del panel lo necesita para el preaviso de expiración de la cortesía.
      exencion: null,
      enPausa: true,
    });
  });

  // facturacion.cargaGate.003 — la exención se evalúa LAZY con el `ahora` inyectado (D8)
  it("la exención con fecha vale hasta su corte y no un minuto más, sin cron", async () => {
    const { db } = fakeDb([
      tenantFake({
        platformSubscription: null,
        platformExemption: { exentaHasta: new Date("2026-07-26T11:59:00Z") },
      }),
    ]);

    const antes = await cargarGateVenta({
      db,
      where: { slug: "mitienda" },
      ahora: new Date("2026-07-26T11:58:00Z"),
    });
    expect(antes).toMatchObject({ puedeVender: true, exenta: true, enPausa: false });

    const despues = await cargarGateVenta({ db, where: { slug: "mitienda" }, ahora: AHORA });
    expect(despues).toMatchObject({
      puedeVender: false,
      motivo: "EXENCION_EXPIRADA",
      enPausa: true,
    });
  });

  // facturacion.cargaGate.004 — Tienda inexistente ⇒ fail-closed, y NO como pausa de facturación
  it("una Tienda inexistente no vende, y no se reporta como pausa por facturación", async () => {
    const { db } = fakeDb([]);

    const gate = await cargarGateVenta({ db, where: { slug: "fantasma" }, ahora: AHORA });

    expect(gate.puedeVender).toBe(false);
    // `NO_PUBLICADA` y no un motivo comercial: sin fila no hay nada que regularizar, y un
    // `enPausa: true` acá mandaría al panel de un tenant inexistente a la página Plan.
    expect(gate.motivo).toBe("NO_PUBLICADA");
    expect(gate.enPausa).toBe(false);
    expect(gate.estadoSuscripcion).toBeNull();
  });

  // facturacion.cargaGate.005 — durante los reintentos de Flow la tienda SIGUE vendiendo (D4)
  it("con el cobro pendiente vende y no queda en pausa, pero el estado viaja para el aviso", async () => {
    const { db } = fakeDb([
      tenantFake({ platformSubscription: { estado: "COBRO_PENDIENTE" } }),
    ]);

    const gate = await cargarGateVenta({ db, where: { slug: "mitienda" }, ahora: AHORA });

    expect(gate.puedeVender).toBe(true);
    expect(gate.enPausa).toBe(false);
    // El estado se expone para que el banner del panel pueda avisar sin una segunda consulta.
    expect(gate.estadoSuscripcion).toBe("COBRO_PENDIENTE");
  });
});
