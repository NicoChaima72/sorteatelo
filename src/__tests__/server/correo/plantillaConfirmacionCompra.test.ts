import { describe, expect, it } from "vitest";

import {
  armarCorreoDescarga,
  construirFrom,
  MARCA_PLATAFORMA,
  REMITENTE_CORREO,
} from "~/server/domain/correo/plantillaDescarga";

/**
 * Tests del helper PURO de plantilla del correo de descarga (F04/D5/D6). Verifica el contenido
 * exigido — from "Tienda · vía Sortéatelo", un enlace por ítem, aviso de expiración, disclaimer de
 * responsabilidad (ADR-0008) — y que NUNCA se filtra un `pdfPath`/key del bucket (el helper solo
 * conoce los enlaces `/api/descargas/<token>` que le pasa el use case).
 */

describe("domain/correo/plantillaDescarga — construirFrom (D6)", () => {
  // correo.from.001 — remitente con nombre "Tienda · vía Sortéatelo <remitente>"
  it("arma el from con el nombre de la Tienda + marca de plataforma + remitente de prueba", () => {
    expect(construirFrom("Tienda ARMY")).toBe(
      `Tienda ARMY · vía ${MARCA_PLATAFORMA} <${REMITENTE_CORREO}>`,
    );
    expect(REMITENTE_CORREO).toBe("no-reply@sorteatelo.cl"); // dominio verificado en Resend (ADR-0014/0015)
  });
});

describe("domain/correo/plantillaDescarga — armarCorreoDescarga (D5)", () => {
  const armado = armarCorreoDescarga({
    nombreTienda: "Tienda ARMY",
    items: [
      { titulo: "Guía del bias", enlace: "https://app.test/api/descargas/tok-1" },
      { titulo: "Photobook", enlace: "https://app.test/api/descargas/tok-2" },
    ],
    diasExpiracion: 30,
  });

  // correo.template.001 — UN correo con un enlace por ítem, nombre de Tienda y aviso de expiración
  it("produce UN correo con from de la Tienda, un enlace por ítem, el nombre de la Tienda y el aviso de expiración", () => {
    expect(armado.from).toContain("Tienda ARMY");
    expect(armado.subject).toContain("Tienda ARMY");

    // Un enlace por ítem, en texto y en HTML.
    for (const parte of [armado.text, armado.html]) {
      expect(parte).toContain("https://app.test/api/descargas/tok-1");
      expect(parte).toContain("https://app.test/api/descargas/tok-2");
      expect(parte).toContain("Guía del bias");
      expect(parte).toContain("Photobook");
      expect(parte).toContain("Tienda ARMY");
    }
    // Aviso de expiración con los días.
    expect(armado.text).toContain("30 días");
    // Indicación de reenvío respondiendo el correo.
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

  // correo.template.003 — jamás expone pdfPath ni keys del bucket (solo los enlaces por token)
  it("nunca incluye un pdfPath ni una key del bucket: solo los enlaces /api/descargas/<token>", () => {
    // Si por error el use case pasara una key del bucket como enlace, este helper no la inventa:
    // acá probamos que el helper solo renderiza lo que recibe y no agrega paths internos.
    const salida = armado.text + armado.html;
    expect(salida).not.toContain(".pdf");
    expect(salida).not.toMatch(/[a-z0-9]+\/[a-z0-9]+\.pdf/i); // patrón `<tenantId>/<productId>.pdf`
  });

  // correo.template.004 — texto plano SIEMPRE presente (entregabilidad) + HTML no vacío
  it("siempre trae texto plano y HTML no vacíos", () => {
    expect(armado.text.length).toBeGreaterThan(0);
    expect(armado.html).toContain("<");
    expect(armado.html).toContain("</a>"); // los enlaces son <a href>
  });

  // correo.template.005 — escapa HTML en datos del tenant/producto (anti-inyección)
  it("escapa caracteres HTML en el título del producto y el nombre de la Tienda", () => {
    const conHtml = armarCorreoDescarga({
      nombreTienda: "Tienda <b>ARMY</b>",
      items: [
        { titulo: 'Guía "premium" <script>', enlace: "https://app.test/api/descargas/x" },
      ],
      diasExpiracion: 30,
    });
    // En el HTML los caracteres peligrosos quedan escapados (no como tags reales).
    expect(conHtml.html).not.toContain("<script>");
    expect(conHtml.html).toContain("&lt;script&gt;");
    expect(conHtml.html).toContain("Tienda &lt;b&gt;ARMY&lt;/b&gt;");
  });

  // correo.template.006 — el nombre de la Tienda se sanea en las cabeceras from/subject (anti header-injection)
  it("saca saltos de línea/control del nombre de la Tienda en el from y el subject (cabeceras)", () => {
    const conCrlf = armarCorreoDescarga({
      nombreTienda: "Malo\r\nBcc: victima@x.cl",
      items: [{ titulo: "P", enlace: "https://app.test/api/descargas/x" }],
      diasExpiracion: 30,
    });
    // Ni el from ni el subject conservan CR/LF (una cabecera con salto de línea es inyección).
    expect(conCrlf.from).not.toMatch(/[\r\n]/);
    expect(conCrlf.subject).not.toMatch(/[\r\n]/);
    // El from queda como una sola línea válida (nombre colapsado + marca + remitente).
    expect(conCrlf.from).toContain(`vía ${MARCA_PLATAFORMA} <${REMITENTE_CORREO}>`);
    // Nombre vacío tras sanear ⇒ cae a la marca (nunca un from sin nombre).
    const vacio = armarCorreoDescarga({
      nombreTienda: "   ",
      items: [{ titulo: "P", enlace: "https://app.test/api/descargas/x" }],
      diasExpiracion: 30,
    });
    expect(vacio.from.startsWith(`${MARCA_PLATAFORMA} · vía`)).toBe(true);
  });
});
