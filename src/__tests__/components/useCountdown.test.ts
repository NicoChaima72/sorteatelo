import { describe, expect, it } from "vitest";

import {
  bloquesReloj,
  formatoCompacto,
  formatoRelojLinea,
  tiempoRestante,
} from "~/components/storefront/use-countdown";

/**
 * Tests del núcleo PURO del countdown del sorteo (plantilla-rica F04/D9). `tiempoRestante` recibe
 * `fechaFin` + `ahora` inyectados ⇒ se ejerce sin timers ni React: calcula el tiempo restante a una
 * fecha futura y se APAGA (`terminado: true`, todo 0) en una fecha pasada. `formatoCompacto` arma la
 * etiqueta del chip del header.
 */

const AHORA = new Date("2026-07-17T00:00:00.000Z");

describe("storefront/use-countdown — tiempoRestante (núcleo puro)", () => {
  // storefront.countdown.001 — fecha futura ⇒ descompone bien días/horas/minutos/segundos
  it("descompone el tiempo restante a una fecha futura", () => {
    const fin = new Date("2026-07-20T04:05:06.000Z"); // +3d 4h 5m 6s
    const t = tiempoRestante(fin, AHORA);
    expect(t).toEqual({
      dias: 3,
      horas: 4,
      minutos: 5,
      segundos: 6,
      terminado: false,
    });
  });

  // storefront.countdown.002 — fecha pasada ⇒ se apaga (terminado, todo 0)
  it("una fecha ya pasada se apaga: terminado true y todo 0", () => {
    const fin = new Date("2026-07-16T23:59:59.000Z"); // antes de AHORA
    const t = tiempoRestante(fin, AHORA);
    expect(t).toEqual({
      dias: 0,
      horas: 0,
      minutos: 0,
      segundos: 0,
      terminado: true,
    });
  });

  // storefront.countdown.003 — exactamente la fecha de cierre ⇒ terminado (≤ 0)
  it("en el instante exacto de cierre ya está terminado", () => {
    expect(tiempoRestante(AHORA, AHORA).terminado).toBe(true);
  });

  // storefront.countdown.004 — formato compacto según la magnitud restante
  it("formatoCompacto elige la unidad mayor + la siguiente (d/h, h/m, m/s)", () => {
    expect(
      formatoCompacto({ dias: 3, horas: 4, minutos: 5, segundos: 6, terminado: false }),
    ).toBe("3d 04h");
    expect(
      formatoCompacto({ dias: 0, horas: 12, minutos: 30, segundos: 0, terminado: false }),
    ).toBe("12h 30m");
    expect(
      formatoCompacto({ dias: 0, horas: 0, minutos: 45, segundos: 9, terminado: false }),
    ).toBe("45m 09s");
    expect(
      formatoCompacto({ dias: 0, horas: 0, minutos: 0, segundos: 0, terminado: true }),
    ).toBe("Cerrado");
  });
});

/**
 * Reloj COMPLETO con segundos (builder-countdown-presencia F01/D3). Es la descomposición que alimenta a
 * las tres variantes de `urgencia_countdown`: `panel`/`tarjeta` la pintan como 4 bloques y `clasico` como
 * una línea (enmienda D2). Un solo helper puro ⇒ las variantes no pueden desincronizarse entre sí.
 */
describe("storefront/use-countdown — reloj completo (F01/D3)", () => {
  const T = { dias: 54, horas: 3, minutos: 12, segundos: 7, terminado: false } as const;

  // storefront.countdown.005 — 4 bloques FIJOS con sus labels: días sin pad ni tope, h/m/s a 2 dígitos.
  it("bloquesReloj da 4 bloques con h/m/s a dos dígitos y los días sin pad", () => {
    expect(bloquesReloj(T)).toEqual([
      { clave: "dias", valor: "54", label: "Días" },
      { clave: "horas", valor: "03", label: "Horas" },
      { clave: "minutos", valor: "12", label: "Min" },
      { clave: "segundos", valor: "07", label: "Seg" },
    ]);
  });

  // storefront.countdown.006 — los 4 bloques SIEMPRE están, aunque den 0 (estabilidad de layout, CLS 0),
  // y los días no se topean a 2 dígitos (un sorteo puede cerrar a más de 99 días).
  it("los 4 bloques siempre están (0 días incluido) y los días no se topean", () => {
    const cero = bloquesReloj({ dias: 0, horas: 0, minutos: 0, segundos: 9, terminado: false });
    expect(cero.map((b) => b.valor)).toEqual(["0", "00", "00", "09"]);

    const largo = bloquesReloj({ dias: 365, horas: 23, minutos: 59, segundos: 59, terminado: false });
    expect(largo[0]!.valor).toBe("365");
  });

  // storefront.countdown.007 — la LÍNEA de `clasico` (enmienda D2) es la misma descomposición en una sola
  // línea: mismo pad, mismos 4 valores. Terminado ⇒ "Cerrado" (nunca un reloj congelado en ceros).
  it("formatoRelojLinea arma la línea de clasico con los MISMOS valores de los bloques", () => {
    expect(formatoRelojLinea(T)).toBe("54d 03h 12m 07s");
    // Atadura explícita: la línea se DERIVA de los bloques (si alguien cambia el pad de un lado, cae).
    expect(formatoRelojLinea(T)).toBe(
      bloquesReloj(T)
        .map((b, i) => `${b.valor}${["d", "h", "m", "s"][i]!}`)
        .join(" "),
    );
    expect(
      formatoRelojLinea({ dias: 0, horas: 0, minutos: 0, segundos: 0, terminado: true }),
    ).toBe("Cerrado");
  });

  // storefront.countdown.008 — GUARD de la enmienda D2: `formatoCompacto` (chip del header y countdown del
  // `aviso_barra`) NO se movió. El formato nuevo vive aparte; el compacto sigue eligiendo 2 unidades.
  it("formatoCompacto sigue intacto: el formato nuevo no lo tocó", () => {
    expect(formatoCompacto(T)).toBe("54d 03h");
    expect(formatoCompacto(T)).not.toBe(formatoRelojLinea(T));
  });
});
