import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fechaDeFlow } from "~/server/domain/facturacion/_fechaFlow";

/**
 * Cómo se leen las fechas que manda Flow (F04/F09, hallazgo 8 de la lista «A verificar contra el
 * sandbox real»).
 *
 * Flow las manda **sin zona**: `"2026-08-26 00:00:00"` es medianoche **hora de Santiago**, que es
 * donde vive Flow. `new Date(...)` de un string así lo interpreta en la zona DEL PROCESO — y el
 * proceso, en producción, es Vercel: **UTC**. O sea que el mismo dato daba dos instantes distintos
 * según dónde corriera, con 3 o 4 horas de diferencia según el horario de verano. Como el panel
 * formatea en el navegador del Organizador (Chile), un `proximoCobroAt` guardado desde Vercel se
 * mostraba **un día antes** del cobro real.
 *
 * Por eso **estos tests fuerzan el proceso a UTC**: es la única forma de que se pongan rojos en una
 * máquina chilena, que es justamente donde el bug es invisible.
 */

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC"; // como Vercel
});
afterAll(() => {
  process.env.TZ = tzOriginal;
});

/** El reloj de pared que se ve en Chile para un instante dado. */
const enChile = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);

describe("facturacion/_fechaFlow — las fechas de Flow son hora de Chile", () => {
  // facturacion.fechaFlow.001 — el dato real del sandbox, en invierno (UTC-4)
  it("lee la medianoche de Santiago como tal, aunque el proceso corra en UTC", () => {
    const d = fechaDeFlow("2026-08-26 00:00:00")!;

    // Medianoche en Santiago (UTC-4 en agosto) es 04:00 UTC. Con la lectura vieja, corriendo en
    // Vercel, esto quedaba en 00:00Z — cuatro horas antes del cobro, y un día antes en pantalla.
    expect(d.toISOString()).toBe("2026-08-26T04:00:00.000Z");
    expect(enChile(d)).toBe("2026-08-26 00:00");
  });

  // facturacion.fechaFlow.002 — y en horario de verano el offset es otro: no se resta un fijo
  it("respeta el horario de verano de Chile en vez de restar un offset fijo", () => {
    const d = fechaDeFlow("2027-01-15 09:30:00")!;

    // No se asserta el instante UTC a mano a propósito: lo que importa es que el reloj de pared
    // chileno se conserve, sea la época del año que sea (Chile tiene DST, ADR del correo dixit).
    expect(enChile(d)).toBe("2027-01-15 09:30");
  });

  // facturacion.fechaFlow.006 — la medianoche que NO EXISTE, el día que Chile adelanta la hora
  it("no retrocede un día cuando la medianoche de Flow cae en el salto del horario de verano", () => {
    // Chile adelanta a las 24:00 del sábado, así que **`00:00` del primer domingo de septiembre no
    // existe** — y `00:00:00` es justamente el formato en que Flow manda `next_invoice_date`. Sin
    // guard, la corrección del offset caía en la hora anterior al salto y devolvía las 23:00 del día
    // ANTERIOR: el mismo error de un día que este módulo existe para matar, reaparecido en el borde.
    const d = fechaDeFlow("2026-09-06 00:00:00")!;

    // La primera hora que SÍ existe de ese día, no un instante cualquiera del día correcto: así una
    // «corrección» futura que devuelva otra cosa se pone roja.
    expect(enChile(d)).toBe("2026-09-06 01:00");
  });

  // facturacion.fechaFlow.007 — la hora que ocurre DOS veces, cuando Chile atrasa
  it("resuelve a la primera ocurrencia la hora repetida del fin del horario de verano", () => {
    // El sábado 4 de abril de 2026 Chile atrasa a las 24:00, así que las 23:00–23:59 de ese día
    // ocurren dos veces. La ambigüedad se resuelve hacia la PRIMERA (todavía en horario de verano):
    // determinista y del día calendario correcto, que es lo único que la pantalla necesita.
    const d = fechaDeFlow("2026-04-04 23:00:00")!;

    expect(enChile(d)).toBe("2026-04-04 23:00");
    expect(d.toISOString()).toBe("2026-04-05T02:00:00.000Z");
  });

  // facturacion.fechaFlow.003 — el formato de solo-día también es de Chile
  it("lee una fecha sin hora como el comienzo de ese día en Chile", () => {
    expect(enChile(fechaDeFlow("2026-08-26")!)).toBe("2026-08-26 00:00");
  });

  // facturacion.fechaFlow.004 — si Flow dijera la zona, se le cree
  it("respeta una fecha que ya viene con zona explícita", () => {
    expect(fechaDeFlow("2026-08-26T12:00:00Z")!.toISOString()).toBe(
      "2026-08-26T12:00:00.000Z",
    );
  });

  // facturacion.fechaFlow.005 — lo ausente o impresentable no se inventa
  it("devuelve null ante fechas ausentes o inservibles", () => {
    for (const v of [null, undefined, "", "   ", "no-es-una-fecha"]) {
      expect(fechaDeFlow(v)).toBeNull();
    }
  });
});
