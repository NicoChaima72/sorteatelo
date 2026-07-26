import { describe, expect, it } from "vitest";

import * as COPY from "~/components/landing/copy";
import { APP_CONFIG } from "~/config/app";
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

  // landing.faq.004 — I9: no prometer lo que el producto no hace (1 sorteo ACTIVO por tienda, solo PDF)
  it("responde honesto sobre los límites reales del producto", () => {
    const sorteos = COPY.FAQ.find((f) => f.pregunta === "¿Puedo hacer más de un sorteo?");
    expect(sorteos?.respuesta).toMatch(/un sorteo activo a la vez/i);

    const vender = COPY.FAQ.find((f) => f.pregunta === "¿Qué puedo vender?");
    expect(vender?.respuesta).toMatch(/PDF/);
  });

  // landing.faq.005 — I9, regresión REAL encontrada en review (dos veces, con dos mentiras
  // distintas). El `RaffleEntry.ordinal` se genera automático al pagar, pero **NINGUNA superficie lo
  // muestra**: ni la pantalla de retorno del Comprador (`src/pages/checkout/retorno.tsx`), ni su
  // correo (`src/server/domain/correo/plantillaDescarga.ts`), ni el panel del Organizador
  // (`src/server/domain/panel/getSorteoDelPanel.ts` agrupa por correo y devuelve CONTEO de tickets;
  // `src/pages/admin/sorteo.tsx` pinta Cliente / Tickets / Última participación). Tampoco hay cuenta
  // de Comprador donde consultarlo (ADR-0004).
  //
  // Los patrones son ESTRECHOS a propósito — una ventana de proximidad genérica daba falsos
  // positivos sobre frases que sí son ciertas: "sortea entre esos números y te muestra el resultado"
  // (se muestra el RESULTADO, no el número) y "queda marcado tal cual en tu panel — sin números
  // fantasma" (habla de que NO se crean participaciones). Lo prohibido es la construcción «alguien
  // VE el número» / «el número está EN tal pantalla». Este test se borra el día que alguna
  // superficie muestre el ordinal de verdad.
  it("no promete que el número de cada compra sea visible en alguna pantalla", () => {
    const PROHIBIDOS = [
      // "ve su número", "muestra el número", "ves los números"
      /\b(ve|ves|vea|ver|verá|muestra|mostramos|mostrar)\s+(su|el|los|tu|sus)?\s*n[úu]meros?\b/i,
      // "número en pantalla", "números en tu panel", "su número correlativo en tu panel"
      // (el `\w+` opcional deja pasar un adjetivo entre medio: «número CORRELATIVO en tu panel»)
      /n[úu]meros?(\s+\w+)?\s+(en pantalla|en tu panel|en el panel|en su correo|en el correo)/i,
      // "los números los ves", "el número lo ve"
      /n[úu]meros?\s+(los|lo|las)\s+(ves|ve|vemos|ven)\b/i,
    ];
    const promesas = LANDING.filter((t) => PROHIBIDOS.some((re) => re.test(t)));
    expect(promesas).toEqual([]);
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
