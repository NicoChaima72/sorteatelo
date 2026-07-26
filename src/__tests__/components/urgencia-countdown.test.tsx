import { MantineProvider } from "@mantine/core";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { UrgenciaCountdown } from "~/components/storefront/urgencia-countdown";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { urgenciaCountdownProps } from "~/lib/pagebuilder/widgets";

/**
 * Render de `urgencia_countdown` — las variantes nuevas de `estiloVisual` (builder-countdown-presencia
 * F01/F02) + los GUARDS de la variante `clasico`. Lo que se protege acá es I1: `clasico` conserva su
 * ANATOMÍA (ícono + mensaje + una línea de reloj + CTA, banda/pulso solo por `intensidad`); lo único que
 * cambió con la enmienda D2 del usuario es el TEXTO de esa línea, que ahora lleva minutos y segundos.
 *
 * El sorteo activo se moquea porque es una query tRPC (borde de datos, mismo criterio que
 * `cta-anclas.test.tsx`), y el reloj se congela con `setSystemTime` para que el HTML sea determinista:
 * desde el `AHORA` fijo hasta el `fechaFin` del sorteo faltan exactamente 54d 03h 12m 07s.
 */

const AHORA = new Date("2026-07-26T00:00:00.000Z");
/** +54d 03h 12m 07s exactos desde AHORA (el 18 de septiembre del sorteo real del piloto). */
const FIN = new Date("2026-09-18T03:12:07.000Z");
const RELOJ = "54d 03h 12m 07s";

const sorteo = vi.hoisted(() => ({
  actual: null as null | Record<string, unknown>,
}));

vi.mock("~/components/storefront/use-sorteo-activo", () => ({
  useSorteoActivo: () => ({ data: sorteo.actual, isError: false, isLoading: false }),
}));

const SORTEO_ACTIVO = {
  id: "r1",
  nombre: "Sorteo ARMY",
  premio: "1 entrada para ver a BTS en Santiago",
  fechaInicio: new Date("2026-07-01T00:00:00.000Z"),
  fechaFin: FIN,
  premioImageUrl: null,
  totalParticipaciones: 348,
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  sorteo.actual = SORTEO_ACTIVO;
});
afterAll(() => {
  vi.useRealTimers();
});

const render = (raw: unknown) => {
  const nodo = {
    id: "uc",
    tipo: "urgencia_countdown",
    v: 1,
    props: urgenciaCountdownProps.parse(raw),
  } as Extract<SeccionNode, { tipo: "urgencia_countdown" }>;
  return renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(UrgenciaCountdown, { nodo })),
  );
};

/** `true` sii el string contiene un hex de color — PROHIBIDO en el componente (I4). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

/**
 * `true` sii el HTML no tiene NADA del widget (auto-ocultamiento, I3). No se compara contra `""` porque
 * el `MantineProvider` emite igual su `<style>` de reglas responsive aunque su hijo devuelva null.
 */
function sinWidget(html: string): boolean {
  return !html.includes(RELOJ) && !html.includes(BASE.mensaje) && !html.includes("<section");
}

/**
 * Devuelve el CONTENIDO del bloque `@media (prefers-reduced-motion: no-preference)` de `globals.css`
 * (I5/D6). Se recorta contando llaves en vez de con un regex: lo que se quiere afirmar es que una regla
 * está DENTRO del gate — buscarla en el archivo entero pasaría igual si alguien la sacara afuera.
 */
function gateReducedMotion(): string {
  const css = readFileSync("src/styles/globals.css", "utf8");
  const inicio = css.indexOf("@media (prefers-reduced-motion: no-preference) {");
  expect(inicio).toBeGreaterThan(-1);
  let profundidad = 0;
  for (let i = css.indexOf("{", inicio); i < css.length; i++) {
    if (css[i] === "{") profundidad++;
    if (css[i] === "}") {
      profundidad--;
      if (profundidad === 0) return css.slice(inicio, i);
    }
  }
  throw new Error("El bloque @media de reduced-motion no cierra en globals.css");
}

const BASE = { mensaje: "El sorteo cierra el 18 de septiembre", ctaTexto: "Quiero participar" };

describe("urgencia_countdown — clasico (guards de I1 + enmienda D2)", () => {
  // countdown.clasico.noop.001 — GUARD I1: el doc PREVIO (sin la prop) renderea byte-idéntico al
  // `clasico` explícito. Es el no-op que permite el default sin v-bump.
  it("guard no-op: doc sin la prop == clasico explícito", () => {
    expect(render(BASE)).toBe(render({ ...BASE, estiloVisual: "clasico" }));
  });

  // countdown.clasico.render.001 — la ANATOMÍA de siempre: ícono + mensaje + UNA línea de reloj + CTA.
  // Nada de la gramática nueva (bloques con labels, badge, caption, premio) se filtró al default.
  it("clasico conserva su anatomía: ícono, mensaje, una línea de reloj y CTA", () => {
    const html = render(BASE);

    expect(html).toContain("<svg"); // el IconClock de siempre
    expect(html).toContain("El sorteo cierra el 18 de septiembre");
    expect(html).toContain("Quiero participar");
    expect(html).toContain("tabular-nums");
    // NADA de las variantes nuevas
    expect(html).not.toContain("Días");
    expect(html).not.toContain("Seg");
    expect(html).not.toContain("TIEMPO RESTANTE");
    expect(html).not.toContain("mantine-Badge-root");
    expect(html).not.toContain("1 entrada para ver a BTS en Santiago");
    expect(tieneHex(html)).toBe(false);
  });

  // countdown.clasico.render.002 — ENMIENDA D2 del usuario: el reloj de `clasico` ahora tictaquea con
  // minutos y segundos, en una línea. Es el ÚNICO delta admitido respecto del render previo.
  it("clasico muestra el reloj completo con segundos en una línea (enmienda D2)", () => {
    const html = render(BASE);

    expect(html).toContain(RELOJ);
    expect(html).not.toContain(">54d 03h<"); // el formatoCompacto de antes ya no se usa acá
  });

  // countdown.clasico.render.003 — `intensidad` conserva su significado SOLO en clasico (D7): `fuerte`
  // agrega la banda `superficie_alt` y el pulso; `suave` no.
  it("clasico: intensidad fuerte agrega banda y pulso; suave no", () => {
    const fuerte = render({ ...BASE, intensidad: "fuerte" });
    const suave = render(BASE);

    expect(fuerte).toContain("animar-pulso");
    expect(suave).not.toContain("animar-pulso");
    expect(fuerte).not.toBe(suave);
  });

  // countdown.clasico.oculto.001 — I3: auto-ocultamiento intacto. Sin sorteo ⇒ null; vencido ⇒ null.
  // (El `<style>` de reglas responsive que emite el `MantineProvider` sale igual con el hijo en null,
  //  así que lo que se afirma es que NO sale NADA del widget.)
  it("sin sorteo activo (o vencido) no renderiza nada", () => {
    sorteo.actual = null;
    expect(sinWidget(render(BASE))).toBe(true);

    sorteo.actual = { ...SORTEO_ACTIVO, fechaFin: new Date("2026-07-25T00:00:00.000Z") }; // pasado
    expect(sinWidget(render(BASE))).toBe(true);

    sorteo.actual = SORTEO_ACTIVO; // restaura para los tests siguientes
  });
});

describe("urgencia_countdown — variante panel (F01/D1)", () => {
  // countdown.panel.render.001 — el reloj por BLOQUES: los 4 con su label, los segundos incluidos, y la
  // línea de `clasico` ya no aparece (son dos gramáticas distintas del mismo dato).
  it("panel muestra los 4 bloques D/H/M/S con sus labels y los segundos", () => {
    const html = render({ ...BASE, estiloVisual: "panel" });

    for (const label of ["Días", "Horas", "Min", "Seg"]) expect(html).toContain(label);
    for (const valor of ["54", "03", "12", "07"]) expect(html).toContain(`>${valor}<`);
    expect(html).not.toContain(RELOJ); // la línea es de `clasico`
    expect(html).toContain("tabular-nums");
    expect(tieneHex(html)).toBe(false); // I4
  });

  // countdown.panel.render.002 — es la variante INTERMEDIA (D1): sin badge y sin nombre del premio. Y
  // conserva el `mensaje` que el Organizador escribió (cambiar de variante no le borra su copy).
  it("panel no trae badge ni premio, pero conserva el mensaje del Organizador", () => {
    const html = render({ ...BASE, estiloVisual: "panel" });

    expect(html).toContain("El sorteo cierra el 18 de septiembre");
    expect(html).not.toContain("mantine-Badge-root");
    expect(html).not.toContain("1 entrada para ver a BTS en Santiago");
    expect(html).not.toContain("TIEMPO RESTANTE");
  });

  // countdown.panel.render.003 — la banda translúcida: superficie con `color-mix` sobre el fondo del
  // tenant (nunca un color propio), y el CTA solo existe si hay `ctaTexto`.
  it("panel pinta una banda translúcida por tokens y el CTA es condicional a ctaTexto", () => {
    const conCta = render({ ...BASE, estiloVisual: "panel" });
    expect(conCta).toContain("color-mix");
    expect(conCta).toContain("Quiero participar");

    const sinCta = render({ mensaje: BASE.mensaje, estiloVisual: "panel" });
    expect(sinCta).not.toContain("mantine-Button-root");
    expect(sinCta).toContain("Días"); // el reloj sigue ahí
  });

  // countdown.panel.oculto.001 — I3: el auto-ocultamiento vale en las 3 variantes, no solo en clasico.
  it("panel también se auto-oculta sin sorteo activo", () => {
    sorteo.actual = null;
    expect(sinWidget(render({ ...BASE, estiloVisual: "panel" }))).toBe(true);
    sorteo.actual = SORTEO_ACTIVO;
  });
});

describe("urgencia_countdown — variante tarjeta (F02/D4)", () => {
  // countdown.tarjeta.render.001 — la presencia COMPLETA: badge + premio del sorteo activo + reloj con
  // segundos + caption fija. Todo derivado de datos que YA existen (D4): cero props nuevas.
  it("tarjeta muestra badge, premio del sorteo, reloj con segundos y la caption fija", () => {
    const html = render({ ...BASE, estiloVisual: "tarjeta" });

    expect(html).toContain("mantine-Badge-root");
    expect(html).toContain("El sorteo cierra el 18 de septiembre"); // el badge reusa `mensaje` (D4)
    expect(html).toContain("1 entrada para ver a BTS en Santiago"); // el premio del sorteo ACTIVO
    expect(html).toContain("TIEMPO RESTANTE");
    for (const label of ["Días", "Horas", "Min", "Seg"]) expect(html).toContain(label);
    for (const valor of ["54", "03", "12", "07"]) expect(html).toContain(`>${valor}<`);
    expect(tieneHex(html)).toBe(false); // I4
  });

  // countdown.tarjeta.render.002 — sin `mensaje` el badge cae al default de plataforma (D4), y el reloj
  // va en el ACENTO con fallback a la marca (D5) — nunca un color propio.
  it("sin mensaje el badge cae al default, y el reloj usa el acento con fallback a marca", () => {
    const html = render({ estiloVisual: "tarjeta" });

    expect(html).toContain("El sorteo cierra pronto");
    expect(html).toContain(
      "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))",
    );
  });

  // countdown.tarjeta.render.003 — el CTA es GRANDE (D4: solo crece visualmente) y respeta el ancla,
  // incluida la de RUTA `bases` ⇒ `/bases` (D14, el enlace LEGAL al PDF).
  it("el CTA grande respeta ctaTexto/ctaAncla (bases ⇒ /bases)", () => {
    const conCta = render({ ...BASE, estiloVisual: "tarjeta" });
    expect(conCta).toContain("Quiero participar");
    // El CTA crece en esta variante. Se ata al BOTÓN (el `Container` del wrapper también emite un
    // `data-size="lg"`, así que un `toContain` suelto pasaría sin que el botón hubiera crecido).
    expect(conCta).toMatch(/mantine-Button-root[^>]*data-size="lg"/);
    expect(render({ ...BASE, estiloVisual: "clasico" })).toMatch(
      /mantine-Button-root[^>]*data-size="md"/,
    );
    expect(conCta).toContain('href="#catalogo"');

    expect(render({ ...BASE, estiloVisual: "tarjeta", ctaAncla: "bases" })).toContain('href="/bases"');
    expect(render({ ...BASE, estiloVisual: "tarjeta", ctaAncla: "sorteo" })).toContain('href="#sorteo"');

    const sinCta = render({ mensaje: BASE.mensaje, estiloVisual: "tarjeta" });
    expect(sinCta).not.toContain("mantine-Button-root");
  });

  // countdown.tarjeta.motion.001 — I5/D6: el PULSO de los segundos es decoración y vive en una clase
  // gateada por `prefers-reduced-motion: no-preference`; el TICK del contenido NO depende de la clase
  // (con movimiento reducido el reloj sigue corriendo, solo deja de latir). Se ata el HTML al CSS: la
  // clase que el componente pone es la misma que `globals.css` define DENTRO del gate.
  it("el pulso de los segundos está gateado por reduced-motion y el tick no depende de él", () => {
    const html = render({ ...BASE, estiloVisual: "tarjeta" });

    // (a) la clase cae SOLO en el bloque de los segundos, no en los otros tres
    expect(html.match(/animar-pulso/g) ?? []).toHaveLength(1);
    expect(html).toMatch(/animar-pulso[^>]*>07</);
    // (b) el VALOR de los segundos está en el HTML aunque la animación no corra (el tick es contenido)
    expect(html).toContain(">07<");
    // (c) y la regla vive dentro del gate de reduced-motion en globals.css
    expect(gateReducedMotion()).toContain(".animar-pulso");
  });

  // countdown.tarjeta.oculto.001 — I3: auto-ocultamiento intacto en las 3 variantes (sin sorteo y vencido).
  it("tarjeta también se auto-oculta sin sorteo activo o vencido", () => {
    sorteo.actual = null;
    for (const estiloVisual of ["clasico", "panel", "tarjeta"] as const) {
      expect(sinWidget(render({ ...BASE, estiloVisual })), estiloVisual).toBe(true);
    }

    sorteo.actual = { ...SORTEO_ACTIVO, fechaFin: new Date("2026-07-25T00:00:00.000Z") }; // vencido
    for (const estiloVisual of ["clasico", "panel", "tarjeta"] as const) {
      expect(sinWidget(render({ ...BASE, estiloVisual })), estiloVisual).toBe(true);
    }

    sorteo.actual = SORTEO_ACTIVO;
  });
});
