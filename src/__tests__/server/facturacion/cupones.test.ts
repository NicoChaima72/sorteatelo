import { describe, expect, it } from "vitest";

import {
  type DatosCupon,
  evaluarCanje,
  MENSAJE_CUPON_INVALIDO,
  normalizarCodigo,
} from "~/server/domain/facturacion/_cupones";

/**
 * Tests de la elegibilidad de canje de un Cupón de plataforma (F03/F08, D9). Núcleo puro: decide si
 * el canje procede. La reserva atómica (contador + unique) y la llamada a Flow viven en el use case.
 */

const AHORA = new Date("2026-07-26T12:00:00Z");
const valido: DatosCupon = {
  activo: true,
  expiraAt: null,
  maxCanjes: null,
  canjes: 0,
};

const evaluar = (cupon: DatosCupon | null, yaCanjeadoPorLaTienda = false) =>
  evaluarCanje({ cupon, ahora: AHORA, yaCanjeadoPorLaTienda });

describe("domain/facturacion/normalizarCodigo", () => {
  // facturacion.cupon.001 — el código se normaliza en los dos extremos (unique case-sensitive)
  it("saca espacios y pasa a mayúsculas", () => {
    expect(normalizarCodigo("army2026")).toBe("ARMY2026");
    expect(normalizarCodigo("  army 2026 ")).toBe("ARMY2026");
    expect(normalizarCodigo("ARMY2026")).toBe("ARMY2026");
  });
});

describe("domain/facturacion/evaluarCanje", () => {
  // facturacion.cupon.002 — un cupón sano y sin topes se puede canjear
  it("acepta un cupón activo, sin expiración ni tope", () => {
    expect(evaluar(valido)).toEqual({ ok: true });
  });

  // facturacion.cupon.003 — inexistente / inactivo / expirado / agotado: todos rechazados
  it("rechaza inexistente, inactivo, expirado y agotado", () => {
    expect(evaluar(null)).toEqual({ ok: false, motivo: "INEXISTENTE" });
    expect(evaluar({ ...valido, activo: false })).toEqual({
      ok: false,
      motivo: "INACTIVO",
    });
    expect(
      evaluar({ ...valido, expiraAt: new Date("2026-07-25T00:00:00Z") }),
    ).toEqual({ ok: false, motivo: "EXPIRADO" });
    expect(evaluar({ ...valido, maxCanjes: 3, canjes: 3 })).toEqual({
      ok: false,
      motivo: "AGOTADO",
    });
  });

  // facturacion.cupon.004 — maxCanjes = 1 (código PERSONAL) se agota con el primer canje
  it("un código personal (maxCanjes 1) sirve una vez y después queda agotado", () => {
    expect(evaluar({ ...valido, maxCanjes: 1, canjes: 0 })).toEqual({ ok: true });
    expect(evaluar({ ...valido, maxCanjes: 1, canjes: 1 })).toEqual({
      ok: false,
      motivo: "AGOTADO",
    });
  });

  // facturacion.cupon.005 — la misma Tienda no canjea dos veces el mismo código (@@unique)
  it("rechaza un código que esta Tienda ya canjeó", () => {
    expect(evaluar(valido, true)).toEqual({
      ok: false,
      motivo: "YA_CANJEADO",
    });
  });

  // facturacion.cupon.006 — el borde exacto de la expiración: vence AL llegar la fecha
  it("expira al alcanzar la fecha, no después", () => {
    expect(evaluar({ ...valido, expiraAt: AHORA }).ok).toBe(false);
    expect(
      evaluar({ ...valido, expiraAt: new Date(AHORA.getTime() + 1) }).ok,
    ).toBe(true);
  });

  // facturacion.cupon.007 — el mensaje al Organizador es NEUTRAL (no delata el motivo)
  it("el mensaje público no distingue el motivo del rechazo", () => {
    // Un mensaje por motivo convertiría el input en un oráculo para adivinar códigos ajenos.
    expect(MENSAJE_CUPON_INVALIDO).not.toMatch(
      /existe|agotad|expirad|inactiv|ya (lo )?us/i,
    );
    // Y ofrece la salida: se puede seguir sin código (el cupón es opcional).
    expect(MENSAJE_CUPON_INVALIDO).toMatch(/sin código/i);
  });
});
