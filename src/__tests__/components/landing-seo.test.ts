import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { FAQ, PRECIO } from "~/components/landing/copy";
import {
  BLOQUES_JSON_LD,
  DESCRIPCION_SEO,
  KEYWORDS_SEO,
  TITULO_SEO,
  URL_CANONICA,
  URL_OG_IMAGEN,
} from "~/components/landing/seo";
import { APP_CONFIG } from "~/config/app";

/**
 * Metadata SEO de la landing del apex (plan `26-07-25-landing-reposicionamiento.md` F04). Lo que se
 * testea NO es "que exista SEO" sino las dos reglas que un humano rompe sin darse cuenta:
 * - el JSON-LD se **deriva** del copy (I10) — si alguien edita una respuesta de la FAQ y el bloque
 *   `FAQPage` quedara escrito a mano, Google leería una versión y el visitante otra;
 * - "rifa" vive SOLO en metadata invisible (D13/I2) — jamás en title, description ni OG.
 */

/** Devuelve el primer bloque del tipo pedido (los bloques son objetos JSON-LD sueltos). */
function bloque(tipo: string): Record<string, unknown> {
  const encontrado = BLOQUES_JSON_LD.find((b) => b["@type"] === tipo);
  if (!encontrado) throw new Error(`No hay bloque JSON-LD de tipo ${tipo}`);
  return encontrado;
}

describe("landing/seo — JSON-LD", () => {
  // landing.seo.001 — I10: el FAQPage es un DERIVADO del copy, no una copia a mano
  it("el FAQPage refleja 1:1 las 9 preguntas y respuestas de copy.ts", () => {
    const faqPage = bloque("FAQPage");
    const preguntas = faqPage.mainEntity as {
      "@type": string;
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }[];

    expect(preguntas).toHaveLength(FAQ.length);
    expect(preguntas.map((p) => p.name)).toEqual(FAQ.map((f) => f.pregunta));
    expect(preguntas.map((p) => p.acceptedAnswer.text)).toEqual(
      FAQ.map((f) => f.respuesta),
    );
    expect(preguntas.every((p) => p["@type"] === "Question")).toBe(true);
  });

  // landing.seo.002 — todo bloque es JSON serializable y válido (va dentro de un <script>)
  it("todos los bloques serializan y re-parsean como JSON válido, con @context de schema.org", () => {
    for (const b of BLOQUES_JSON_LD) {
      const json = JSON.stringify(b);
      expect(() => {
        JSON.parse(json);
      }).not.toThrow();
      expect(b["@context"]).toBe("https://schema.org");
      // Un `<script>` de cierre dentro del JSON rompería el HTML: no debe haber ninguno.
      expect(json).not.toMatch(/<\/script/i);
    }
    expect(BLOQUES_JSON_LD.map((b) => b["@type"])).toEqual([
      "Organization",
      "WebSite",
      "SoftwareApplication",
      "FAQPage",
    ]);
  });

  // landing.seo.003 — D3: la oferta declara el precio real, en CLP, derivado del copy
  it("el Offer de SoftwareApplication declara 25000 CLP mensuales, IVA incluido", () => {
    const app = bloque("SoftwareApplication");
    const offer = app.offers as Record<string, unknown>;

    expect(offer.price).toBe(PRECIO.montoMensualClp);
    expect(offer.price).toBe(25_000);
    expect(offer.priceCurrency).toBe("CLP");

    const spec = offer.priceSpecification as Record<string, unknown>;
    expect(spec.unitCode).toBe("MON"); // UN/CEFACT: mes
    expect(spec.valueAddedTaxIncluded).toBe(true);
  });
});

describe("landing/seo — metadata visible vs. invisible", () => {
  // landing.seo.004 — D13/I2: "rifa" SOLO en las dos superficies invisibles
  it("«rifa» aparece solo en keywords, nunca en title, description ni OG", () => {
    const rifa = /\brifa\w*/i;

    expect(TITULO_SEO).not.toMatch(rifa);
    expect(DESCRIPCION_SEO).not.toMatch(rifa);
    expect(URL_OG_IMAGEN).not.toMatch(rifa);
    expect(URL_CANONICA).not.toMatch(rifa);

    // Las dos superficies donde SÍ se permite (meta keywords + keywords del JSON-LD).
    expect(KEYWORDS_SEO).toMatch(rifa);
    expect(bloque("SoftwareApplication").keywords).toMatch(rifa);
  });

  // landing.seo.005 — las URLs de metadata son ABSOLUTAS: un OG relativo no lo resuelve ningún crawler
  it("canonical y og:image son URLs absolutas al dominio de APP_CONFIG", () => {
    const apex = `https://${APP_CONFIG.dominio}`;

    expect(URL_CANONICA).toBe(`${apex}/`);
    expect(URL_OG_IMAGEN).toBe(`${apex}/og.png`);
    expect(URL_OG_IMAGEN.endsWith(".png")).toBe(true);
  });

  // landing.seo.006 — la description entra completa en un resultado de búsqueda
  it("la meta description deriva del tagline y no pasa de 160 caracteres", () => {
    expect(DESCRIPCION_SEO).toContain(APP_CONFIG.tagline);
    expect(DESCRIPCION_SEO.length).toBeLessThanOrEqual(160);
  });
});

/**
 * Archivos estáticos de `public/` (F05). Son la clase de artefacto que se rompe en silencio: nadie
 * mira un `robots.txt` hasta que el sitio no indexa, y un `og:image` que apunta a un archivo
 * inexistente solo se nota cuando alguien comparte el enlace y sale una tarjeta en blanco.
 */
describe("landing/seo — archivos estáticos del apex", () => {
  const publico = (archivo: string) =>
    readFileSync(resolve(__dirname, "../../../public", archivo));

  // landing.seo.007 — robots.txt sirve y apunta al sitemap con URL ABSOLUTA (el estándar la exige)
  it("robots.txt permite el rastreo y declara el sitemap con URL absoluta", () => {
    const robots = publico("robots.txt").toString("utf8");

    expect(robots).toMatch(/^User-agent:\s*\*/m);
    expect(robots).toMatch(/^Allow:\s*\//m);
    expect(robots).toMatch(
      new RegExp(`^Sitemap:\\s*https://${APP_CONFIG.dominio}/sitemap\\.xml$`, "m"),
    );
  });

  // landing.seo.008 — el sitemap referencia el apex con URL absoluta y es XML bien formado
  it("sitemap.xml lista el apex con URL absoluta", () => {
    const sitemap = publico("sitemap.xml").toString("utf8");

    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain(
      "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    );
    expect(sitemap).toContain(`<loc>${URL_CANONICA}</loc>`);
    // Cero rutas relativas: un `<loc>/algo</loc>` invalida la entrada entera.
    expect(sitemap).not.toMatch(/<loc>(?!https:\/\/)/);
  });

  // landing.seo.009 — el OG raster existe y mide 1200×630 (leído de la cabecera IHDR del PNG)
  it("og.png existe, es PNG y mide exactamente 1200×630", () => {
    const png = publico("og.png");

    // Firma PNG: 89 50 4E 47 0D 0A 1A 0A
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    // IHDR: ancho en los bytes 16-19, alto en los 20-23.
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    // El nombre del archivo tiene que ser el que anuncia `og:image`.
    expect(URL_OG_IMAGEN.endsWith("/og.png")).toBe(true);
  });
});
