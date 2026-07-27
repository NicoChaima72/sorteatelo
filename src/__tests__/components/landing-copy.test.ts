import { describe, expect, it } from "vitest";

import * as COPY from "~/components/landing/copy";
import { APP_CONFIG } from "~/config/app";
import { LIMITE_BYTES_ARCHIVO_PRODUCTO } from "~/lib/archivos/tiposArchivo";
import { clp } from "~/lib/formato";

/**
 * Invariantes de COPY de la landing del apex (plan `26-07-25-landing-reposicionamiento.md`).
 * No testean maquetación: testean las **reglas duras del texto**, que son de producto y legales —
 * la palabra prohibida (I2/D1), la única mención permitida del procesador (I3/D10) y la promesa
 * económica que nunca puede quedar sin apellido (I4/D9). Se leen los strings EXPORTADOS, no el
 * archivo: así siguen valiendo aunque el copy se reescriba entero.
 */

/** Aplana a strings cualquier export del módulo de copy (string, array u objeto anidado). */
function textos(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(textos);
  if (valor && typeof valor === "object")
    return Object.values(valor).flatMap(textos);
  return [];
}

/** Todo el copy del módulo, incluido el del login (misma superficie pública de marca). */
const TODO = textos(COPY);

/** Solo el copy que se pinta en la LANDING (el login es otra pantalla). */
const LANDING = textos({ ...COPY, LOGIN: undefined });

describe("landing/copy — invariantes de texto", () => {
  // landing.copy.001 — D1/I2: "rifa" está prohibida en toda superficie VISIBLE
  it("no usa la palabra «rifa» en ningún string del copy", () => {
    // `\b` al inicio a propósito: la prohibición es de la PALABRA. Sin el límite, "tarifa" —el
    // término correcto para lo que cobra el procesador, y que la FAQ necesita decir— daría un falso
    // positivo. Cubre rifa/rifas/rifar/rifando.
    const conRifa = TODO.filter((t) => /\brifa\w*/i.test(t));
    expect(conRifa).toEqual([]);
  });

  // landing.copy.002 — D10/I3: el relato de la landing NO nombra al procesador (solo la FAQ)
  it("no nombra a Flow en hero, pasos, momento, confianza, CTA final ni footer", () => {
    const relato = textos({
      HERO: COPY.HERO,
      PASOS: COPY.PASOS,
      COMO_FUNCIONA: COPY.COMO_FUNCIONA,
      MOMENTO: COPY.MOMENTO,
      CONFIANZA_INTRO: COPY.CONFIANZA_INTRO,
      CONFIANZA: COPY.CONFIANZA,
      CTA_FINAL: COPY.CTA_FINAL,
      FOOTER: COPY.FOOTER,
    });
    expect(relato.filter((t) => /\bFlow\b/.test(t))).toEqual([]);
  });

  // landing.copy.003 — D9/I4: "sin comisiones" a secas es una promesa falsa (el procesador cobra)
  it("toda mención a comisión lleva el apellido «por venta» / «nuestras»", () => {
    const sinApellido = TODO.flatMap((t) =>
      [...t.matchAll(/comisi[oó]n(?:es)?([\s\S]{0,20})/gi)]
        .filter((m) => !/por venta|nuestra/i.test(m[1] ?? ""))
        .map((m) => m[0]),
    );
    expect(sinApellido).toEqual([]);
  });

  // landing.copy.005 — design.md §8: lenguaje de urgencia/escasez PROHIBIDO en el chrome de
  // plataforma. Es la bandera que el público chileno asocia a estafa, justo lo contrario de lo que
  // esta landing vende.
  //
  // LÍMITE HONESTO de este test: cubre el VOCABULARIO típico ("cupos limitados", "solo quedan",
  // "últimas horas"), no la escasez IMPLÍCITA. El caso real que hubo acá —el boleto final decía
  // «Admite a 1 (una) tienda NUEVA», o sea "solo aceptamos una más"— no matchea ninguno de estos
  // patrones y lo encontró una lectura humana, no la suite. Si alguien vuelve a escribir escasez
  // con palabras nuevas, este test tampoco la va a ver.
  it("no usa lenguaje de urgencia ni de escasez", () => {
    const ESCASEZ = [
      /cupos?\s+limitad/i,
      /(plazas?|lugares?)\s+limitad/i,
      /por\s+tiempo\s+limitado/i,
      /últim[oa]s?\s+(cupos?|lugares?|d[ií]as?|horas?|n[úu]meros?|tiendas?)/i,
      /solo\s+quedan?\b/i,
      /no\s+te\s+quedes\s+fuera/i,
    ];
    const apuros = TODO.filter((t) => ESCASEZ.some((re) => re.test(t)));
    expect(apuros).toEqual([]);
  });

  // landing.copy.004 — D11: el hero y el tagline cuentan la MISMA historia sorteo-first
  it("el copy se apoya en el tagline sorteo-first de APP_CONFIG", () => {
    expect(APP_CONFIG.tagline).toContain("sorteo");
    expect(TODO.some((t) => t.includes(APP_CONFIG.name))).toBe(true);
  });
});

describe("landing/copy — FAQ", () => {
  // landing.faq.001 — D12: las 9 entradas aprobadas, en el orden aprobado (lo consume el FAQPage)
  it("tiene exactamente las 9 preguntas aprobadas, en orden", () => {
    expect(COPY.FAQ.map((f) => f.pregunta)).toEqual([
      "¿Cuánto cuesta?",
      "¿Qué puedo vender?",
      "¿Necesito saber de páginas web?",
      "¿Cómo me llega la plata?",
      "¿Cómo sabe el comprador que su compra entró al sorteo?",
      "¿Cómo se elige al ganador del sorteo?",
      "¿Puedo hacer más de un sorteo?",
      "¿Qué pasa si un pago falla o queda a medias?",
      "¿Necesito iniciar actividades en el SII o dar boleta?",
    ]);
  });

  // landing.faq.002 — D10/I3: EL conteo global. Flow se nombra una vez en toda la landing
  it("nombra a Flow exactamente una vez en toda la landing, en «¿Cómo me llega la plata?»", () => {
    expect(LANDING.filter((t) => /\bFlow\b/.test(t))).toHaveLength(1);

    const entrada = COPY.FAQ.find((f) => /\bFlow\b/.test(f.respuesta));
    expect(entrada?.pregunta).toBe("¿Cómo me llega la plata?");
    // Se presenta como «el procesador», no como una marca que el lector deba conocer de antes.
    expect(entrada?.respuesta).toMatch(/procesador/i);
  });

  // landing.faq.003 — D3: el precio se imprime real; muere el "en definición" del lanzamiento
  it("«¿Cuánto cuesta?» imprime el precio real y ya no dice «en definición»", () => {
    const respuesta = COPY.FAQ[0]!.respuesta;
    expect(respuesta).toContain(COPY.PRECIO.monto);
    expect(respuesta).toContain("IVA incluido");
    expect(respuesta).not.toMatch(/en definición/i);
  });

  // landing.faq.004 — I9: no prometer lo que el producto no hace (1 sorteo ACTIVO por tienda)
  it("responde honesto sobre los límites reales del producto", () => {
    const sorteos = COPY.FAQ.find((f) => f.pregunta === "¿Puedo hacer más de un sorteo?");
    expect(sorteos?.respuesta).toMatch(/un sorteo activo a la vez/i);
  });

  // landing.faq.006 — productos-tipos-digitales F04/D1/D7: «¿Qué puedo vender?» dejó de ser PDF-only.
  //
  // Reemplaza a la vieja aserción `/PDF/` de landing.faq.004, que se volvió una MENTIRA por omisión
  // el día que el pipeline aceptó 9 tipos: la landing prometía menos de lo que el producto hace, y
  // eso también es copy desalineado (un Organizador con un EPUB o un pack de stickers se iba
  // creyendo que no era para él).
  //
  // El test nombra las CINCO familias de D1 por separado, no un `/EPUB|imagen/` laxo, porque el
  // riesgo real es que una reescritura futura del copy se coma una: el `accept` del form seguiría
  // aceptando audio y la landing ya no lo diría. Y exige el **límite de peso** (D7) porque es la
  // única letra chica de esta respuesta: un WAV o un ZIP grande NO entran, y prometer de más acá se
  // paga en soporte (misma razón que el resto de las aserciones de honestidad).
  it("«¿Qué puedo vender?» nombra las 5 familias de tipos y su límite de peso, sin ser PDF-only", () => {
    const vender = COPY.FAQ.find((f) => f.pregunta === "¿Qué puedo vender?");
    expect(vender).toBeDefined();
    const respuesta = vender!.respuesta;

    // Las 5 familias de la allowlist (D1). PDF sigue estando: se sumaron tipos, no se cambiaron.
    expect(respuesta).toMatch(/\bPDF\b/);
    expect(respuesta).toMatch(/\bEPUB\b/i);
    expect(respuesta).toMatch(/im[áa]gen/i);
    expect(respuesta).toMatch(/audio/i);
    expect(respuesta).toMatch(/\bZIP\b/i);

    // El límite se DERIVA del código, no se escribe a mano: si mañana D7 sube a 50 MB y nadie
    // actualiza la landing, este test cae en vez de dejar una promesa vieja publicada.
    const limiteMb = LIMITE_BYTES_ARCHIVO_PRODUCTO / (1024 * 1024);
    expect(respuesta).toContain(`${limiteMb} MB`);
  });

  // landing.faq.005 — BORRADO por `checkout-retorno-numeros-sorteo` F02 (2026-07-26).
  //
  // Prohibía que la landing dijera que el Comprador ve su número «en pantalla», y su premisa escrita
  // era «NINGUNA pantalla los muestra todavía —ni el retorno post-pago—». Desde F02 el retorno
  // post-pago (`src/pages/checkout/retorno.tsx`) los dibuja como boletos apenas el webhook confirma
  // el pago, así que el guard pasó a prohibir una promesa VERDADERA: el copy de la landing ya puede
  // decirlo. El backlog de `landing-reposicionamiento` pedía justamente borrarlo al aterrizar esta
  // feature («al aterrizar hay que borrar el test landing.faq.005»). Su otra mitad —la del correo—
  // ya la había cerrado `sistema-correos-comprador` F03, y lo que la landing SÍ tiene que decir lo
  // sigue exigiendo `landing.faq.007`, acá abajo.

  // landing.faq.007 — Q1-e, la otra mitad: la landing tiene que DECIRLO. El correo con los números
  // es lo que cierra la promesa que la landing venía haciendo a medias, y si el copy no lo cuenta,
  // la feature existe para nadie. Se exige en los dos lugares que el plan nombró — la FAQ «¿Cómo
  // sabe el comprador…?» y la tarjeta de confianza de los números — porque son los dos sitios donde
  // el lector se hace justo esa pregunta.
  it("la FAQ y la tarjeta de confianza dicen que el Comprador recibe sus números por correo", () => {
    const faq = COPY.FAQ.find((f) =>
      f.pregunta.includes("entró al sorteo"),
    );
    expect(faq).toBeDefined();
    expect(faq!.respuesta).toMatch(/n[úu]meros?/i);
    expect(faq!.respuesta).toMatch(/correo/i);

    const tarjeta = COPY.CONFIANZA[1]!;
    expect(tarjeta.texto).toMatch(/n[úu]meros?/i);
    expect(tarjeta.texto).toMatch(/correo/i);
  });
});

describe("landing/copy — precio y «hazlo tú mismo»", () => {
  // landing.precio.001 — D3/D4/D5/D6: el modelo comercial se imprime COMPLETO, sin "en definición"
  it("la sección precio declara monto, IVA, 2ª tienda, gate de cobro y remate", () => {
    const precio = textos(COPY.PRECIO).join(" | ");
    expect(precio).toContain("$25.000");
    expect(precio).toContain("IVA incluido");
    expect(precio).toMatch(/segunda en adelante, a mitad de precio/i);
    expect(precio).toContain("El plan corre cuando publicas");
    expect(precio).toContain("Menos de mil pesos al día.");
  });

  // landing.precio.002 — el monto es UN dato numérico (fuente del Offer del JSON-LD, F04/I10)
  it("el monto mensual es un número formateado con el helper de moneda (no un string a mano)", () => {
    expect(COPY.PRECIO.montoMensualClp).toBe(25_000);
    expect(COPY.PRECIO.monto).toBe(clp(COPY.PRECIO.montoMensualClp));
  });

  // landing.hazlo.001 — el argumento anti-agencia se hace por CONTRASTE, sin nombrar a nadie
  it("«hazlo tú mismo» no nombra competencia ni enlaza dominios ajenos", () => {
    expect(COPY.HAZLO_TU_MISMO.items).toHaveLength(3);
    const seccion = textos(COPY.HAZLO_TU_MISMO).join(" | ");
    expect(seccion).not.toMatch(/r3q/i);
    expect(seccion).not.toMatch(/https?:\/\/|www\.|\.cl\b|\.com\b/i);
  });
});
