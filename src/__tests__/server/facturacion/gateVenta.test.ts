import { describe, expect, it } from "vitest";

import {
  type DatosGateVenta,
  derivarAvisoFacturacion,
  enPausaPorFacturacion,
  evaluarGateVenta,
} from "~/server/domain/facturacion/_gateVenta";

/**
 * Tests del gate de venta derivado (F01/F05, D4/D5, I5/I6). La regla es
 * `PUBLICADA && (facturación al día || exenta vigente)` — un eje SEPARADO de `TenantStatus`, que
 * queda intacto (I6): una tienda morosa sigue `PUBLICADA` y simplemente no vende.
 *
 * La expiración de la Exención se evalúa **LAZY acá** (D8): no hay cron que corte, el gate compara
 * `exentaHasta` contra el `ahora` inyectado.
 */

const AHORA = new Date("2026-07-26T12:00:00Z");

const base: DatosGateVenta = {
  estadoTienda: "PUBLICADA",
  estadoSuscripcion: "AL_DIA",
  exencion: null,
  ahora: AHORA,
};

describe("domain/facturacion/evaluarGateVenta", () => {
  // facturacion.gate.001 — PUBLICADA + suscripción al día ⇒ vende
  it("una tienda publicada con la suscripción al día vende", () => {
    expect(evaluarGateVenta(base)).toEqual({
      puedeVender: true,
      exenta: false,
      motivo: null,
    });
  });

  // facturacion.gate.002 — el estado de la Tienda manda primero (I6: el eje no se mezcla)
  it("una tienda que no está publicada no vende, aunque su plan esté al día", () => {
    for (const estadoTienda of ["ALTA", "CONFIGURACION", "SUSPENDIDA"] as const) {
      const r = evaluarGateVenta({ ...base, estadoTienda });
      expect(r.puedeVender).toBe(false);
      expect(r.motivo).toBe("NO_PUBLICADA");
    }
  });

  // facturacion.gate.003 — durante los reintentos de Flow la tienda SIGUE vendiendo (D4: solo avisos)
  it("con el cobro pendiente sigue vendiendo (dunning en curso = solo avisos)", () => {
    const r = evaluarGateVenta({ ...base, estadoSuscripcion: "COBRO_PENDIENTE" });
    expect(r.puedeVender).toBe(true);
    expect(r.motivo).toBeNull();
  });

  // facturacion.gate.004 — agotado el dunning, deja de vender; cancelada o sin plan, tampoco
  it("no vende en pausa por pago, cancelada ni sin plan", () => {
    expect(
      evaluarGateVenta({ ...base, estadoSuscripcion: "EN_PAUSA_POR_PAGO" }),
    ).toMatchObject({ puedeVender: false, motivo: "EN_PAUSA_POR_PAGO" });
    expect(
      evaluarGateVenta({ ...base, estadoSuscripcion: "CANCELADA" }),
    ).toMatchObject({ puedeVender: false, motivo: "SIN_PLAN" });
    expect(
      evaluarGateVenta({ ...base, estadoSuscripcion: null }),
    ).toMatchObject({ puedeVender: false, motivo: "SIN_PLAN" });
  });

  // facturacion.gate.005 — exención perpetua o con fecha vigente ⇒ vende SIN suscripción (D8)
  it("una tienda exenta vende sin suscripción, con exención perpetua o vigente", () => {
    const perpetua = evaluarGateVenta({
      ...base,
      estadoSuscripcion: null,
      exencion: { exentaHasta: null },
    });
    expect(perpetua).toEqual({ puedeVender: true, exenta: true, motivo: null });

    const vigente = evaluarGateVenta({
      ...base,
      estadoSuscripcion: null,
      exencion: { exentaHasta: new Date("2026-07-27T00:00:00Z") },
    });
    expect(vigente.puedeVender).toBe(true);
    expect(vigente.exenta).toBe(true);
  });

  // facturacion.gate.006 — expiración LAZY: pasada la fecha, la exención deja de valer (sin cron)
  it("la exención expirada deja de valer en el mismo gate, sin cron", () => {
    const exencion = { exentaHasta: new Date("2026-07-26T11:59:00Z") }; // un minuto antes de AHORA
    const r = evaluarGateVenta({ ...base, estadoSuscripcion: null, exencion });
    expect(r).toEqual({
      puedeVender: false,
      exenta: false,
      motivo: "EXENCION_EXPIRADA",
    });
    // Un minuto ANTES del corte, la misma fila sí valía.
    expect(
      evaluarGateVenta({
        ...base,
        estadoSuscripcion: null,
        exencion,
        ahora: new Date("2026-07-26T11:58:00Z"),
      }).puedeVender,
    ).toBe(true);
  });

  // facturacion.gate.007 — expirada la exención, una suscripción al día sigue habilitando la venta
  it("con la exención expirada pero suscripción al día, vende igual", () => {
    const r = evaluarGateVenta({
      ...base,
      exencion: { exentaHasta: new Date("2026-01-01T00:00:00Z") },
    });
    expect(r.puedeVender).toBe(true);
    expect(r.exenta).toBe(false);
  });
});

/**
 * El interruptor del modo "en pausa" (F05/D4): storefront sin venta + panel restringido a la página
 * Plan. Se separa del `puedeVender` porque los DOS ejes (operativo `TenantStatus` / comercial
 * facturación) mandan cosas distintas: una tienda en CONFIGURACION tampoco vende, y restringirle el
 * panel sería impedirle terminar de configurarse.
 */
describe("domain/facturacion/enPausaPorFacturacion", () => {
  // facturacion.gate.008 — los 3 motivos del eje COMERCIAL ponen la tienda en pausa
  it("en pausa cuando la tienda está publicada y su facturación no sostiene la venta", () => {
    expect(
      enPausaPorFacturacion(
        evaluarGateVenta({ ...base, estadoSuscripcion: "EN_PAUSA_POR_PAGO" }),
      ),
    ).toBe(true);
    // Canceló y se cerró el período (D6): publicada, sin plan que sostenga la venta.
    expect(
      enPausaPorFacturacion(evaluarGateVenta({ ...base, estadoSuscripcion: null })),
    ).toBe(true);
    // Exención con fecha, ya vencida (D8, evaluación lazy).
    expect(
      enPausaPorFacturacion(
        evaluarGateVenta({
          ...base,
          estadoSuscripcion: null,
          exencion: { exentaHasta: new Date("2026-01-01T00:00:00Z") },
        }),
      ),
    ).toBe(true);
  });

  // facturacion.gate.009 — el eje OPERATIVO no enciende el modo pausa (I6: los ejes no se mezclan)
  it("NO en pausa por el eje operativo: alta, configuración, suspendida ni despublicada morosa", () => {
    for (const estadoTienda of ["ALTA", "CONFIGURACION", "SUSPENDIDA"] as const) {
      // Sin plan y sin publicar: es una tienda armándose, no una morosa.
      expect(
        enPausaPorFacturacion(
          evaluarGateVenta({ ...base, estadoTienda, estadoSuscripcion: null }),
        ),
      ).toBe(false);
      // Y una DESPUBLICADA que además debe: no vende igual (ya está fuera de línea) ⇒ no se la
      // atrapa en un panel restringido por una tienda que ella misma sacó de circulación (D6).
      expect(
        enPausaPorFacturacion(
          evaluarGateVenta({
            ...base,
            estadoTienda,
            estadoSuscripcion: "EN_PAUSA_POR_PAGO",
          }),
        ),
      ).toBe(false);
    }
  });

  // facturacion.gate.010 — quien vende (al día, en reintentos o exenta) nunca está en pausa
  it("NO en pausa cuando la tienda vende: al día, en cobro pendiente o exenta", () => {
    expect(enPausaPorFacturacion(evaluarGateVenta(base))).toBe(false);
    expect(
      enPausaPorFacturacion(
        evaluarGateVenta({ ...base, estadoSuscripcion: "COBRO_PENDIENTE" }),
      ),
    ).toBe(false);
    expect(
      enPausaPorFacturacion(
        evaluarGateVenta({
          ...base,
          estadoSuscripcion: null,
          exencion: { exentaHasta: null },
        }),
      ),
    ).toBe(false);
  });
});

/** Qué se le avisa al Organizador en el banner del panel (F05/D4/D10). */
describe("domain/facturacion/derivarAvisoFacturacion", () => {
  // facturacion.gate.011 — el aviso nombra el motivo, para que el banner diga qué hacer
  it("avisa el motivo de la pausa, no un genérico", () => {
    const aviso = (d: Partial<DatosGateVenta>) =>
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({ ...base, ...d }),
        estadoSuscripcion: d.estadoSuscripcion ?? null,
        exencion: d.exencion ?? null,
        ahora: AHORA,
      });

    expect(aviso({ estadoSuscripcion: "EN_PAUSA_POR_PAGO" })).toBe(
      "EN_PAUSA_POR_PAGO",
    );
    expect(aviso({ estadoSuscripcion: null })).toBe("SIN_PLAN");
    expect(
      aviso({
        estadoSuscripcion: null,
        exencion: { exentaHasta: new Date("2026-01-01T00:00:00Z") },
      }),
    ).toBe("EXENCION_EXPIRADA");
  });

  // facturacion.gate.012 — durante el dunning se avisa aunque la tienda siga vendiendo (D4)
  it("avisa el cobro pendiente aunque la tienda siga vendiendo, y también si está despublicada", () => {
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({ ...base, estadoSuscripcion: "COBRO_PENDIENTE" }),
        estadoSuscripcion: "COBRO_PENDIENTE",
        exencion: null,
        ahora: AHORA,
      }),
    ).toBe("COBRO_PENDIENTE");

    // Despublicada + cobro fallido: el panel NO se restringe (gate.009) pero el aviso SÍ sale —
    // despublicar no cancela la suscripción (D6), así que la deuda sigue y hay que decirlo.
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({
          ...base,
          estadoTienda: "CONFIGURACION",
          estadoSuscripcion: "COBRO_PENDIENTE",
        }),
        estadoSuscripcion: "COBRO_PENDIENTE",
        exencion: null,
        ahora: AHORA,
      }),
    ).toBe("COBRO_PENDIENTE");
  });

  // facturacion.gate.014 — la cortesía por vencer avisa DENTRO de la ventana de 7 días (F07/D8)
  it("avisa la expiración de la cortesía dentro de los 7 días previos, y no antes", () => {
    const aviso = (exentaHasta: Date | null) =>
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({
          ...base,
          estadoSuscripcion: null,
          exencion: { exentaHasta },
        }),
        estadoSuscripcion: null,
        exencion: { exentaHasta },
        ahora: AHORA, // 2026-07-26T12:00Z ⇒ la ventana abre el 2026-08-02T12:00Z
      });

    expect(aviso(new Date("2026-07-29T12:00:00Z"))).toBe("EXENCION_POR_EXPIRAR");
    // El borde exacto de la ventana entra: 7 días clavados todavía es «te queda una semana».
    expect(aviso(new Date("2026-08-02T12:00:00Z"))).toBe("EXENCION_POR_EXPIRAR");
    // Un minuto fuera, no: el aviso llega cuando hay algo que hacer, no meses antes.
    expect(aviso(new Date("2026-08-02T12:01:00Z"))).toBeNull();
    // La perpetua (el GRANDFATHER del despliegue, D3) no vence NUNCA: avisarle una expiración
    // sería inventarle un problema que no tiene.
    expect(aviso(null)).toBeNull();
  });

  // facturacion.gate.015 — el aviso de cortesía no pisa a los que hablan de plata o de la pausa
  it("la cortesía vencida y un cobro fallido mandan sobre el aviso de expiración", () => {
    // Ya venció: el aviso es la EXPIRACIÓN consumada (la tienda dejó de vender), no un preaviso.
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({
          ...base,
          estadoSuscripcion: null,
          exencion: { exentaHasta: new Date("2026-07-26T11:59:00Z") },
        }),
        estadoSuscripcion: null,
        exencion: { exentaHasta: new Date("2026-07-26T11:59:00Z") },
        ahora: AHORA,
      }),
    ).toBe("EXENCION_EXPIRADA");

    // Exenta CON una suscripción en dunning (cortesía otorgada después de suscribir): el cobro
    // fallido es plata real y gana — un preaviso de cortesía no puede tapar una tarjeta rechazada.
    const porVencer = { exentaHasta: new Date("2026-07-28T12:00:00Z") };
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({
          ...base,
          estadoSuscripcion: "COBRO_PENDIENTE",
          exencion: porVencer,
        }),
        estadoSuscripcion: "COBRO_PENDIENTE",
        exencion: porVencer,
        ahora: AHORA,
      }),
    ).toBe("COBRO_PENDIENTE");
  });

  // facturacion.gate.016 — con un plan que la sostiene después, el vencimiento es un NO-EVENTO
  it("no preavisa la expiración si hay una suscripción que sostiene la venta al vencer", () => {
    const porVencer = { exentaHasta: new Date("2026-07-28T12:00:00Z") };
    const aviso = (
      estadoSuscripcion: "AL_DIA" | "CANCELADA" | "EN_PAUSA_POR_PAGO" | null,
    ) =>
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({ ...base, estadoSuscripcion, exencion: porVencer }),
        estadoSuscripcion,
        exencion: porVencer,
        ahora: AHORA,
      });

    // Con el plan al día, el banner mentiría dos veces: «tu tienda vende sin costo» (le están
    // cobrando) y «va a necesitar un plan» (ya lo tiene). Al vencer no pasa nada — lo fija gate.007.
    expect(aviso("AL_DIA")).toBeNull();

    // En cambio, si lo que hay detrás NO sostiene la venta, el preaviso es exactamente lo que hay
    // que decir: el día que venza la cortesía, la tienda deja de recibir pedidos.
    expect(aviso(null)).toBe("EXENCION_POR_EXPIRAR");
    expect(aviso("CANCELADA")).toBe("EXENCION_POR_EXPIRAR");
    // Cortesía otorgada a quien no pudo pagar: mientras viva NO se le persigue la deuda (decisión
    // explícita del docstring), pero sí se le avisa que se termina.
    expect(aviso("EN_PAUSA_POR_PAGO")).toBe("EXENCION_POR_EXPIRAR");
  });

  // facturacion.gate.013 — sin nada que decir, no se molesta al Organizador
  it("no avisa nada a la tienda al día, a la exenta ni a la que todavía se configura", () => {
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta(base),
        estadoSuscripcion: "AL_DIA",
        exencion: null,
        ahora: AHORA,
      }),
    ).toBeNull();
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({
          ...base,
          estadoSuscripcion: null,
          exencion: { exentaHasta: null },
        }),
        estadoSuscripcion: null,
        exencion: { exentaHasta: null },
        ahora: AHORA,
      }),
    ).toBeNull();
    expect(
      derivarAvisoFacturacion({
        gate: evaluarGateVenta({
          ...base,
          estadoTienda: "CONFIGURACION",
          estadoSuscripcion: null,
        }),
        estadoSuscripcion: null,
        exencion: null,
        ahora: AHORA,
      }),
    ).toBeNull();
  });
});
