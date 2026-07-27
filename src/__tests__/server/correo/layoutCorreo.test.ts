import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { formatearNumerosDelSorteo } from "~/lib/numerosDelSorteo";
import {
  construirFrom,
  envolverEnLayout,
  MARCA_PLATAFORMA,
  REMITENTE_CORREO,
  temaDeCorreo,
  ticketsDeNumeros,
} from "~/server/domain/correo/layoutCorreo";

/**
 * Tests del LAYOUT compartido de los correos al Comprador (F07/D9). Puro: sin `db`, sin red, sin
 * `env` — entra el cuerpo de una plantilla y sale el correo envuelto en el chrome.
 *
 * **Rework D9-rev (2026-07-26)**: el correo habla en voz de la TIENDA, no de la plataforma. El
 * cuerpo se tematiza con el branding del `Tenant` (logo + `colorPrimario`, color-desde-dato — mismo
 * seam que el storefront) y la marca Sortéatelo sobrevive solo en el chrome («vía Sortéatelo» + el
 * pie). Los tests de la 1ª pasada que fijaban la paleta El Talonario en el cuerpo quedaron
 * reescritos a ese contrato; los del arnés (email-safe, escapado, saneo, texto plano) no se tocaron.
 */

/** Rosa del tenant piloto (`autora`) — un color REAL de la DB, no un hex de laboratorio. */
const COLOR_TIENDA = "#e11d48";

/**
 * Razón de contraste WCAG 2.1, reimplementada acá A PROPÓSITO. Importar la del layout haría el test
 * circular: comprobaría que la fórmula es consistente consigo misma, no que los tonos se leen.
 */
function contraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const canal = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return (
      0.2126 * canal((n >> 16) & 255) +
      0.7152 * canal((n >> 8) & 255) +
      0.0722 * canal(n & 255)
    );
  };
  const [x, y] = [luz(a), luz(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("domain/correo/layoutCorreo — chrome de marca (D9/D1)", () => {
  // correo.layout.001 — el layout envuelve texto Y html, con la TIENDA protagonista y la marca de
  // plataforma en el chrome. El orden importa: el Comprador le compró a la Tienda (ADR-0008), la
  // plataforma solo firma abajo.
  it("envuelve el cuerpo en texto y HTML con la Tienda protagonista y «vía Sortéatelo» en el chrome", () => {
    const { text, html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      preheader: "Tus enlaces de descarga",
      texto: ["Hola,", "", "Gracias por tu compra."],
      html: ["<p>Hola,</p>", "<p>Gracias por tu compra.</p>"],
    });

    for (const parte of [text, html]) {
      expect(parte).toContain("Tienda ARMY");
      expect(parte).toContain(`vía ${MARCA_PLATAFORMA}`);
      expect(parte).toContain("Gracias por tu compra.");
    }
    // El cuerpo HTML llega entero, no re-escapado ni recortado.
    expect(html).toContain("<p>Gracias por tu compra.</p>");
  });
});

describe("domain/correo/layoutCorreo — marca de la TIENDA en el cuerpo (D9-rev/I11)", () => {
  // correo.layout.010 — el cuerpo del correo se tematiza con el color del TENANT. Es el rework
  // completo en una aserción: el encabezado deja de ser la banda cobalto de plataforma y pasa a ser
  // el color de la Tienda, derivado del dato con el MISMO seam que el storefront
  // (`generarEscalaColor`), no con hex elegidos a ojo dentro del correo.
  it("pinta el encabezado con el color de la Tienda, no con el cobalto de plataforma", () => {
    const { html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      colorPrimario: COLOR_TIENDA,
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    const tema = temaDeCorreo(COLOR_TIENDA);
    // La banda del encabezado es EL color del tenant (índice 6 de su escala = el hex que eligió).
    expect(tema.banda.toLowerCase()).toBe(COLOR_TIENDA);
    expect(html).toContain(`background-color:${tema.banda}`);
    // Y el cobalto de plataforma ya no tematiza nada del correo.
    expect(html).not.toContain("#2b3fbf");
  });

  // correo.layout.011 — el logo de la Tienda en el encabezado (D9-rev). El `alt` NO es cosmética:
  // Gmail bloquea las imágenes por defecto en el primer correo de un remitente, así que el `alt` es
  // lo que el Comprador ve — tiene que ser el nombre de la Tienda, no "logo".
  it("muestra el logo de la Tienda con el nombre como alt cuando hay logo", () => {
    const { html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      logoUrl: "https://pub.r2.dev/ten1/branding/logo?v=7",
      colorPrimario: COLOR_TIENDA,
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    expect(html).toContain("<img");
    expect(html).toContain('src="https://pub.r2.dev/ten1/branding/logo?v=7"');
    expect(html).toContain('alt="Tienda ARMY"');
  });

  // correo.layout.012 — degradación oficial de §5.2, la MISMA del storefront
  // (`storefront-layout.tsx:207-218`): sin logo, el nombre de la Tienda como texto. Nunca un
  // encabezado vacío, nunca un `<img>` roto, y NO se inventa un monograma que el storefront no hace.
  it("cae al nombre de la Tienda como texto cuando no hay logo (D11)", () => {
    const { html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      colorPrimario: COLOR_TIENDA,
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("Tienda ARMY");
  });

  // correo.layout.013 — un `logoUrl` que no es una URL absoluta https NO entra al `<img>`: se
  // degrada al nombre. Cubre las dos caras del mismo agujero — el campo fue free-text antes de
  // plantilla-rica D4/I6 (puede haber una key del bucket o un path relativo guardado, que en un
  // buzón es un `<img>` roto) y un `javascript:`/`data:` ahí es una inyección con la firma de la
  // Tienda encima.
  it("ignora un logo que no sea URL absoluta https y cae al nombre", () => {
    for (const logoUrl of [
      "ten1/branding/logo.png", // key del bucket, sin esquema
      "/branding/logo.png", // path relativo: en un correo no resuelve contra nada
      "http://pub.r2.dev/logo.png", // sin TLS: Gmail lo bloquea y filtra como inseguro
      'https://x/a" onerror="alert(1)', // rompe el atributo
      "javascript:alert(1)",
      // Control byte embebido: no es whitespace, así que el `[^\s…]` del regex no lo ve — se filtra
      // aparte, con el mismo criterio que el saneo del nombre de la Tienda.
      `https://pub.r2.dev/logo${String.fromCharCode(1)}.png`,
    ]) {
      const { html } = envolverEnLayout({
        nombreTienda: "Tienda ARMY",
        logoUrl,
        preheader: "Resumen",
        texto: ["cuerpo"],
        html: ["<p>cuerpo</p>"],
      });
      expect(html, logoUrl).not.toContain("<img");
      expect(html, logoUrl).not.toContain("onerror");
      expect(html, logoUrl).toContain("Tienda ARMY");
    }
  });

  // correo.layout.003 — **REESCRITO por D9-rev** (antes fijaba la paleta El Talonario en el cuerpo,
  // que es justo lo que el usuario pidió revertir). Lo que fija ahora es la otra mitad del contrato:
  // sin color de marca el correo degrada a los tonos del theme base de plataforma, EXACTAMENTE como
  // degrada el storefront cuando `overrideDesdeBranding` no encuentra un hex válido.
  it("degrada a los tonos de plataforma cuando el tenant no tiene color válido", () => {
    const base = temaDeCorreo(null);
    // El primario de plataforma, copiado literal de `theme.colors.sorteatelo` (design.md §9).
    expect(base.banda).toBe("#2b3fbf");

    // Un hex basura NO revienta y NO se interpola: cae al mismo lugar que la ausencia (I11). Se
    // prueban las formas en que un campo de texto libre llega roto de verdad.
    for (const invalido of [
      "",
      "   ",
      "rojo",
      "#12345",
      "rgb(255,0,0)",
      "#fff;background:url(javascript:alert(1))",
    ]) {
      expect(temaDeCorreo(invalido), invalido).toEqual(base);
      const { html } = envolverEnLayout({
        nombreTienda: "Tienda ARMY",
        colorPrimario: invalido,
        preheader: "Resumen",
        texto: ["cuerpo"],
        html: ["<p>cuerpo</p>"],
      });
      expect(html, invalido).not.toContain("javascript:");
      expect(html, invalido).not.toContain("rojo");
      expect(html, invalido).toContain(`background-color:${base.banda}`);
    }
  });

  // correo.layout.014 — la derivación es DETERMINISTA: mismo color ⇒ mismos hex. No es una
  // formalidad — la plantilla llama a `temaDeCorreo` por su cuenta para pintar un boleto y el layout
  // lo llama otra vez para el chrome; si no coincidieran, el correo saldría con dos marcas.
  it("deriva los mismos tonos para el mismo color, y tonos distintos para colores distintos", () => {
    expect(temaDeCorreo(COLOR_TIENDA)).toEqual(temaDeCorreo(COLOR_TIENDA));
    // Case-insensitive: el hex del tenant puede venir en mayúsculas.
    expect(temaDeCorreo("#E11D48")).toEqual(temaDeCorreo("#e11d48"));
    expect(temaDeCorreo("#0d9488").banda).not.toBe(temaDeCorreo(COLOR_TIENDA).banda);
  });

  // correo.layout.015 — el contraste se CALCULA, no se asume. Una Tienda amarilla con el titular en
  // blanco encima es un encabezado ilegible, y el color lo elige el Organizador sin que nadie lo
  // revise. Misma postura que el `autoContrast` del theme (design.md §3).
  it("elige texto legible sobre la banda para cualquier color de marca", () => {
    // Amarillo lotería: fondo clarísimo ⇒ el titular tiene que irse a tinta, no quedarse en blanco.
    expect(temaDeCorreo("#ffc530").bandaTexto).toBe("#191b22");
    // Rosa/cobalto: fondos oscuros ⇒ blanco.
    expect(temaDeCorreo(COLOR_TIENDA).bandaTexto).toBe("#ffffff");
    expect(temaDeCorreo(null).bandaTexto).toBe("#ffffff");
    // Y el acento (enlaces y Números del sorteo) nunca queda en un tono invisible: el amarillo de
    // marca se oscurece hasta que se lee sobre el tinte del boleto.
    expect(temaDeCorreo("#ffc530").acento).not.toBe("#ffc530");
    for (const color of ["#ffc530", COLOR_TIENDA, "#0d9488", "#b983ff", null]) {
      const t = temaDeCorreo(color);
      expect(contraste(t.acento, t.tinte), `${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // correo.layout.020 — el invariante I11 escrito como test: con una Tienda que tiene su color, la
  // paleta El Talonario NO tematiza el cuerpo; sobrevive SOLO en el chrome de plataforma (el pie).
  // Se verifica por POSICIÓN y no por presencia, que es la única forma de distinguir «el amarillo
  // pinta el correo» de «el amarillo pinta el wordmark del pie».
  it("no deja hex de El Talonario en el cuerpo: el chrome de plataforma vive solo en el pie", () => {
    const { html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      colorPrimario: COLOR_TIENDA,
      nombreSorteo: "Photobook firmado",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    // El cobalto de plataforma no aparece en ninguna parte: no hay chrome que lo necesite.
    expect(html).not.toContain("#2b3fbf");

    // El amarillo lotería sí, pero solo DESPUÉS de que arranca la banda del pie.
    const inicioDelPie = html.indexOf("background-color:#191b22");
    expect(inicioDelPie).toBeGreaterThan(-1);
    expect(html.indexOf("#ffc530")).toBeGreaterThan(inicioDelPie);

    // Y el chrome que el rework conserva sigue puesto (D9-rev): la firma discreta arriba y el pie
    // de plataforma con su disclaimer de ADR-0008.
    expect(html).toContain(`vía ${MARCA_PLATAFORMA}`);
    expect(html.slice(inicioDelPie)).toContain("infraestructura técnica");
  });
});

describe("domain/correo/layoutCorreo — HTML email-safe (D9)", () => {
  const { html } = envolverEnLayout({
    nombreTienda: "Tienda ARMY",
    preheader: "Resumen",
    texto: ["cuerpo"],
    html: ["<p>cuerpo</p>"],
  });

  // D9-rev: el branding del tenant agrega un `<img>`, hex derivados y los boletos al HTML. Las
  // mismas reglas tienen que seguir valiendo CON todo eso puesto — si no, el correo se rompe justo
  // en los tenants que sí configuraron su marca, que son los que más lo van a mirar.
  const conBranding = envolverEnLayout({
    nombreTienda: "Tienda ARMY",
    logoUrl: "https://pub.r2.dev/ten1/branding/logo?v=7",
    colorPrimario: COLOR_TIENDA,
    nombreSorteo: "Photobook firmado",
    preheader: "Tus números",
    texto: ["cuerpo"],
    html: [
      "<p>cuerpo</p>",
      ticketsDeNumeros({
        numeros: [1043, 1044],
        tema: temaDeCorreo(COLOR_TIENDA),
        prefijo: null,
      }).html,
    ],
  }).html;

  // correo.layout.002 — las tres restricciones que separan un correo de una página: nada de CSS
  // que Gmail pueda descartar, nada de webfonts que no van a llegar, y layout con TABLAS (Outlook
  // renderiza con Word: no hay flex ni grid). Se prueba acá y no a ojo porque el modo de falla es
  // silencioso — se ve bien en el navegador y llega roto al buzón.
  it("no lleva CSS fuera de línea ni webfonts, y arma el layout con tablas", () => {
    for (const salida of [html, conBranding]) {
      // Ni hoja externa, ni bloque <style>, ni clases: en varias vistas de Gmail el <head> se
      // descarta entero y el correo quedaría sin estilos.
      expect(salida).not.toMatch(/<style[\s>]/i);
      expect(salida).not.toContain("<link");
      expect(salida).not.toMatch(/\sclass=/);
      // Ni @font-face ni fuentes remotas: las familias de marca no viajan a un buzón.
      expect(salida).not.toContain("@font-face");
      expect(salida).not.toContain("@import");
      expect(salida).not.toContain("fonts.googleapis");
      expect(salida).not.toContain(".woff");
      // Estructura de tablas, no flex/grid.
      expect(salida).toContain('role="presentation"');
      expect(salida).not.toMatch(/display:\s*(flex|grid)/);
      // TODO stack de fuentes termina en una familia genérica. Un `font-family` que solo nombre
      // fuentes de marca (Fraunces, Bricolage, IBM Plex Mono) llegaría al buzón sin nada que
      // resolver y el cliente elegiría por su cuenta — la única forma de controlarlo sin webfonts
      // es el fallback explícito.
      const stacks = [...salida.matchAll(/font-family:([^;"]+)/g)].map((m) =>
        (m[1] ?? "").trim(),
      );
      expect(stacks.length).toBeGreaterThan(0);
      for (const stack of stacks) {
        expect(stack, stack).toMatch(/(sans-serif|serif|monospace)$/);
      }
    }
  });

  // correo.layout.004 — el texto plano SIEMPRE viaja (entregabilidad + clientes que no pintan
  // HTML) y no arrastra markup del cuerpo.
  it("produce texto plano no vacío y sin etiquetas HTML", () => {
    const { text } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      preheader: "Resumen",
      texto: ["Hola,", "Tus enlaces están abajo."],
      html: ["<p>Hola,</p>"],
    });
    expect(text).toContain("Tus enlaces están abajo.");
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("<table");
  });
});

describe("domain/correo/layoutCorreo — los Números como boletos (D10)", () => {
  const tema = temaDeCorreo(COLOR_TIENDA);

  // correo.layout.016 — el pedido textual del usuario: «que en vez de números parezcan tickets».
  // El boleto se arma con lo ÚNICO que un cliente de correo pinta seguro (tabla + bordes +
  // border-radius + una perforación dashed), y el número va en mono como en el panel.
  it("renderiza un rango como boleto: tabla, perforación y el número en mono", () => {
    const { html } = ticketsDeNumeros({
      numeros: [1043, 1044, 1045],
      tema,
      prefijo: null,
    });

    expect(html).toContain("<table");
    expect(html).toContain('role="presentation"');
    expect(html).toContain("dashed"); // la perforación del talón
    expect(html).toContain("border-radius");
    expect(html).toContain("monospace"); // el stack mono termina en la familia genérica
    // El rango plegado, con el guion medio (U+2013) del panel — no un hyphen.
    expect(html).toContain("1043–1045");
  });

  // correo.layout.017 — el texto plano NO intenta dibujar un boleto: degrada al MISMO string que
  // muestra el panel (`formatearNumerosDelSorteo`). Que los dos salgan de la misma función es lo
  // que garantiza que el Comprador y el Organizador lean lo mismo.
  it("degrada en texto plano al formato de rangos de numerosDelSorteo", () => {
    const numeros = [3, 7, 8, 9, 15];
    const { texto, html } = ticketsDeNumeros({ numeros, tema, prefijo: null });

    expect(texto).toBe(formatearNumerosDelSorteo(numeros, null));
    expect(texto).toBe("3, 7–9, 15");
    expect(texto).not.toContain("<");
    // Tres bloques no contiguos ⇒ tres boletos, no un chorizo de números sueltos.
    expect(html.match(/<table/g)).toHaveLength(3);
  });

  // correo.layout.023 — F08/D12: el boleto lleva el prefijo de la Tienda, y lo lleva por el MISMO
  // helper que el panel. Es la mitad que hace verdadera la promesa de I12: el Comprador lee en su
  // correo exactamente el string que el Organizador ve en su tabla.
  it("con prefijo de la Tienda el boleto y su texto plano dicen lo mismo que el panel", () => {
    const numeros = [3, 7, 8, 9];
    const { html, texto } = ticketsDeNumeros({ numeros, tema, prefijo: "ARMY" });

    expect(texto).toBe(formatearNumerosDelSorteo(numeros, "ARMY"));
    expect(texto).toBe("ARMY-3, ARMY-7–9");
    // Un boleto por bloque, cada uno con su prefijo — nunca `ARMY-7–ARMY-9`.
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain("ARMY-3");
    expect(html).toContain("ARMY-7–9");
    expect(html).not.toContain("ARMY-7–ARMY-9");
  });

  // correo.layout.018 — sin números no se dibuja un boleto vacío (degradación elegante, §5.2). Le
  // pasa a toda orden sin tickets, que es un caso REAL: F03 manda el mismo correo cuando el producto
  // no participa en el sorteo.
  it("no dibuja nada cuando no hay números", () => {
    expect(ticketsDeNumeros({ numeros: [], tema, prefijo: null })).toEqual({
      html: "",
      texto: "",
    });
  });

  // correo.layout.019 — el boleto se tematiza con la marca de la Tienda como el resto del cuerpo
  // (I11): ni un hex de El Talonario adentro.
  it("pinta el boleto con los tonos de la Tienda", () => {
    const { html } = ticketsDeNumeros({ numeros: [7], tema, prefijo: null });
    expect(html).toContain(tema.acento);
    expect(html).toContain(tema.linea);
    expect(html).not.toContain("#2b3fbf");
    expect(html).not.toContain("#ffc530");
  });
});

describe("domain/correo/layoutCorreo — el seam con el theming del storefront (D9-rev)", () => {
  // correo.layout.022 — guard ESTRUCTURAL. El layout de correo importa `generarEscalaColor` de
  // `~/styles/tenantTheme` a propósito: es lo que garantiza que el correo y la tienda deriven los
  // MISMOS tonos del mismo hex. Eso solo es sano mientras `tenantTheme` no tenga imports de VALOR
  // — hoy los suyos son type-only y TS los elide, así que un módulo del server no arrastra
  // `@mantine/core` al bundle. El día que alguien agregue ahí un import de valor, el correo se lo
  // lleva puesto en silencio: este test es el que grita.
  it("tenantTheme no tiene imports de valor (el dominio de correo lo importa)", () => {
    const fuente = readFileSync(
      resolve(process.cwd(), "src/styles/tenantTheme.ts"),
      "utf8",
    );
    const imports = [...fuente.matchAll(/^import\s+([\s\S]*?)from\s+"([^"]+)";/gm)];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, bindings, modulo] of imports) {
      // `import type { A, B } from …` marca la declaración ENTERA como type-only: es igual de
      // seguro que el modificador por binding y no tiene por qué poner el guard en rojo.
      if (/^type\s/.test(bindings ?? "")) continue;
      const nombres = (bindings ?? "")
        .replace(/[{}]/g, "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      for (const nombre of nombres) {
        expect(nombre, `${modulo} → ${nombre}`).toMatch(/^type\s/);
      }
    }
  });
});

describe("domain/correo/layoutCorreo — el sorteo se nombra (I10/D1)", () => {
  // correo.layout.005 — una Tienda tiene n sorteos y solo uno activo: el Comprador nunca tiene que
  // adivinar de cuál le hablan. El layout expone el slot para que NINGUNA plantilla de F03–F06
  // pueda olvidarlo.
  it("muestra el nombre del sorteo en el chrome cuando el correo habla de uno", () => {
    const { text, html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      nombreSorteo: "Photobook firmado",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });
    expect(text).toContain("Photobook firmado");
    expect(html).toContain("Photobook firmado");
  });

  // correo.layout.006 — degradación elegante (design.md §5.2): un correo que NO habla de un sorteo
  // no muestra un rótulo vacío ni un "undefined". La plantilla de descarga es justamente ese caso.
  it("omite el bloque del sorteo cuando no hay sorteo del que hablar", () => {
    const { text, html } = envolverEnLayout({
      nombreTienda: "Tienda ARMY",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });
    for (const parte of [text, html]) {
      expect(parte).not.toContain("Sorteo:");
      expect(parte).not.toContain("SORTEO");
      expect(parte).not.toContain("undefined");
    }
  });
});

describe("domain/correo/layoutCorreo — datos hostiles del tenant (I6/ADR-0008)", () => {
  // correo.layout.007 — el nombre de la Tienda lo escribe el Organizador, así que NO se confía
  // aunque no sea un input anónimo: en el HTML se escapa (nada de tags reales en el buzón de un
  // tercero) y en las cabeceras se sanea (un \r\n inyecta cabeceras nuevas, p.ej. un Bcc:).
  // El layout hereda las dos defensas de `_correoBase`, pero se prueban ACÁ porque acá es donde
  // el nombre se interpola en el chrome de TODAS las plantillas.
  it("escapa el HTML y sanea las cabeceras de un nombre de Tienda hostil", () => {
    const nombreTienda = 'Tienda <script>alert("x")</script>\r\nBcc: victima@x.cl';
    const { text, html } = envolverEnLayout({
      nombreTienda,
      nombreSorteo: "Sorteo <img src=x onerror=1>",
      preheader: "<b>preheader</b>",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    // Nada del nombre llega como markup ejecutable.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    // El preheader también se escapa: es dato interpolado como cualquier otro.
    expect(html).not.toContain("<b>preheader</b>");
    // Saneo de cabecera: el salto de línea desaparece del nombre que viaja por el chrome, así que
    // el `Bcc:` inyectado queda como texto plano en la misma línea, no como cabecera nueva.
    expect(html).not.toMatch(/[\r\n]/);
    expect(text.split("\n")[0]).toContain("Bcc: victima@x.cl");
    expect(text.split("\n")[0]).toContain("vía Sortéatelo");
  });

  // correo.layout.008 — un nombre que se queda en nada después del saneo (solo espacios/control)
  // no puede dejar el chrome sin identidad: cae a la marca, nunca a un encabezado vacío.
  // correo.layout.009 — el `from` es una ADDRESS-LIST, no texto: un nombre de Tienda con `<>`
  // metía un segundo angle-addr en la cabecera (`Regalos <ataque@evil.cl> · vía Sortéatelo
  // <no-reply@...>`). Según cómo lo parsee el proveedor eso es un 422 que voltea el LOTE ENTERO
  // —hasta 100 correos de varios tenants por el nombre de una sola tienda— o un correo que sale
  // con un remitente ajeno. El saneo del cuerpo no cubría esto: son defensas distintas.
  it("neutraliza los especiales de address-list en el nombre que va al from", () => {
    const from = construirFrom(
      "Regalos <ataque@evil.cl>, S.A.",
      REMITENTE_CORREO,
    );
    // Una sola dirección en la cabecera: el `<` que queda es el del remitente real.
    expect(from.match(/</g)).toHaveLength(1);
    expect(from.endsWith(`<${REMITENTE_CORREO}>`)).toBe(true);
    expect(from).not.toContain("ataque@evil.cl>");
    // El nombre legible sobrevive (los especiales se reemplazan por espacio, no se pegan palabras).
    expect(from).toContain("Regalos");
    expect(from).toContain("S.A.");
    // Y el nombre para el CUERPO no se toca con esta tijera: ahí `<b>` debe llegar escapado, no
    // borrado (`correo.template.005` lo fija).
    const { html } = envolverEnLayout({
      nombreTienda: "Tienda <b>ARMY</b>",
      preheader: "x",
      texto: ["c"],
      html: ["<p>c</p>"],
    });
    expect(html).toContain("Tienda &lt;b&gt;ARMY&lt;/b&gt;");
  });

  // correo.layout.021 — D9-rev abrió DOS canales nuevos por donde entra dato del Organizador al
  // HTML: el `src` del logo y los hex del tema. Se prueban juntos y no solo por separado porque el
  // modo de falla interesante es la interacción — p. ej. un logo que sí pasa el filtro de URL
  // mientras el nombre hostil viaja como su `alt`, que es otro atributo.
  it("no deja escapar nada del branding hostil por el logo ni por el color", () => {
    const { html } = envolverEnLayout({
      nombreTienda: 'Tienda " onload="alert(1)',
      logoUrl: "https://pub.r2.dev/ten1/branding/logo?v=1&x=%22",
      colorPrimario: "#e11d48;position:absolute",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    // El nombre viaja como `alt` del logo, y ahí una comilla cierra el atributo: va escapada.
    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain("&quot; onload=&quot;alert(1)");
    // El color con payload pegado NO es hex ⇒ ni se interpola ni tumba el correo: degrada.
    expect(html).not.toContain("position:absolute");
    expect(html).toContain("background-color:#2b3fbf"); // la escala de plataforma
    // La URL del logo sí pasa el filtro (es https y sin comillas crudas) y se escapa igual.
    expect(html).toContain("&amp;x=%22");
  });

  it("cae a la marca cuando el nombre de la Tienda se sanea a vacío", () => {
    const { html } = envolverEnLayout({
      nombreTienda: "   \r\n  ",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });
    expect(html).toContain(MARCA_PLATAFORMA);
  });
});

describe("domain/correo/layoutCorreo — pie legal e identidad del Organizador (F05/D6)", () => {
  // correo.layout.024 — D6: el pie nombra a QUIÉN responde por la venta y el sorteo. Es lo que
  // convierte al disclaimer de ADR-0008 («la Tienda es responsable») en algo accionable: el nombre
  // de fantasía de la Tienda no identifica a nadie ante un reclamo, la razón social sí.
  it("imprime la identidad legal del Organizador en el pie, en texto y en HTML", () => {
    const { text, html } = envolverEnLayout({
      nombreTienda: "ARMY Chile",
      identidadLegal: "Comercializadora Ana Pérez E.I.R.L., RUT 76.543.210-K",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    expect(text).toContain(
      "Comercializadora Ana Pérez E.I.R.L., RUT 76.543.210-K",
    );
    expect(html).toContain(
      "Comercializadora Ana Pérez E.I.R.L., RUT 76.543.210-K",
    );
    // Va DESPUÉS del disclaimer de ADR-0008 y no en su lugar: el disclaimer dice el reparto de
    // responsabilidades, la identidad legal dice quién es la parte responsable.
    expect(html.indexOf("solo provee la")).toBeLessThan(
      html.indexOf("Comercializadora Ana"),
    );
  });

  // correo.layout.025 — degradación (§5.2): sin identidad legal cargada el pie sale como siempre.
  // Ni rótulo huérfano, ni «Vendedor: undefined», ni un renglón vacío — la Tienda recién creada que
  // todavía no llenó ese campo tiene que poder mandar su primer correo igual.
  it("omite la línea cuando el Organizador no cargó identidad legal", () => {
    const conNada = envolverEnLayout({
      nombreTienda: "ARMY Chile",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });
    const conVacio = envolverEnLayout({
      nombreTienda: "ARMY Chile",
      identidadLegal: "   ",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    for (const { text, html } of [conNada, conVacio]) {
      expect(text).not.toContain("undefined");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("Vendedor:");
    }
    // El vacío tras trim es indistinguible de la ausencia: un espacio tipeado no es una identidad.
    expect(conVacio.html).toBe(conNada.html);
  });

  // correo.layout.026 — la identidad legal la escribe el Organizador, así que es texto hostil como
  // cualquier otro del tenant: se escapa (va al HTML) y se sanea (es una línea, no un párrafo).
  it("escapa y sanea la identidad legal como el resto del dato del tenant", () => {
    const { text, html } = envolverEnLayout({
      nombreTienda: "ARMY Chile",
      identidadLegal: "Ana <script>alert(1)</script>\r\nBcc: victima@x.cl",
      preheader: "Resumen",
      texto: ["cuerpo"],
      html: ["<p>cuerpo</p>"],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Ningún salto de línea del tenant llega al HTML (el saneo colapsa el CRLF).
    expect(html).not.toContain("\r");
    expect(text).not.toContain("\r");
  });
});
