import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import { comoFuncionaProps, faqProps, garantiasSorteoProps } from "~/lib/pagebuilder/widgets";

/**
 * Tests de las props de ESTILO nuevas de la tanda `builder-dreamy-secciones`: el estilo `dreamy` que ya
 * tenía `estadisticas` (Tanda 2 F17) se extiende a `como_funciona` (3er valor de `estiloTarjeta`),
 * `garantias_sorteo` y `faq` (prop nueva `estiloVisual`). El invariante que se verifica en los tres es el
 * mismo (D1/I2): el enum ACEPTA el valor nuevo, el DEFAULT sigue siendo el no-op (⇒ los documentos ya
 * publicados parsean byte-idéntico, sin v-bump), un valor fuera del enum se RECHAZA y `.strict()` sigue
 * en pie. Puro Zod, sin DB; el render se valida en `src/__tests__/components/`.
 */

describe("pagebuilder/dreamy (F01) — como_funciona.estiloTarjeta gana dreamy", () => {
  // page.dreamy.comofunciona.001 — el enum gana `dreamy`; el default sigue `solida` (no-op I-H);
  // fuera del enum ⇒ rechazo; `.strict()` intacto.
  it("estiloTarjeta acepta dreamy; default sigue solida (no-op) y rechaza lo demás", () => {
    // documento PREVIO (sin la prop) ⇒ default intacto: `solida` + layout `tarjetas`
    const previo = comoFuncionaProps.parse({ titulo: "Cómo funciona" });
    expect(previo.estiloTarjeta).toBe("solida");
    expect(previo.layout).toBe("tarjetas");

    for (const est of ["solida", "contorno", "dreamy"] as const) {
      expect(comoFuncionaProps.safeParse({ estiloTarjeta: est }).success).toBe(true);
    }
    expect(comoFuncionaProps.safeParse({ estiloTarjeta: "translucida" }).success).toBe(false);
    // `.strict()` se conserva: un campo desconocido sigue rechazado
    expect(comoFuncionaProps.safeParse({ estiloTarjeta: "dreamy", foo: 1 }).success).toBe(false);
  });

  // page.dreamy.comofunciona.002 — el nodo con el valor nuevo parsea contra la union de secciones
  it("el nodo como_funciona con estiloTarjeta dreamy parsea contra la union", () => {
    const nodo = {
      id: "cf",
      tipo: "como_funciona",
      v: 1,
      props: {
        titulo: "Comprar es participar",
        estiloTarjeta: "dreamy",
        pasos: [{ icono: "compra", titulo: "Compra", desc: "Elige tu libro y paga." }],
      },
    };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
  });
});

describe("pagebuilder/dreamy (F02) — garantias_sorteo gana estiloVisual", () => {
  const base = {
    titulo: "Sorteo 100% transparente",
    items: [{ icono: "escudo", titulo: "En vivo", desc: "Por Instagram, con testigos." }],
  };

  // page.dreamy.garantias.001 — prop NUEVA `estiloVisual`: default `clasico` (docs previos byte-idénticos,
  // sin v-bump), acepta `dreamy`, rechaza lo demás, `.strict()` intacto y el resto del shape sin tocar (I5).
  it("estiloVisual default clasico (no-op), acepta dreamy y rechaza lo demás", () => {
    // documento PREVIO (sin la prop) ⇒ cae al no-op y conserva su contenido
    const previo = garantiasSorteoProps.parse(base);
    expect(previo.estiloVisual).toBe("clasico");
    expect(previo.items).toHaveLength(1);

    for (const est of ["clasico", "dreamy"] as const) {
      expect(garantiasSorteoProps.safeParse({ ...base, estiloVisual: est }).success).toBe(true);
    }
    expect(garantiasSorteoProps.safeParse({ ...base, estiloVisual: "translucido" }).success).toBe(false);
    expect(garantiasSorteoProps.safeParse({ ...base, foo: 1 }).success).toBe(false);
  });

  // page.dreamy.garantias.002 — el nodo con el valor nuevo parsea contra la union de secciones
  it("el nodo garantias_sorteo con estiloVisual dreamy parsea contra la union", () => {
    const nodo = {
      id: "gs",
      tipo: "garantias_sorteo",
      v: 1,
      props: { ...base, metodo: "Sorteo en vivo por Instagram.", estiloVisual: "dreamy" },
    };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
  });
});

describe("pagebuilder/dreamy (F03) — faq gana estiloVisual", () => {
  const base = { items: [{ pregunta: "¿Cómo participo?", respuesta: "Comprando cualquier libro." }] };

  // page.dreamy.faq.001 — prop NUEVA `estiloVisual`: default `clasico` (docs previos byte-idénticos, sin
  // v-bump), acepta `dreamy`, rechaza lo demás, `.strict()` intacto y el shape de `items` sin tocar (I5).
  it("estiloVisual default clasico (no-op), acepta dreamy y rechaza lo demás", () => {
    const previo = faqProps.parse(base);
    expect(previo.estiloVisual).toBe("clasico");
    expect(previo.titulo).toBe("Preguntas frecuentes"); // el default de siempre, intacto
    expect(previo.items).toHaveLength(1);

    for (const est of ["clasico", "dreamy"] as const) {
      expect(faqProps.safeParse({ ...base, estiloVisual: est }).success).toBe(true);
    }
    expect(faqProps.safeParse({ ...base, estiloVisual: "acordeon" }).success).toBe(false);
    expect(faqProps.safeParse({ ...base, foo: 1 }).success).toBe(false);
    // `items` sigue siendo obligatorio (min 1): el estilo no lo vuelve opcional
    expect(faqProps.safeParse({ estiloVisual: "dreamy" }).success).toBe(false);
  });

  // page.dreamy.faq.002 — el nodo con el valor nuevo parsea contra la union de secciones
  it("el nodo faq con estiloVisual dreamy parsea contra la union", () => {
    const nodo = { id: "fq", tipo: "faq", v: 1, props: { ...base, estiloVisual: "dreamy" } };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
  });
});
