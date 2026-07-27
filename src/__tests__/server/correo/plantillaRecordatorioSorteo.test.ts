import { describe, expect, it } from "vitest";

import { armarCorreoRecordatorioSorteo } from "~/server/domain/correo/plantillaRecordatorioSorteo";
import {
  MAX_RECORDATORIOS_POR_SORTEO,
  OFFSETS_RECORDATORIO,
  ventanasDeRecordatorio,
} from "~/server/domain/correo/ventanasDeRecordatorio";

/**
 * Tests PUROS de los recordatorios (F06/C2-C3/D3): las ventanas de vencimiento y la plantilla. Sin
 * `db`, sin red — la parte DB-backed (planificador + resolvedor) vive en
 * `recordatoriosDelSorteo.test.ts`.
 */

const AHORA = new Date("2026-08-01T12:00:00.000Z");
const HORA = 60 * 60 * 1000;
/** Cierre del sorteo del fixture, elegido para que la hora de Chile no sea ambigua. */
const CIERRE = new Date("2026-08-30T21:00:00.000Z");

/** ¿Qué offsets vencen para un sorteo que cierra dentro de `horas`? */
function offsetsVencidos(horas: number): number[] {
  const fechaFin = new Date(AHORA.getTime() + horas * HORA);
  return ventanasDeRecordatorio(AHORA)
    .filter((v) => fechaFin > v.desde && fechaFin <= v.hasta)
    .map((v) => v.offsetHoras);
}

describe("domain/correo/ventanasDeRecordatorio — cuándo vence cada recordatorio (T1/D3)", () => {
  // correo.ventana.001 — la ventana NOMINAL que fija el plan: el T-48h vence cuando al sorteo le
  // faltan entre 48 y 49 horas, y el T-6h entre 6 y 7. Es la corrida del cron de esa hora.
  it("vence el T-48h en [48,49) horas y el T-6h en [6,7)", () => {
    expect(offsetsVencidos(48.5)).toEqual([48]);
    expect(offsetsVencidos(6.5)).toEqual([6]);
  });

  // correo.ventana.002 — un sorteo lejos todavía no dispara nada. Sin esto, el recordatorio saldría
  // apenas se crea el sorteo y dejaría de ser un recordatorio.
  it("un sorteo a más de 49 horas no vence ningún recordatorio", () => {
    expect(offsetsVencidos(50)).toEqual([]);
    expect(offsetsVencidos(24 * 7)).toEqual([]);
  });

  // correo.ventana.003 — **la propiedad que hace al job reconciliation-based**: si el cron se salta
  // la corrida nominal, el recordatorio SIGUE vencido en las siguientes. Sin esto, una corrida
  // perdida —que Vercel Cron admite explícitamente— perdería el correo para siempre.
  it("una corrida perdida no pierde el recordatorio: sigue vencido después", () => {
    // El sorteo cruzó las 48 h hace rato y nadie mandó nada: el T-48h sigue debiéndose.
    for (const horas of [47, 30, 12, 8]) {
      expect(offsetsVencidos(horas)).toEqual([48]);
    }
    // Y el T-6h se sigue debiendo hasta el cierre.
    for (const horas of [5, 1, 0.1]) {
      expect(offsetsVencidos(horas)).toEqual([6]);
    }
  });

  // correo.ventana.004 — los tramos son CONTIGUOS y no se pisan. Con tramos solapados, un sorteo a
  // 6,5 h de cerrar que nunca recibió el T-48h se llevaría DOS correos en la misma corrida.
  it("ningún sorteo cae en dos tramos a la vez", () => {
    for (const horas of [0.5, 3, 6.5, 7, 7.5, 20, 47, 48.5, 49, 60]) {
      expect(offsetsVencidos(horas).length).toBeLessThanOrEqual(1);
    }
  });

  // correo.ventana.005 — un sorteo cuyo cierre YA pasó no recibe nada. Mandar «cierra pronto» de
  // algo cerrado es peor que no mandar nada, y además es lo que impide que un sorteo ACTIVO
  // olvidado por el Organizador genere correos para siempre.
  it("un sorteo cuyo cierre ya pasó no vence ningún recordatorio", () => {
    expect(offsetsVencidos(0)).toEqual([]);
    expect(offsetsVencidos(-1)).toEqual([]);
  });

  // correo.ventana.006 — el techo de recordatorios por sorteo por comprador se cumple POR
  // CONSTRUCCIÓN: hay N offsets, la clave del ledger lleva el offset y el `@@unique` hace el resto.
  // Este test es el que se pone rojo si alguien agrega un cuarto offset sin pensarlo.
  it("hay a lo sumo MAX_RECORDATORIOS_POR_SORTEO offsets distintos", () => {
    expect(OFFSETS_RECORDATORIO.length).toBeLessThanOrEqual(
      MAX_RECORDATORIOS_POR_SORTEO,
    );
    expect(new Set(OFFSETS_RECORDATORIO).size).toBe(
      OFFSETS_RECORDATORIO.length,
    );
    // Descendente: cada tramo usa al siguiente como piso, así que el orden es load-bearing.
    expect([...OFFSETS_RECORDATORIO]).toEqual(
      [...OFFSETS_RECORDATORIO].sort((a, b) => b - a),
    );
  });
});

const BASE = {
  nombreTienda: "ARMY Chile",
  colorPrimario: "#e11d48",
  identidadLegal: "Comercializadora Ana Pérez EIRL",
  sorteo: {
    nombre: "Photobook firmado",
    premio: "Un photobook firmado por el grupo",
    fechaFin: CIERRE,
    prefijoTicket: "ARMY",
    basesUrl: "https://pub.r2.dev/t/sorteo/bases.pdf",
  },
  numeros: [1043, 1044, 1045],
  urlTienda: "https://army.sorteatelo.cl/",
  urlBaja: "https://sorteatelo.cl/api/correo/baja/tok3n",
};

describe("domain/correo/plantillaRecordatorioSorteo — C2/C3 (D3)", () => {
  // correo.recordatorio.001 — lo que los DOS comparten: sorteo NOMBRADO (I10), cierre en hora de
  // Chile con la zona dicha (I7) y los números propios como boletos con el prefijo del tenant (D12).
  it("nombra el sorteo, dice el cierre en hora de Chile y muestra los números propios", () => {
    for (const offsetHoras of [48, 6]) {
      const { text, html, subject } = armarCorreoRecordatorioSorteo({
        ...BASE,
        offsetHoras,
      });

      expect(subject).toContain("Photobook firmado");
      for (const cuerpo of [text, html]) {
        expect(cuerpo).toContain("Photobook firmado");
        expect(cuerpo).toContain("hora de Chile");
        // Prefijo por BLOQUE y guion medio U+2013 en el rango: el MISMO texto que el panel.
        expect(cuerpo).toContain("ARMY-1043–1045");
      }
    }
  });

  // correo.recordatorio.002 — D3: el T-48h es INFORMATIVO. No empuja a comprar; a dos días, apurar
  // a alguien es ruido. El T-6h sí lleva el CTA con el enlace a la Tienda.
  it("el T-48h no lleva CTA de compra y el T-6h sí", () => {
    const informativo = armarCorreoRecordatorioSorteo({
      ...BASE,
      offsetHoras: 48,
    });
    const conCta = armarCorreoRecordatorioSorteo({ ...BASE, offsetHoras: 6 });

    expect(informativo.text).not.toContain(BASE.urlTienda);
    expect(informativo.html).not.toContain(BASE.urlTienda);
    expect(conCta.text).toContain(BASE.urlTienda);
    expect(conCta.html).toContain(BASE.urlTienda);
    expect(conCta.subject).toContain("Últimas horas");
  });

  // correo.recordatorio.003 — **el copy no puede prometer una cuenta regresiva**. El job es
  // reconciliation-based: si el cron se saltó una corrida, el T-48h puede salir a 30 h del cierre y
  // un «faltan 48 horas» llegaría mintiendo. Se dice la fecha, que es verdad siempre.
  it("no afirma cuántas horas faltan (el correo puede salir en una corrida de recuperación)", () => {
    for (const offsetHoras of [48, 6]) {
      const { text, html, subject } = armarCorreoRecordatorioSorteo({
        ...BASE,
        offsetHoras,
      });
      for (const cuerpo of [text, html, subject]) {
        expect(cuerpo).not.toMatch(/48\s*horas/i);
        expect(cuerpo).not.toMatch(/6\s*horas/i);
        expect(cuerpo).not.toMatch(/quedan?\s+\d/i);
      }
    }
  });

  // correo.recordatorio.004 — I5: es el ÚNICO correo del sistema con opt-out, y lo lleva por los
  // DOS caminos. Las cabeceras RFC 8058 (el botón nativo del buzón) y el enlace visible del pie:
  // hay clientes que no muestran el botón, y no encontrar cómo darse de baja termina en «spam».
  it("lleva las cabeceras RFC 8058 y el enlace de baja visible en el cuerpo", () => {
    const { headers, text, html } = armarCorreoRecordatorioSorteo({
      ...BASE,
      offsetHoras: 6,
    });

    expect(headers["List-Unsubscribe"]).toBe(`<${BASE.urlBaja}>`);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(text).toContain(BASE.urlBaja);
    expect(html).toContain(BASE.urlBaja);
  });

  // correo.recordatorio.005 — sale por el buzón de la clase `avisos` (D2): hoy es el mismo dominio
  // que el transaccional, pero la elección la hace la CLASE y no un literal. El día que se contrate
  // Resend Pro, estos correos se mudan de subdominio sin tocar la plantilla.
  it("el From sale del remitente de avisos y nombra a la Tienda", () => {
    const { from } = armarCorreoRecordatorioSorteo({ ...BASE, offsetHoras: 48 });

    expect(from).toBe("ARMY Chile · vía Sortéatelo <no-reply@sorteatelo.cl>");
    // Una sola dirección en la cabecera (el saneo del display name sigue puesto).
    expect(from.match(/</g)).toHaveLength(1);
  });

  // correo.recordatorio.006 — degradación §5.2: sin premio, sin bases, sin números y sin identidad
  // legal el correo sale ENTERO y sin rótulos huérfanos. El caso real es el comprador cuyos tickets
  // fueron arrastrados a otro sorteo — tiene consentimiento pero no números acá.
  it("degrada sin premio, sin bases y sin números, sin dejar rótulos vacíos", () => {
    const { text, html } = armarCorreoRecordatorioSorteo({
      nombreTienda: "ARMY Chile",
      sorteo: {
        nombre: "Photobook firmado",
        premio: "",
        fechaFin: CIERRE,
        prefijoTicket: null,
        basesUrl: null,
      },
      numeros: [],
      offsetHoras: 48,
      urlTienda: BASE.urlTienda,
      urlBaja: BASE.urlBaja,
    });

    for (const cuerpo of [text, html]) {
      expect(cuerpo).not.toContain("undefined");
      expect(cuerpo).not.toContain("NaN");
      expect(cuerpo).not.toContain("TUS NÚMEROS");
      expect(cuerpo).not.toContain("Bases del sorteo");
      // El cierre —lo único que este correo existe para decir— sigue estando.
      expect(cuerpo).toContain("hora de Chile");
    }
  });

  // correo.recordatorio.007 — el nombre y el premio del sorteo los escribe el Organizador y acá van
  // al ASUNTO, o sea a una CABECERA: un `\r\n` ahí es una cabecera inyectada, no un renglón. Es
  // exactamente el agujero que el TDD de F04 destapó en el correo de resultado.
  it("no deja inyectar cabeceras ni HTML por el nombre ni el premio del sorteo", () => {
    const { subject, html } = armarCorreoRecordatorioSorteo({
      ...BASE,
      sorteo: {
        ...BASE.sorteo,
        nombre: "Sorteo\r\nBcc: victima@x.cl",
        premio: "Premio <img src=x onerror=alert(1)>",
      },
      offsetHoras: 6,
    });

    expect(subject).not.toContain("\r");
    expect(subject).not.toContain("\n");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
