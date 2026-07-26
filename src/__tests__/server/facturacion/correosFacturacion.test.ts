import { describe, expect, it } from "vitest";

import { correosDeLaNotificacion } from "~/server/domain/facturacion/_correosFacturacion";
import { armarCorreoFacturacion } from "~/server/domain/correo/plantillasFacturacion";

/**
 * Los 4 correos de facturación que dispara el webhook (F04, D10 1-4), receptor SOLO el Pagador.
 *
 * Dos núcleos PUROS separados a propósito: `correosDeLaNotificacion` decide QUÉ correos amerita una
 * notificación (la parte que tiene que ser idempotente: un replay no dispara nada), y
 * `armarCorreoFacturacion` los REDACTA. Ninguno toca DB, red ni `env`.
 */

const SIN_TRANSICION = {
  invoices: [],
  estadoAntes: "AL_DIA" as const,
  estadoDespues: "AL_DIA" as const,
  cambioEstado: false,
};

describe("domain/facturacion/_correosFacturacion — qué correos amerita la notificación", () => {
  // facturacion.correos.001 — cobro del mes: comprobante
  it("un invoice que pasa a PAGADA dispara el comprobante de pago", () => {
    const correos = correosDeLaNotificacion({
      ...SIN_TRANSICION,
      invoices: [{ flowInvoiceId: "inv-1", despues: "PAGADA", transiciono: true }],
    });

    expect(correos).toEqual([
      { tipo: "COMPROBANTE_PAGO", flowInvoiceId: "inv-1" },
    ]);
  });

  // facturacion.correos.002 — idempotencia: el replay NO reenvía nada
  it("un invoice que ya estaba PAGADA no dispara ningún correo (replay del webhook)", () => {
    const correos = correosDeLaNotificacion({
      ...SIN_TRANSICION,
      invoices: [{ flowInvoiceId: "inv-1", despues: "PAGADA", transiciono: false }],
    });

    expect(correos).toEqual([]);
  });

  // facturacion.correos.003 — cobro fallido: aviso con el link de pago
  it("un invoice que pasa a FALLIDA dispara el correo de cobro fallido", () => {
    const correos = correosDeLaNotificacion({
      invoices: [{ flowInvoiceId: "inv-2", despues: "FALLIDA", transiciono: true }],
      estadoAntes: "AL_DIA",
      estadoDespues: "COBRO_PENDIENTE",
      cambioEstado: true,
    });

    expect(correos).toEqual([{ tipo: "COBRO_FALLIDO", flowInvoiceId: "inv-2" }]);
  });

  // facturacion.correos.004 — dunning agotado: la tienda queda en pausa
  it("la suscripción que entra en EN_PAUSA_POR_PAGO dispara el correo de tienda en pausa", () => {
    const correos = correosDeLaNotificacion({
      invoices: [{ flowInvoiceId: "inv-2", despues: "VENCIDA", transiciono: true }],
      estadoAntes: "COBRO_PENDIENTE",
      estadoDespues: "EN_PAUSA_POR_PAGO",
      cambioEstado: true,
    });

    expect(correos).toEqual([{ tipo: "TIENDA_EN_PAUSA" }]);
  });

  // facturacion.correos.005 — ya estaba en pausa: no se repite el aviso
  it("una suscripción que sigue EN_PAUSA_POR_PAGO no repite el aviso", () => {
    const correos = correosDeLaNotificacion({
      invoices: [{ flowInvoiceId: "inv-2", despues: "VENCIDA", transiciono: false }],
      estadoAntes: "EN_PAUSA_POR_PAGO",
      estadoDespues: "EN_PAUSA_POR_PAGO",
      cambioEstado: false,
    });

    expect(correos).toEqual([]);
  });

  // facturacion.correos.006 — pago posterior: comprobante + regularizada
  it("el pago que saca a la tienda de la pausa dispara comprobante Y regularizada", () => {
    const correos = correosDeLaNotificacion({
      invoices: [{ flowInvoiceId: "inv-2", despues: "PAGADA", transiciono: true }],
      estadoAntes: "EN_PAUSA_POR_PAGO",
      estadoDespues: "AL_DIA",
      cambioEstado: true,
    });

    expect(correos).toEqual([
      { tipo: "COMPROBANTE_PAGO", flowInvoiceId: "inv-2" },
      { tipo: "TIENDA_REGULARIZADA" },
    ]);
  });

  // facturacion.correos.007 — salir de COBRO_PENDIENTE también es regularizarse
  it("volver a AL_DIA desde COBRO_PENDIENTE dispara el correo de regularizada", () => {
    const correos = correosDeLaNotificacion({
      invoices: [],
      estadoAntes: "COBRO_PENDIENTE",
      estadoDespues: "AL_DIA",
      cambioEstado: true,
    });

    expect(correos).toEqual([{ tipo: "TIENDA_REGULARIZADA" }]);
  });

  // facturacion.correos.008 — un invoice nuevo sin cobrar todavía no es noticia
  it("un invoice recién espejado en PENDIENTE no dispara correo", () => {
    const correos = correosDeLaNotificacion({
      ...SIN_TRANSICION,
      invoices: [{ flowInvoiceId: "inv-3", despues: "PENDIENTE", transiciono: true }],
    });

    expect(correos).toEqual([]);
  });

  // facturacion.correos.016 — el guard de concurrencia manda sobre el estado alcanzado
  it("no repite los avisos de la tienda si el cambio de estado lo ganó OTRA corrida", () => {
    // Dos notificaciones simultáneas pueden derivar las dos el mismo estado; solo la que ganó el
    // `updateMany` condicional trae `cambioEstado: true`, y solo esa avisa.
    expect(
      correosDeLaNotificacion({
        invoices: [],
        estadoAntes: "EN_PAUSA_POR_PAGO",
        estadoDespues: "AL_DIA",
        cambioEstado: false,
      }),
    ).toEqual([]);
    expect(
      correosDeLaNotificacion({
        invoices: [],
        estadoAntes: "COBRO_PENDIENTE",
        estadoDespues: "EN_PAUSA_POR_PAGO",
        cambioEstado: false,
      }),
    ).toEqual([]);
  });

  // facturacion.correos.009 — cancelar NO es un correo del webhook (es de F06)
  it("la transición a CANCELADA no dispara ninguno de los 4 correos del webhook", () => {
    const correos = correosDeLaNotificacion({
      invoices: [{ flowInvoiceId: "inv-4", despues: "ANULADA", transiciono: true }],
      estadoAntes: "AL_DIA",
      estadoDespues: "CANCELADA",
      cambioEstado: true,
    });

    expect(correos).toEqual([]);
  });
});

describe("domain/correo/plantillasFacturacion — redacción de los 4 correos", () => {
  const base = { nombreTienda: "Tienda de Ana", montoBruto: "25000" };

  // facturacion.correos.010 — el comprobante lleva el monto formateado en CLP
  it("el comprobante nombra la tienda y el monto en CLP", () => {
    const c = armarCorreoFacturacion({ ...base, tipo: "COMPROBANTE_PAGO" });

    expect(c.subject).toContain("Tienda de Ana");
    expect(c.text).toContain("$25.000");
    expect(c.html).toContain("$25.000");
    // Remitente de PLATAFORMA: acá Sortéatelo le cobra al Organizador, no vende en nombre de nadie.
    expect(c.from).toContain("Sortéatelo");
    expect(c.from).toContain("no-reply@sorteatelo.cl");
  });

  // facturacion.correos.011 — el cobro fallido lleva el paymentLink y el próximo intento
  it("el cobro fallido incluye el link de pago y la fecha del próximo intento", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "COBRO_FALLIDO",
      paymentLink: "https://flow.cl/pagar/abc",
      proximoIntentoAt: new Date("2026-08-05T12:00:00Z"),
    });

    expect(c.text).toContain("https://flow.cl/pagar/abc");
    expect(c.html).toContain("https://flow.cl/pagar/abc");
    expect(c.text).toMatch(/ago/i); // la fecha del próximo intento, formateada es-CL
  });

  // facturacion.correos.012 — en pausa: dice que lo ya vendido sigue vivo (I5)
  it("el correo de tienda en pausa aclara que las compras ya hechas siguen vigentes", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "TIENDA_EN_PAUSA",
      paymentLink: "https://flow.cl/pagar/abc",
    });

    expect(c.subject.toLowerCase()).toContain("pausa");
    expect(c.text.toLowerCase()).toContain("descarga");
    expect(c.text).toContain("https://flow.cl/pagar/abc");
  });

  // facturacion.correos.013 — regularizada
  it("el correo de regularizada confirma que la tienda vuelve a vender", () => {
    const c = armarCorreoFacturacion({ ...base, tipo: "TIENDA_REGULARIZADA" });

    expect(c.subject).toContain("Tienda de Ana");
    expect(c.text.toLowerCase()).toContain("al día");
  });

  // facturacion.correos.014 — sin paymentLink el correo sigue siendo enviable
  it("sin paymentLink el correo no muestra un enlace roto", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "COBRO_FALLIDO",
      paymentLink: null,
    });

    expect(c.text).not.toContain("null");
    expect(c.text).not.toContain("undefined");
    expect(c.html).not.toContain('href=""');
  });

  // facturacion.correos.015 — anti header-injection en el nombre de la Tienda
  it("sanea el nombre de la Tienda en las cabeceras y lo escapa en el HTML", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "COMPROBANTE_PAGO",
      nombreTienda: 'Ana\r\nBcc: otro@x.cl <script>alert("x")</script>',
    });

    expect(c.subject).not.toContain("\n");
    expect(c.subject).not.toContain("\r");
    expect(c.from).not.toContain("\n");
    expect(c.html).not.toContain("<script>");
  });

  // facturacion.correos.017 — (5) cancelación: la fecha hasta la que vende es el dato del correo
  it("la cancelación dice hasta cuándo vende la tienda y que no se borra nada", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "CANCELACION_CONFIRMADA",
      cancelacionEfectivaAt: new Date("2026-08-26T12:00:00Z"),
    });

    expect(c.subject).toContain("Tienda de Ana");
    expect(c.text).toMatch(/ago/i); // la fecha de término, formateada es-CL
    expect(c.text.toLowerCase()).toContain("no se borra nada");
    // Sin este cierre, «cancelamos tu plan» se lee como «perdiste tu tienda».
    expect(c.text.toLowerCase()).toContain("descarga");
    expect(c.from).toContain("Sortéatelo");
  });

  // facturacion.correos.018 — sin fecha (Flow no reportó el período) no se inventa un día
  it("la cancelación sin fecha de término no imprime un hueco ni un día falso", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "CANCELACION_CONFIRMADA",
      cancelacionEfectivaAt: null,
    });

    expect(c.text).not.toContain("null");
    expect(c.text).not.toContain("undefined");
    expect(c.text).not.toContain("Invalid Date");
    // Dice lo que SÍ se sabe: que el período ya pagado se respeta.
    expect(c.text.toLowerCase()).toContain("período que ya está pagado");
  });

  // facturacion.correos.019 — (7) el aviso previo nombra el DÍA del cobro y el monto
  it("el aviso de renovación dice qué día y cuánto se cobra, sin decir «mañana»", () => {
    const c = armarCorreoFacturacion({
      ...base,
      tipo: "RENOVACION_PROXIMA",
      proximoCobroAt: new Date("2026-08-12T04:00:00Z"),
    });

    expect(c.text).toContain("$25.000");
    expect(c.text).toMatch(/ago/i); // la fecha, formateada es-CL
    // La ventana de aviso es de 2 días (el cron de Vercel puede saltarse una corrida), así que un
    // «mañana» literal sería falso la mitad de las veces. El día explícito es verdadero siempre.
    expect(c.text.toLowerCase()).not.toContain("mañana");
    // Un aviso previo NO es una factura ni un problema: tiene que dejar claro que no hay que hacer
    // nada, y ofrecer la salida (cancelar) antes de la fecha.
    expect(c.text.toLowerCase()).toContain("no tienes que hacer nada");
    expect(c.text.toLowerCase()).toContain("cancelar el plan");
  });

  // facturacion.correos.020 — (6) la cortesía por vencer no cotiza un precio que puede ser otro
  it("el aviso de fin de cortesía nombra el día y manda al panel sin inventar el precio", () => {
    const c = armarCorreoFacturacion({
      nombreTienda: "Tienda de Ana",
      tipo: "EXENCION_POR_VENCER",
      exentaHasta: new Date("2026-08-15T00:00:00Z"),
    });

    expect(c.subject).toContain("Tienda de Ana");
    expect(c.text).toMatch(/ago/i);
    // El precio depende del Pagador (mitad de precio desde la 2ª tienda, D1) y esta Tienda puede no
    // tener ninguno: imprimir un monto acá le mostraría el número equivocado justo a quien pagaría
    // la mitad. El panel lo calcula server-side; el correo manda a mirarlo.
    expect(c.text).not.toContain("$");
    expect(c.text).toContain("«Plan»");
    // Lo que el Organizador necesita saber: qué se corta y qué NO se pierde.
    expect(c.text.toLowerCase()).toContain("descarga");
  });
});
