import { describe, expect, it } from "vitest";

import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  catalogoProps,
  comoFuncionaProps,
  estadisticasProps,
  heroProps,
  imagenDestacadaProps,
  momentoTicketProps,
  packsPrecioProps,
  productoSpotlightProps,
  vitrinaProximamenteProps,
  WIDGET_META,
  WIDGET_REGISTRY,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests de los widgets/props NUEVOS de la Tanda 2 de fidelidad (los 6 gaps del feature-tester de la
 * Tanda 1). Verifican el CHECKLIST INVARIANTE: props `.strict()` (rechazo de HTML/campo extra), enums
 * cerrados, límites de cantidad/longitud, migración no-op (defaults = look actual), y que el nodo
 * parsea contra la union de secciones. Puro Zod, sin DB. El render (grayscale/candado/holocard) y la
 * fidelidad visual se validan en runtime/E2E (F09/F10).
 */

describe("pagebuilder/tanda2 (F01) — vitrina_proximamente (lanzamientos bloqueados)", () => {
  // page.tanda2.vitrina.001 — valida titulo/columnas/items/notaPie, límites y .strict()
  it("vitrina_proximamente valida items 1–8, textos con límite y rechaza campos extra", () => {
    const ok = {
      titulo: "Un libro a la vez",
      columnas: 3,
      items: [
        { titulo: "I. Claude", subtitulo: "Próximamente", imagenUrl: "https://cdn.example/1.jpg" },
        { titulo: "Rezado" },
      ],
      notaPie: "Publicamos un libro por temporada.",
    };
    expect(vitrinaProximamenteProps.safeParse(ok).success).toBe(true);
    // solo items (titulo/notaPie/columnas opcionales-con-default)
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "Uno" }] }).success).toBe(true);
    // 0 items / más de 8 ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ items: [] }).success).toBe(false);
    expect(
      vitrinaProximamenteProps.safeParse({ items: Array(9).fill({ titulo: "x" }) }).success,
    ).toBe(false);
    // titulo item >60 / subtitulo >80 / titulo sección >80 ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "x".repeat(61) }] }).success).toBe(false);
    expect(
      vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok", subtitulo: "x".repeat(81) }] }).success,
    ).toBe(false);
    expect(vitrinaProximamenteProps.safeParse({ titulo: "x".repeat(81), items: [{ titulo: "ok" }] }).success).toBe(false);
    // notaPie >120 ⇒ rechazo
    expect(
      vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok" }], notaPie: "x".repeat(121) }).success,
    ).toBe(false);
    // columnas fuera de {2,3,4} ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ columnas: 5, items: [{ titulo: "ok" }] }).success).toBe(false);
    // imagenUrl no-url ⇒ rechazo
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok", imagenUrl: "no-url" }] }).success).toBe(false);
    // HTML/campo extra ⇒ rechazo (.strict, en item y en el widget)
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok", html: "<b>x</b>" }] }).success).toBe(false);
    expect(vitrinaProximamenteProps.safeParse({ items: [{ titulo: "ok" }], html: "<b>x</b>" }).success).toBe(false);
  });

  // page.tanda2.vitrina.002 — el nodo parsea contra la union; está en el registro + WIDGET_META; defaultProps parsea
  it("el nodo vitrina_proximamente parsea contra la union y está en el registro/meta", () => {
    const nodo = { id: "vp", tipo: "vitrina_proximamente", v: 1, props: { items: [{ titulo: "Uno" }] } };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
    // registro: defaultProps parsea contra su propio schema
    const def = WIDGET_REGISTRY.vitrina_proximamente;
    expect(def.categoria).toBe("seccion");
    expect(def.propsSchema.safeParse(def.defaultProps).success).toBe(true);
    // metadata display existe y no es el tipo crudo
    expect(WIDGET_META.vitrina_proximamente.titulo.trim().length).toBeGreaterThan(0);
    expect(WIDGET_META.vitrina_proximamente.titulo).not.toBe("vitrina_proximamente");
  });
});

describe("pagebuilder/tanda2 (F02) — hero split visual configurable", () => {
  // page.tanda2.herovisual.001 — visual imagen/tarjeta parsea; sin visual (no-op) parsea; ramas inválidas rechazan
  it("heroProps.visual valida imagen/tarjeta, es opcional (no-op) y rechaza ramas inválidas", () => {
    const base = { titulo: { children: [{ t: "Hola" }] } };
    // sin visual: un hero previo parsea igual (no-op)
    expect(heroProps.safeParse(base).success).toBe(true);
    // visual imagen
    expect(
      heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://cdn.example/x.jpg", holo: true } }).success,
    ).toBe(true);
    // visual tarjeta (holocard SIN imagen, con título/ícono dentro)
    expect(
      heroProps.safeParse({
        ...base,
        visual: { tipo: "tarjeta", titulo: "PDF descargable", subtitulo: "ES / EN", icono: "descarga", holo: true },
      }).success,
    ).toBe(true);
    // tarjeta mínima (solo titulo)
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "Solo" } }).success).toBe(true);
    // tipo desconocido ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "video", url: "https://x.co" } }).success).toBe(false);
    // imagen sin url / url inválida ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen" } }).success).toBe(false);
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "no-url" } }).success).toBe(false);
    // tarjeta con icono fuera de ICONOS_BENEFICIO ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "ok", icono: "unicornio" } }).success).toBe(false);
    // tarjeta titulo >60 / subtitulo >80 ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "x".repeat(61) } }).success).toBe(false);
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "ok", subtitulo: "x".repeat(81) } }).success).toBe(false);
    // campo extra en la rama ⇒ rechazo (.strict)
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://x.co", css: "x" } }).success).toBe(false);
  });

  // page.tanda2.herovisual.002 (F12) — la tarjeta gana `estilo` (plano/suave); default plano (no-op v1)
  it("visual tarjeta acepta estilo plano|suave, default plano (no-op)", () => {
    const base = { titulo: { children: [{ t: "Hola" }] } };
    // sin estilo ⇒ default plano (look actual)
    const parsed = heroProps.parse({ ...base, visual: { tipo: "tarjeta", titulo: "T" } });
    expect(parsed.visual).toMatchObject({ tipo: "tarjeta", estilo: "plano" });
    for (const est of ["plano", "suave"] as const) {
      expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "T", estilo: est } }).success).toBe(true);
    }
    // estilo fuera del enum ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "T", estilo: "glass" } }).success).toBe(false);
    // `estilo` NO existe en la rama imagen (.strict) ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://x.co", estilo: "suave" } }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F03) — ancho card en imagen_destacada", () => {
  // page.tanda2.ancho.001 — el enum ancho gana `card`; default sigue `contenido`; no-op v1
  it("imagen_destacada.ancho acepta card|contenido|completo, default contenido (no-op)", () => {
    const base = { imagenUrl: "https://cdn.example/x.jpg", alt: "Una imagen" };
    // v1 sin ancho ⇒ default contenido (no-op)
    expect(imagenDestacadaProps.parse(base).ancho).toBe("contenido");
    for (const ancho of ["card", "contenido", "completo"] as const) {
      expect(imagenDestacadaProps.safeParse({ ...base, ancho }).success).toBe(true);
    }
    // valor fuera del enum ⇒ rechazo
    expect(imagenDestacadaProps.safeParse({ ...base, ancho: "gigante" }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F12) — packs_precio (tarjetas de precio)", () => {
  // page.tanda2.packs.001 — valida items 1–4, precio int, destacado/badge/cta opcionales, límites y .strict()
  it("packs_precio valida items 1–4, precio entero y campos opcionales, rechaza extras", () => {
    const ok = {
      titulo: "Más libros, más chances",
      items: [
        { titulo: "1 libro", precio: 3000, detalle: "1 participación", ctaTexto: "Comprar" },
        { titulo: "Pack 4 libros", precio: 10000, detalle: "4 participaciones", destacado: true, badge: "MÁS ELEGIDO", ctaTexto: "Comprar" },
      ],
    };
    expect(packsPrecioProps.safeParse(ok).success).toBe(true);
    // item mínimo (titulo + precio); destacado default false; ctaAncla default catalogo
    const min = packsPrecioProps.parse({ items: [{ titulo: "Uno", precio: 1000 }] });
    expect(min.items[0]!.destacado).toBe(false);
    expect(min.items[0]!.ctaAncla).toBe("catalogo");
    // 0 items / más de 4 ⇒ rechazo
    expect(packsPrecioProps.safeParse({ items: [] }).success).toBe(false);
    expect(packsPrecioProps.safeParse({ items: Array(5).fill({ titulo: "x", precio: 1 }) }).success).toBe(false);
    // precio no-entero / negativo ⇒ rechazo (dominio con dinero: entero limpio)
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 10.5 }] }).success).toBe(false);
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: -1 }] }).success).toBe(false);
    // titulo >40 / detalle >80 / badge >20 / ctaTexto >30 ⇒ rechazo
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x".repeat(41), precio: 1 }] }).success).toBe(false);
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 1, detalle: "y".repeat(81) }] }).success).toBe(false);
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 1, badge: "y".repeat(21) }] }).success).toBe(false);
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 1, ctaTexto: "y".repeat(31) }] }).success).toBe(false);
    // ctaAncla fuera del enum ⇒ rechazo
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 1, ctaAncla: "otro" }] }).success).toBe(false);
    // HTML/campo extra ⇒ rechazo (.strict, en item y en el widget)
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 1, html: "<b>x</b>" }] }).success).toBe(false);
    expect(packsPrecioProps.safeParse({ items: [{ titulo: "x", precio: 1 }], html: "<b>x</b>" }).success).toBe(false);
  });

  // page.tanda2.packs.002 — el nodo parsea contra la union; está en el registro + WIDGET_META; defaultProps parsea
  it("el nodo packs_precio parsea contra la union y está en el registro/meta", () => {
    const nodo = { id: "pp", tipo: "packs_precio", v: 1, props: { items: [{ titulo: "Uno", precio: 1000 }] } };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
    const def = WIDGET_REGISTRY.packs_precio;
    expect(def.categoria).toBe("seccion");
    expect(def.propsSchema.safeParse(def.defaultProps).success).toBe(true);
    expect(WIDGET_META.packs_precio.titulo).not.toBe("packs_precio");
  });
});

describe("pagebuilder/tanda2 (F12) — momento_ticket (¡estás dentro!)", () => {
  // page.tanda2.momento.001 — valida titulo/codigoEjemplo requeridos, etiqueta/cta/nota opcionales, límites, .strict()
  it("momento_ticket valida los campos con límite y rechaza extras", () => {
    const ok = {
      titulo: "¡Estás dentro! 💜",
      etiqueta: "Tu número de sorteo:",
      codigoEjemplo: "ARMY-04821",
      ctaTexto: "Compartir y sumar más chances",
      nota: "Número de ejemplo.",
    };
    expect(momentoTicketProps.safeParse(ok).success).toBe(true);
    // mínimo: titulo + codigoEjemplo; ctaAncla default catalogo
    const min = momentoTicketProps.parse({ titulo: "Dentro", codigoEjemplo: "X-1" });
    expect(min.ctaAncla).toBe("catalogo");
    // faltan requeridos ⇒ rechazo
    expect(momentoTicketProps.safeParse({ titulo: "solo" }).success).toBe(false);
    expect(momentoTicketProps.safeParse({ codigoEjemplo: "solo" }).success).toBe(false);
    // titulo >60 / etiqueta >40 / codigoEjemplo >20 / ctaTexto >30 / nota >120 ⇒ rechazo
    expect(momentoTicketProps.safeParse({ titulo: "x".repeat(61), codigoEjemplo: "X" }).success).toBe(false);
    expect(momentoTicketProps.safeParse({ titulo: "x", codigoEjemplo: "X", etiqueta: "y".repeat(41) }).success).toBe(false);
    expect(momentoTicketProps.safeParse({ titulo: "x", codigoEjemplo: "y".repeat(21) }).success).toBe(false);
    expect(momentoTicketProps.safeParse({ titulo: "x", codigoEjemplo: "X", ctaTexto: "y".repeat(31) }).success).toBe(false);
    expect(momentoTicketProps.safeParse({ titulo: "x", codigoEjemplo: "X", nota: "y".repeat(121) }).success).toBe(false);
    // ctaAncla fuera del enum / campo extra ⇒ rechazo
    expect(momentoTicketProps.safeParse({ titulo: "x", codigoEjemplo: "X", ctaAncla: "otro" }).success).toBe(false);
    expect(momentoTicketProps.safeParse({ titulo: "x", codigoEjemplo: "X", html: "<b>x</b>" }).success).toBe(false);
  });

  // page.tanda2.momento.002 — el nodo parsea contra la union; registro + WIDGET_META; defaultProps parsea
  it("el nodo momento_ticket parsea contra la union y está en el registro/meta", () => {
    const nodo = { id: "mt", tipo: "momento_ticket", v: 1, props: { titulo: "Dentro", codigoEjemplo: "X-1" } };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
    const def = WIDGET_REGISTRY.momento_ticket;
    expect(def.categoria).toBe("seccion");
    expect(def.propsSchema.safeParse(def.defaultProps).success).toBe(true);
    expect(WIDGET_META.momento_ticket.titulo).not.toBe("momento_ticket");
  });
});

describe("pagebuilder/tanda2 (F12) — estadisticas tarjetas_suaves", () => {
  // page.tanda2.stats.001 — el enum estiloVisual gana `tarjetas_suaves`; default sigue `cards` (no-op)
  it("estadisticas.estiloVisual acepta tarjetas_suaves; default cards (no-op)", () => {
    const base = { items: [{ valor: 1, etiqueta: "a" }, { valor: 2, etiqueta: "b" }] };
    expect(estadisticasProps.parse(base).estiloVisual).toBe("cards"); // no-op v1
    for (const est of ["cards", "simple", "tarjetas_suaves"] as const) {
      expect(estadisticasProps.safeParse({ ...base, estiloVisual: est }).success).toBe(true);
    }
    expect(estadisticasProps.safeParse({ ...base, estiloVisual: "neon" }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F17) — estadisticas estilo dreamy + notaPie", () => {
  const base = { items: [{ valor: 1, etiqueta: "a" }, { valor: 2, etiqueta: "b" }] };

  // page.tanda2.stats.dreamy.001 — el enum estiloVisual gana `dreamy`; default sigue `cards` (no-op I-H);
  // los 4 valores válidos, fuera del enum ⇒ rechazo. El estilo nuevo NO cambia el default.
  it("estadisticas.estiloVisual acepta dreamy; default sigue cards (no-op)", () => {
    expect(estadisticasProps.parse(base).estiloVisual).toBe("cards"); // migración no-op
    for (const est of ["cards", "simple", "tarjetas_suaves", "dreamy"] as const) {
      expect(estadisticasProps.safeParse({ ...base, estiloVisual: est }).success).toBe(true);
    }
    expect(estadisticasProps.safeParse({ ...base, estiloVisual: "neon" }).success).toBe(false);
  });

  // page.tanda2.stats.dreamy.001 — `notaPie` opcional ≤40; ausente = no-op; vacío/>40 ⇒ rechazo; .strict()
  it("estadisticas.notaPie es opcional (≤40); ausente cae a undefined; excesos rechazados", () => {
    expect(estadisticasProps.parse(base).notaPie).toBeUndefined(); // no-op (docs previos)
    expect(estadisticasProps.safeParse({ ...base, notaPie: "Cifras de ejemplo" }).success).toBe(true);
    expect(estadisticasProps.safeParse({ ...base, notaPie: "x".repeat(40) }).success).toBe(true);
    expect(estadisticasProps.safeParse({ ...base, notaPie: "x".repeat(41) }).success).toBe(false); // >40
    expect(estadisticasProps.safeParse({ ...base, notaPie: "" }).success).toBe(false); // min 1
    // .strict() se conserva: un campo desconocido sigue rechazado
    expect(estadisticasProps.safeParse({ ...base, foo: 1 }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F13) — catalogo layout grilla|carrusel", () => {
  // page.tanda2.catalogo.001 — el enum layout gana grilla|carrusel; default grilla (no-op v1)
  it("catalogo.layout acepta grilla|carrusel, default grilla (no-op)", () => {
    // v1 sin layout ⇒ default grilla (no-op, migración I-H)
    expect(catalogoProps.parse({}).layout).toBe("grilla");
    for (const layout of ["grilla", "carrusel"] as const) {
      expect(catalogoProps.safeParse({ layout }).success).toBe(true);
    }
    // valor fuera del enum ⇒ rechazo
    expect(catalogoProps.safeParse({ layout: "masonry" }).success).toBe(false);
    // campo extra ⇒ rechazo (.strict)
    expect(catalogoProps.safeParse({ layout: "grilla", html: "<b>x</b>" }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F13) — hero visual tarjeta motivo (decoración flotante)", () => {
  // page.tanda2.herovisual.003 — la tarjeta gana `motivo` (corazon/tickets/estrella); default corazon (no-op)
  it("visual tarjeta acepta motivo corazon|tickets|estrella, default corazon (no-op)", () => {
    const base = { titulo: { children: [{ t: "Hola" }] } };
    // sin motivo ⇒ default corazon (el look suave actual, sin chips flotantes extra)
    const parsed = heroProps.parse({ ...base, visual: { tipo: "tarjeta", titulo: "T", estilo: "suave" } });
    expect(parsed.visual).toMatchObject({ tipo: "tarjeta", motivo: "corazon" });
    for (const motivo of ["corazon", "tickets", "estrella"] as const) {
      expect(
        heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "T", estilo: "suave", motivo } }).success,
      ).toBe(true);
    }
    // motivo fuera del enum ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "T", motivo: "fuego" } }).success).toBe(false);
    // `motivo` NO existe en la rama imagen (.strict) ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://x.co", motivo: "tickets" } }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F04) — eyebrowEstilo del hero", () => {
  // page.tanda2.eyebrow.001 — eyebrowEstilo default marca; acepta acento/texto; no-op v1
  it("heroProps.eyebrowEstilo default marca, acepta acento/texto, rechaza fuera del enum", () => {
    const base = { titulo: { children: [{ t: "Hola" }] } };
    // sin el campo ⇒ default marca (no-op)
    expect(heroProps.parse(base).eyebrowEstilo).toBe("marca");
    for (const est of ["marca", "acento", "texto"] as const) {
      expect(heroProps.safeParse({ ...base, eyebrowEstilo: est }).success).toBe(true);
    }
    expect(heroProps.safeParse({ ...base, eyebrowEstilo: "neon" }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F15) — hero tituloTamano + tituloMayusculas (impacto concert)", () => {
  // page.tanda2.titulo.001 — el hero gana tituloTamano (normal|grande|enorme) + tituloMayusculas (bool);
  // ambos con default no-op (normal/false). Un hero previo sin ellos parsea idéntico (I-H).
  it("heroProps.tituloTamano default normal + tituloMayusculas default false (no-op); enums cerrados", () => {
    const base = { titulo: { children: [{ t: "Compra el libro. Anda a ver a BTS." }] } };
    const def = heroProps.parse(base);
    expect(def.tituloTamano).toBe("normal");
    expect(def.tituloMayusculas).toBe(false);
    for (const t of ["normal", "grande", "enorme"] as const) {
      expect(heroProps.safeParse({ ...base, tituloTamano: t }).success).toBe(true);
    }
    // tamaño fuera del enum ⇒ rechazo; tituloMayusculas no-boolean ⇒ rechazo
    expect(heroProps.safeParse({ ...base, tituloTamano: "gigante" }).success).toBe(false);
    expect(heroProps.safeParse({ ...base, tituloMayusculas: "si" }).success).toBe(false);
    expect(heroProps.safeParse({ ...base, tituloMayusculas: true, tituloTamano: "enorme" }).success).toBe(true);
  });
});

describe("pagebuilder/tanda2 (F15) — como_funciona layout tarjetas|lista (método editorial)", () => {
  // page.tanda2.comofunciona.001 — el enum layout gana tarjetas|lista; default tarjetas (no-op v1)
  it("como_funciona.layout acepta tarjetas|lista, default tarjetas (no-op)", () => {
    expect(comoFuncionaProps.parse({ titulo: "Cómo funciona" }).layout).toBe("tarjetas");
    for (const layout of ["tarjetas", "lista"] as const) {
      expect(comoFuncionaProps.safeParse({ titulo: "T", layout }).success).toBe(true);
    }
    expect(comoFuncionaProps.safeParse({ titulo: "T", layout: "columnas" }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F15) — producto_spotlight (el objeto del deseo)", () => {
  // page.tanda2.spotlight.001 — valida titulo/productoId/autoria/cta opcionales, límites y .strict()
  it("producto_spotlight valida campos opcionales con límite, productoId cuid, y rechaza extras", () => {
    // todo opcional (productoId ausente ⇒ el render usa el 1er producto) — ctaAncla default catalogo
    const min = productoSpotlightProps.parse({});
    expect(min.ctaAncla).toBe("catalogo");
    const ok = {
      titulo: "El objeto del deseo",
      productoId: "clemp=0000000000000000000000", // se valida como cuid abajo con uno real
      autoria: "por la autora",
      ctaTexto: "Quiero este",
    };
    // productoId debe ser cuid (formato Prisma) ⇒ un cuid válido parsea, un no-cuid rechaza
    expect(productoSpotlightProps.safeParse({ productoId: "cjld2cjxh0000qzrmn831i7rn" }).success).toBe(true);
    expect(productoSpotlightProps.safeParse({ productoId: "no-es-cuid" }).success).toBe(false);
    void ok;
    // límites: titulo >80 / autoria >60 / ctaTexto >30 ⇒ rechazo
    expect(productoSpotlightProps.safeParse({ titulo: "x".repeat(81) }).success).toBe(false);
    expect(productoSpotlightProps.safeParse({ autoria: "x".repeat(61) }).success).toBe(false);
    expect(productoSpotlightProps.safeParse({ ctaTexto: "x".repeat(31) }).success).toBe(false);
    // ctaAncla fuera del enum / campo extra (HTML) ⇒ rechazo (.strict, I2/I3)
    expect(productoSpotlightProps.safeParse({ ctaAncla: "otro" }).success).toBe(false);
    expect(productoSpotlightProps.safeParse({ html: "<b>x</b>" }).success).toBe(false);
    // NO copia precio/titulo del producto al documento (I2): esos campos no existen en el schema
    expect(productoSpotlightProps.safeParse({ precio: 3000 }).success).toBe(false);
  });

  // page.tanda2.spotlight.002 — el nodo parsea contra la union; registro + WIDGET_META; defaultProps parsea
  it("el nodo producto_spotlight parsea contra la union y está en el registro/meta", () => {
    const nodo = { id: "ps", tipo: "producto_spotlight", v: 1, props: {} };
    expect(SeccionNodeSchema.safeParse(nodo).success).toBe(true);
    const def = WIDGET_REGISTRY.producto_spotlight;
    expect(def.categoria).toBe("seccion");
    expect(def.propsSchema.safeParse(def.defaultProps).success).toBe(true);
    expect(WIDGET_META.producto_spotlight.titulo).not.toBe("producto_spotlight");
  });
});

describe("pagebuilder/tanda2 (F16) — hero visual tarjeta contenido (holocard decorativa)", () => {
  // page.tanda2.herovisual.004 — la tarjeta gana `contenido` (texto/emblema); default texto (no-op)
  it("visual tarjeta acepta contenido texto|emblema, default texto (no-op), rechaza extras", () => {
    const base = { titulo: { children: [{ t: "Hola" }] } };
    // sin contenido ⇒ default texto (el look con título/subtítulo actual, no-op I-H)
    const parsed = heroProps.parse({ ...base, visual: { tipo: "tarjeta", titulo: "T" } });
    expect(parsed.visual).toMatchObject({ tipo: "tarjeta", contenido: "texto" });
    for (const contenido of ["texto", "emblema"] as const) {
      expect(
        heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "T", contenido } }).success,
      ).toBe(true);
    }
    // contenido fuera del enum ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "tarjeta", titulo: "T", contenido: "solo_icono" } }).success).toBe(false);
    // `contenido` NO existe en la rama imagen (.strict) ⇒ rechazo
    expect(heroProps.safeParse({ ...base, visual: { tipo: "imagen", url: "https://x.co", contenido: "emblema" } }).success).toBe(false);
  });
});

describe("pagebuilder/tanda2 (F16) — catalogo densidad completa|compacta (BookCard compacto)", () => {
  // page.tanda2.catalogo.002 — el enum densidad gana completa|compacta; default completa (no-op v1)
  it("catalogo.densidad acepta completa|compacta, default completa (no-op)", () => {
    // v1 sin densidad ⇒ default completa (título + descripción bajo la portada, no-op I-H)
    expect(catalogoProps.parse({}).densidad).toBe("completa");
    for (const densidad of ["completa", "compacta"] as const) {
      expect(catalogoProps.safeParse({ densidad }).success).toBe(true);
    }
    // valor fuera del enum ⇒ rechazo
    expect(catalogoProps.safeParse({ densidad: "minima" }).success).toBe(false);
    // campo extra ⇒ rechazo (.strict)
    expect(catalogoProps.safeParse({ densidad: "compacta", html: "<b>x</b>" }).success).toBe(false);
  });
});
