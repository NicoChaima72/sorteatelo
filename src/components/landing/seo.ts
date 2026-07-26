import { APP_CONFIG } from "~/config/app";

import { FAQ, HERO, PRECIO } from "./copy";

/**
 * Metadata SEO de la landing del APEX (plan `26-07-25-landing-reposicionamiento.md` F04). Vive
 * separada del componente porque son DATOS derivados: el `<Head>` y los `<script type="ld+json">`
 * solo los imprimen.
 *
 * Dos reglas duras del plan viven acá:
 *
 * - **I10 — el JSON-LD se DERIVA de `copy.ts`/`APP_CONFIG`, nunca se duplica a mano.** Un `FAQPage`
 *   escrito aparte se desincroniza en la primera edición de copy y deja a Google mostrando en sus
 *   resultados una respuesta que la página ya no dice. Por eso `mainEntity` se arma con un `.map`
 *   sobre `FAQ` y el precio del `Offer` sale del mismo número que pinta la sección de precio.
 * - **D13/I2 — «rifa» solo acá.** `KEYWORDS_SEO` y el `keywords` del JSON-LD son las ÚNICAS
 *   superficies donde la palabra está permitida, porque ningún visitante las lee. Honestidad
 *   registrada en el plan: `meta keywords` está ignorado por Google desde ~2009 y el `keywords` de
 *   schema.org no es factor de ranking confirmado — su valor real es ≈0 y se pone a sabiendas. La
 *   captura del volumen de búsqueda de "rifa" es una task futura de CONTENIDO, no de metadata.
 *
 * Alcance: SOLO el apex. Las páginas de tenant no importan este módulo (I6).
 */

/** Raíz absoluta de la plataforma. Los crawlers sociales no resuelven URLs relativas. */
export const URL_APEX = `https://${APP_CONFIG.dominio}`;

/** URL canónica de la landing (con barra final: es el home). */
export const URL_CANONICA = `${URL_APEX}/`;

/**
 * OG en PNG 1200×630 y ABSOLUTO (F05). El `og.svg` que había antes fallaba por partida doble:
 * la mayoría de los crawlers sociales no rasteriza SVG, y una ruta relativa no la resuelven.
 */
export const URL_OG_IMAGEN = `${URL_APEX}/og.png`;

/** Título del documento. Marca + promesa, ambas desde `APP_CONFIG` (I7). */
export const TITULO_SEO = `${APP_CONFIG.name} · ${APP_CONFIG.tagline}`;

/**
 * Meta description. Arranca con el tagline (D11) y suma qué se hace y qué no se paga. Se mantiene
 * bajo 160 caracteres para que no salga cortada en el resultado de búsqueda (lo cubre un test).
 */
export const DESCRIPCION_SEO =
  `${APP_CONFIG.tagline} Crea tu tienda, sube tu producto y sortéalo entre ` +
  `quienes te compraron. Sin programadores ni comisión por venta.`;

/**
 * `<meta name="keywords">`. Única superficie visible-para-máquinas donde "rifa" está permitida
 * (D13). Ver el docblock de arriba sobre su valor real (≈0): se incluye como decisión consciente
 * del usuario, no porque mueva el ranking.
 */
export const KEYWORDS_SEO =
  "sorteo online, sorteos online Chile, montar un sorteo, tienda con sorteo, " +
  "rifa online, rifas online, sorteos por internet Chile";

/** Idioma/locale de la landing: español de Chile. */
export const LOCALE_SEO = "es_CL";

const ORGANIZACION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${URL_APEX}#organizacion`,
  name: APP_CONFIG.name,
  url: URL_APEX,
  // SIN `logo` a propósito: Google usa esa propiedad para el logo del Knowledge Panel y espera una
  // imagen cuadrada o casi cuadrada. Lo único que hay hoy es el banner OG 1200×630 (ratio 1,9:1) —
  // ponerlo ahí es pedir un warning. Se agrega cuando exista el isotipo dibujado (pendiente de
  // `docs/design.md`).
  description: DESCRIPCION_SEO,
  slogan: APP_CONFIG.tagline,
  areaServed: { "@type": "Country", name: "Chile" },
};

const SITIO = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${URL_APEX}#sitio`,
  name: APP_CONFIG.name,
  url: URL_APEX,
  inLanguage: "es-CL",
  publisher: { "@id": ORGANIZACION["@id"] },
};

/**
 * El producto como software con su oferta. El precio sale de `PRECIO.montoMensualClp` — el MISMO
 * número que la sección de precio formatea con `clp()` (I10: una sola verdad del monto).
 */
const APLICACION = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: APP_CONFIG.name,
  url: URL_APEX,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "es-CL",
  description: HERO.bajada,
  keywords: KEYWORDS_SEO,
  publisher: { "@id": ORGANIZACION["@id"] },
  offers: {
    "@type": "Offer",
    price: PRECIO.montoMensualClp,
    priceCurrency: "CLP",
    availability: "https://schema.org/InStock",
    url: URL_CANONICA,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: PRECIO.montoMensualClp,
      priceCurrency: "CLP",
      // UN/CEFACT `MON` = mes. Con `billingDuration: 1` queda "25.000 CLP por 1 mes".
      unitCode: "MON",
      billingDuration: 1,
      billingIncrement: 1,
      valueAddedTaxIncluded: true,
    },
  },
};

/** DERIVADO de `FAQ` (I10). Editar una respuesta en `copy.ts` actualiza el rich result solo. */
const PREGUNTAS = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: "es-CL",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.pregunta,
    acceptedAnswer: { "@type": "Answer", text: item.respuesta },
  })),
};

/**
 * Los 4 bloques, en el orden en que se imprimen. Van como `<script>` separados (no un `@graph`):
 * si un bloque tuviera un error, los otros tres siguen siendo válidos para el crawler.
 *
 * Acoplamiento a tener presente: `WebSite.publisher` y `SoftwareApplication.publisher` referencian a
 * `Organization` por `@id` **entre scripts distintos**. Eso resuelve porque Google fusiona todos los
 * bloques JSON-LD de una página en un solo grafo; un consumidor genérico que procese cada `<script>`
 * como documento aislado NO resolvería la referencia. Es aceptable porque el destinatario es Google
 * — si algún día importa otro consumidor, hay que pasar los 4 bloques a un único `@graph`.
 */
export const BLOQUES_JSON_LD: Record<string, unknown>[] = [
  ORGANIZACION,
  SITIO,
  APLICACION,
  PREGUNTAS,
];
