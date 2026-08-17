import { describe, expect, it } from "vitest";

import {
  construirFrom,
  MARCA_PLATAFORMA,
  REMITENTE_CORREO,
} from "~/server/domain/correo/layoutCorreo";
import { armarCorreoConfirmacionCompra } from "~/server/domain/correo/plantillaConfirmacionCompra";

/**
 * Tests del helper PURO de plantilla del correo **C1 — confirmación de compra** (F03).
 *
 * Nació en F04 como el correo de descarga (`plantillaDescarga.ts`) y F03 lo hizo crecer: el mismo
 * correo post-pago confirma ahora la compra COMPLETA. Por eso este archivo tiene dos mitades:
 *
 * - `correo.template.001-008` — la herencia de F04/F07, migrada tal cual. Son la mitad **cero
 *   regresión**: lo que ya cumplía (un enlace por ítem, aviso sobre la vigencia de los enlaces,
 *   disclaimer ADR-0008, escapado/saneo, layout con branding del tenant) tiene que seguir
 *   cumpliéndolo. El único que cambió de CONTENIDO es el 001: con `entrega-postpago` D2 el aviso
 *   pasó de «vencen en 30 días» a «no vencen», y el prop `diasExpiracion` se fue del contrato.
 * - `correo.template.009+` — lo NUEVO de F03: números como boletos con prefijo, sorteo nombrado
 *   (I10), cierre en hora de Chile (I7), resumen de la orden en CLP y degradación sin tickets.
 */

/** Fecha de cierre del sorteo: 1 de marzo de 2026, 23:59 en Chile (marzo = horario de verano, -03). */
const CIERRE = new Date("2026-03-02T02:59:00Z");
/** Fecha de la compra: 10 de mayo de 2026, 14:30 en Chile (mayo = horario estándar, -04). */
const COMPRA = new Date("2026-05-10T18:30:00Z");

const ORDEN = {
  numeroDeOrden: "ord_abc123",
  fecha: COMPRA,
  totalClp: "15000.00",
  articulos: 3,
};

describe("domain/correo/plantillaConfirmacionCompra — construirFrom (D6)", () => {
  // correo.from.001 — remitente con nombre "Tienda · vía Sortéatelo <remitente>"
  it("arma el from con el nombre de la Tienda + marca de plataforma + remitente de prueba", () => {
    expect(construirFrom("Tienda ARMY", REMITENTE_CORREO)).toBe(
      `Tienda ARMY · vía ${MARCA_PLATAFORMA} <${REMITENTE_CORREO}>`,
    );
    expect(REMITENTE_CORREO).toBe("no-reply@sorteatelo.cl"); // dominio verificado en Resend (ADR-0014/0015)
  });
});

describe("domain/correo/plantillaConfirmacionCompra — sin sorteo (herencia F04/D5)", () => {
  const armado = armarCorreoConfirmacionCompra({
    nombreTienda: "Tienda ARMY",
    items: [
      { titulo: "Guía del bias", enlace: "https://app.test/entrega/tok-1" },
      { titulo: "Photobook", enlace: "https://app.test/entrega/tok-2" },
    ],
      orden: ORDEN,
  });

  // correo.template.001 — UN correo con un enlace por ítem, nombre de Tienda y aviso de acceso
  // permanente. El aviso cambió de signo con `entrega-postpago` D2: hasta entonces decía «vencen en
  // 30 días» (el TTL heredado de la era S3) y ahora el grant nace sin vencimiento, así que el correo
  // invita a GUARDARLO. Lo que se fija acá no es la frase sino que el correo **no le prometa al
  // Comprador un plazo que el código ya no impone** — una mentira en el único registro durable que
  // tiene de su compra (ADR-0004: sin cuentas de comprador, este correo ES el acceso).
  it("produce UN correo con from de la Tienda, un enlace por ítem, el nombre de la Tienda y el aviso de que los enlaces no vencen", () => {
    expect(armado.from).toContain("Tienda ARMY");
    expect(armado.subject).toContain("Tienda ARMY");

    // Un enlace por ítem, en texto y en HTML.
    for (const parte of [armado.text, armado.html]) {
      expect(parte).toContain("https://app.test/entrega/tok-1");
      expect(parte).toContain("https://app.test/entrega/tok-2");
      expect(parte).toContain("Guía del bias");
      expect(parte).toContain("Photobook");
      expect(parte).toContain("Tienda ARMY");
    }
    // El aviso dice la política vigente (D2): no vencen, y por eso vale la pena guardar el correo.
    for (const parte of [armado.text, armado.html]) {
      expect(parte).toContain("no vencen");
      // Y NUNCA un plazo: ni «vencen en N días» ni ninguna otra cuenta regresiva. Es la aserción
      // que impide que vuelva a colarse un número de días desde donde sea.
      expect(parte).not.toMatch(/vencen? en/i);
      expect(parte).not.toMatch(/\d+\s*d[ií]as/i);
      expect(parte.toLowerCase()).not.toContain("expira");
    }
    // Indicación de reenvío respondiendo el correo — sigue siendo cierta: el panel reenvía ESTOS
    // mismos enlaces (desde D2 el reenvío ya no regenera tokens).
    expect(armado.text.toLowerCase()).toContain("responde este correo");
  });

  // correo.template.002 — disclaimer de responsabilidad (ADR-0008/0010)
  it("incluye el disclaimer: el Comprador le compró a la Tienda (responsable), la Plataforma solo da la infraestructura", () => {
    for (const parte of [armado.text, armado.html]) {
      expect(parte).toContain("Tienda ARMY");
      expect(parte.toLowerCase()).toContain("responsable de la venta");
      expect(parte).toContain(MARCA_PLATAFORMA);
      expect(parte.toLowerCase()).toContain("infraestructura técnica");
    }
  });

  // correo.template.003 — jamás expone una key del bucket de NINGÚN tipo (solo enlaces por token).
  // Extendido por productos-tipos-digitales F03: antes solo vigilaba `.pdf`; ahora cubre las 9
  // extensiones de la allowlist (D1), porque el archivo del producto ya no es siempre un PDF y una
  // fuga de key sería igual de grave con un MP3 o un ZIP (I2/ADR-0002).
  it("nunca incluye una key del bucket de ningún tipo: solo los enlaces /entrega/<token>", () => {
    // Si por error el use case pasara una key del bucket como enlace, este helper no la inventa:
    // acá probamos que el helper solo renderiza lo que recibe y no agrega paths internos.
    const salida = armado.text + armado.html;
    const extensiones = [
      "pdf",
      "epub",
      "png",
      "jpg",
      "webp",
      "mp3",
      "m4a",
      "wav",
      "zip",
    ];
    for (const ext of extensiones) {
      expect(salida, ext).not.toContain(`.${ext}`);
      // patrón de key `<tenantId>/<productId>[/<ref>].<ext>` (legacy y nueva)
      expect(salida, ext).not.toMatch(
        new RegExp(`[a-z0-9]+\\/[a-z0-9]+(\\/[a-z0-9]+)?\\.${ext}`, "i"),
      );
    }
  });

  // correo.template.004 — texto plano SIEMPRE presente (entregabilidad) + HTML no vacío
  it("siempre trae texto plano y HTML no vacíos", () => {
    expect(armado.text.length).toBeGreaterThan(0);
    expect(armado.html).toContain("<");
    expect(armado.html).toContain("</a>"); // los enlaces son <a href>
  });

  // correo.template.005 — escapa HTML en datos del tenant/producto (anti-inyección)
  it("escapa caracteres HTML en el título del producto y el nombre de la Tienda", () => {
    const conHtml = armarCorreoConfirmacionCompra({
      nombreTienda: "Tienda <b>ARMY</b>",
      items: [
        { titulo: 'Guía "premium" <script>', enlace: "https://app.test/entrega/x" },
      ],
      orden: ORDEN,
    });
    // En el HTML los caracteres peligrosos quedan escapados (no como tags reales).
    expect(conHtml.html).not.toContain("<script>");
    expect(conHtml.html).toContain("&lt;script&gt;");
    expect(conHtml.html).toContain("Tienda &lt;b&gt;ARMY&lt;/b&gt;");
  });

  // correo.template.007 — F07/D9: la plantilla ya no arma un correo suelto, sale ENVUELTA en el
  // layout compartido. Lo que se verifica es lo observable del chrome, no cómo se compone por
  // dentro: si mañana el layout cambia de gramática, este test sigue valiendo.
  // **Actualizado por D9-rev**: las aserciones de paleta El Talonario en el cuerpo se fueron con el
  // rework (el correo se tematiza con la marca de la TIENDA). Este `armado` no trae branding, así
  // que lo que queda fijado acá es la degradación a los tonos de plataforma.
  it("sale envuelta en el layout: chrome de plataforma, tonos base y tablas", () => {
    expect(armado.html).toContain(`vía ${MARCA_PLATAFORMA}`);
    expect(armado.html).toContain('role="presentation"');
    expect(armado.html).toContain("#2b3fbf"); // sin color del tenant ⇒ primario de plataforma
    expect(armado.html).toContain("#ffc530"); // amarillo del wordmark, en el pie
    // El texto plano también viaja con el chrome (hay clientes que solo muestran esto).
    expect(armado.text).toContain(`vía ${MARCA_PLATAFORMA}`);
    // Y sigue SIN sección de sorteo: este correo no habla de uno (degradación elegante, I10).
    expect(armado.html).not.toContain("SORTEO");
  });

  // correo.template.008 — D9-rev: la plantilla TRANSPORTA el branding del tenant al layout. Es lo
  // que hace que el correo real de una Tienda con marca configurada salga con su logo y su color y
  // no con los de la plataforma; sin este paso el rework quedaba solo en el layout, invisible.
  it("pasa el logo y el color de la Tienda al layout", () => {
    const conMarca = armarCorreoConfirmacionCompra({
      nombreTienda: "Tienda ARMY",
      logoUrl: "https://pub.r2.dev/ten1/branding/logo?v=3",
      colorPrimario: "#e11d48",
      items: [{ titulo: "P", enlace: "https://app.test/entrega/x" }],
      orden: ORDEN,
    });
    expect(conMarca.html).toContain('src="https://pub.r2.dev/ten1/branding/logo?v=3"');
    expect(conMarca.html).toContain("background-color:#e11d48");
    // El cuerpo deja de estar tematizado con la plataforma: hasta los enlaces son de la Tienda.
    expect(conMarca.html).not.toContain("#2b3fbf");
  });

  // correo.template.006 — el nombre de la Tienda se sanea en las cabeceras from/subject (anti header-injection)
  it("saca saltos de línea/control del nombre de la Tienda en el from y el subject (cabeceras)", () => {
    const conCrlf = armarCorreoConfirmacionCompra({
      nombreTienda: "Malo\r\nBcc: victima@x.cl",
      items: [{ titulo: "P", enlace: "https://app.test/entrega/x" }],
      orden: ORDEN,
    });
    // Ni el from ni el subject conservan CR/LF (una cabecera con salto de línea es inyección).
    expect(conCrlf.from).not.toMatch(/[\r\n]/);
    expect(conCrlf.subject).not.toMatch(/[\r\n]/);
    // El from queda como una sola línea válida (nombre colapsado + marca + remitente).
    expect(conCrlf.from).toContain(`vía ${MARCA_PLATAFORMA} <${REMITENTE_CORREO}>`);
    // Nombre vacío tras sanear ⇒ cae a la marca (nunca un from sin nombre).
    const vacio = armarCorreoConfirmacionCompra({
      nombreTienda: "   ",
      items: [{ titulo: "P", enlace: "https://app.test/entrega/x" }],
      orden: ORDEN,
    });
    expect(vacio.from.startsWith(`${MARCA_PLATAFORMA} · vía`)).toBe(true);
  });
});

describe("domain/correo/plantillaConfirmacionCompra — con sorteo (F03/C1)", () => {
  const conSorteo = armarCorreoConfirmacionCompra({
    nombreTienda: "Tienda ARMY",
    items: [{ titulo: "Guía del bias", enlace: "https://app.test/entrega/tok-1" }],
      orden: ORDEN,
    sorteo: {
      nombre: "Sorteo Photocard Firmada",
      fechaFin: CIERRE,
      numeros: [1043, 1044, 1045],
      prefijoTicket: "ARMY",
      basesUrl: "https://pub.r2.dev/ten1/sorteo/raf1/bases?v=2",
    },
  });

  // correo.template.009 — el corazón de C1: los números (con prefijo D12), el sorteo NOMBRADO (I10)
  // y el cierre en hora de Chile (I7). Es lo que la landing promete y ninguna superficie mostraba.
  it("muestra los números con el prefijo de la Tienda, nombra el sorteo y da el cierre en hora de Chile", () => {
    for (const parte of [conSorteo.text, conSorteo.html]) {
      // El rango con prefijo por BLOQUE (D12): `ARMY-1043–1045`, nunca `ARMY-1043–ARMY-1045`.
      expect(parte).toContain("ARMY-1043–1045");
      // I10: el sorteo se NOMBRA. Una Tienda tiene n sorteos y el Comprador no adivina cuál.
      expect(parte).toContain("Sorteo Photocard Firmada");
      // I7: el cierre en hora de Chile, con la zona dicha en voz alta.
      expect(parte).toContain("1 de marzo de 2026");
      expect(parte).toContain("23:59");
      expect(parte).toContain("hora de Chile");
    }
    // El asunto anuncia los números: es lo primero que ve el Comprador en la bandeja.
    expect(conSorteo.subject.toLowerCase()).toContain("números");
  });

  // correo.template.010 — guard contra el modo de falla propio de armar HTML por concatenación:
  // un token de estilo mal escrito no explota, se interpola como `color:undefined` y el cliente de
  // correo lo descarta EN SILENCIO. No hay aserción de contenido que lo pille (el texto igual está,
  // solo que sin color), y `tsc` sí lo ve pero un `as const` mal puesto lo taparía. Es barato y
  // cubre las ~40 interpolaciones del cuerpo de una sola vez.
  it("no interpola `undefined`/`NaN` en ninguna parte del correo", () => {
    for (const parte of [conSorteo.subject, conSorteo.text, conSorteo.html]) {
      expect(parte).not.toContain("undefined");
      expect(parte).not.toContain("NaN");
    }
  });

  // correo.template.012 — el resumen de la orden: lo que el Comprador CITA cuando escribe. El total
  // se formatea con `Intl` desde el string `Decimal` del server (CLAUDE.md § Regla de oro: jamás
  // aritmética con `number`; acá la plantilla solo formatea).
  it("incluye el resumen de la orden con el total en CLP formateado", () => {
    for (const parte of [conSorteo.text, conSorteo.html]) {
      expect(parte).toContain("ord_abc123");
      expect(parte).toContain("10 de mayo de 2026"); // fecha de compra, también en hora de Chile
      expect(parte).toContain("$15.000"); // 15000.00 → CLP sin decimales
    }
  });

  // correo.template.011 — degradación limpia (§5.2): una orden sin tickets recibe el MISMO correo
  // SIN sección de sorteo. Ni rótulo vacío, ni «tus números: —», ni un sorteo inventado. Se prueban
  // los DOS caminos por los que se llega ahí, porque son distintos: la Tienda no tenía sorteo ACTIVO
  // al pagar (sin `sorteo`) y el producto comprado no participaba (sorteo sí, `numeros` vacío).
  it("una orden sin tickets sale sin sección de sorteo, por cualquiera de los dos caminos", () => {
    const sinSorteo = armarCorreoConfirmacionCompra({
      nombreTienda: "Tienda ARMY",
      items: [{ titulo: "P", enlace: "https://app.test/entrega/x" }],
      orden: ORDEN,
    });
    const sorteoSinNumeros = armarCorreoConfirmacionCompra({
      nombreTienda: "Tienda ARMY",
      items: [{ titulo: "P", enlace: "https://app.test/entrega/x" }],
      orden: ORDEN,
      sorteo: {
        nombre: "Sorteo Photocard Firmada",
        fechaFin: CIERRE,
        numeros: [],
        prefijoTicket: "ARMY",
      },
    });

    for (const armado of [sinSorteo, sorteoSinNumeros]) {
      for (const parte of [armado.subject, armado.text, armado.html]) {
        expect(parte).not.toContain("SORTEO");
        expect(parte).not.toContain("Sorteo Photocard Firmada");
        expect(parte).not.toContain("TUS NÚMEROS");
        expect(parte).not.toContain("Ya estás participando");
        expect(parte).not.toContain("cierra el"); // la línea de cierre del sorteo
        expect(parte).not.toContain("Bases del sorteo");
        expect(parte).not.toContain("ARMY-"); // ningún boleto, ni con prefijo ni sin él
        expect(parte).not.toMatch(/\bNº\b(?!\s*de orden)/); // ni el rótulo del talón del boleto
      }
      // Lo demás del correo sigue entero: la compra se confirma igual.
      expect(armado.text).toContain("ord_abc123");
      expect(armado.text).toContain("https://app.test/entrega/x");
      expect(armado.subject).toContain("Tienda ARMY");
    }
  });
});
