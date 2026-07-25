import { Box, Container, Group, Text } from "@mantine/core";
import { type CSSProperties, type ReactNode } from "react";

import { Animar } from "~/components/storefront/animar";
import { estiloSeccionACss, resolverResponsive } from "~/styles/estiloSeccion";
import { type EstiloSeccion, type PresetEntrada } from "~/lib/pagebuilder/widgets";

/**
 * Chrome UNIFORME de una sección del storefront (catálogo-v2 F02/D2). Reemplaza el
 * `<Box component="section" py>+<Container>` que cada widget repetía: ahora los widgets sueltan su
 * chrome y devuelven solo su contenido, y este wrapper aplica fondo/spacing/ancho/divisor + el `id`
 * DOM del nodo (para el scroll-to-node del editor, D7) + la animación de entrada (F03).
 *
 * `estilo` ausente ⇒ el descriptor resuelve a los defaults IDÉNTICOS al render previo a este plan
 * (transparente, `py` L, Container lg, sin divisor) — migración no-op (I-H). Cero hex inline: todo el
 * fondo sale de `estiloSeccionACss` (tokens de la escala del tenant, I-A/I-G).
 */
export function SeccionWrapper({
  id,
  estilo,
  divisorColor,
  comoHoja = false,
  children,
}: {
  /** Id estable del nodo (dirección del scroll del editor, D7; también target de nav por id de nodo). */
  id: string;
  estilo?: EstiloSeccion;
  /** Color sólido de la sección SIGUIENTE (fill del divisor inferior — lee como transición). */
  divisorColor?: string;
  /**
   * `true` cuando la sección se renderiza como HOJA dentro de una `fila` (Tanda 3 F08/D14): se DESCARTA
   * todo el chrome de sección (Container, py, fondo, altoMin, entrada, divisor) — el estilo de sección
   * vive en la fila, no por hoja. Solo se conserva el `id` DOM (dirección del nodo). El contenido va en
   * un `<div>` plano ⇒ la hoja hereda el ancho de su columna del Grid.
   */
  comoHoja?: boolean;
  children: ReactNode;
}) {
  // Modo HOJA (F08/D14): sin chrome de sección (Container, py de banda, altoMin, entrada, divisor) — la
  // fila aporta el ancho (columna del Grid) y su propio spacing/entrada. Se conserva SOLO el `id` DOM y,
  // si el widget-hoja trae un `fondo` propio (p.ej. `banner_cta`, cuyo gradiente ES su identidad), ese
  // fondo se pinta como un box con radio + padding legible ⇒ una hoja con fondo no queda transparente
  // ni ilegible (REVISABLE, D14: "sin wrapper propio, salvo que la hoja necesite su fondo").
  if (comoHoja) {
    const rh = estiloSeccionACss(estilo);
    const conFondo = estilo?.fondo !== undefined;
    return (
      <Box
        id={id}
        style={{
          position: "relative",
          ...(conFondo
            ? {
                ...rh.fondo,
                borderRadius: "var(--mantine-radius-lg)",
                paddingInline: "var(--mantine-spacing-lg)",
                paddingBlock: "var(--mantine-spacing-xl)",
              }
            : {}),
        }}
      >
        {children}
      </Box>
    );
  }
  const r = estiloSeccionACss(estilo);
  // `heredar` ⇒ default del TemaPagina (v1: "subir"). El preset animable lo resuelve `<Animar>`.
  const preset: PresetEntrada = r.entrada === "heredar" ? "subir" : (r.entrada as PresetEntrada);

  // Espaciado fino (F06/D6): con `padTop`/`padBottom` presente el wrapper usa `pt`/`pb` independientes;
  // sin overrides usa `py` (byte-idéntico al actual, no-op I-H).
  const padIndependiente = r.pyTop !== undefined || r.pyBottom !== undefined;

  // `anchoFondo` (F02/D4): `completo` (default) ⇒ el fondo va en el `<section>` (full-bleed) = render
  // ACTUAL, byte-idéntico (I-H). `contenido` ⇒ el `<section>` queda transparente y el fondo se pinta en
  // un box del ancho del contenido con radio (sección tipo "card").
  const fondoEnSeccion = r.anchoFondo !== "contenido";

  // Kicker (F15): encabezado pequeño + numeral romano opcional ARRIBA del contenido del widget (el "I EL
  // LIBRO" del prototipo editorial). Ausente ⇒ null (no-op, I-H). El contenido efectivo es kicker+children.
  const cuerpo = r.kicker ? (
    <>
      <KickerSeccion texto={r.kicker.texto} numeral={r.kicker.numeral} estilo={r.kicker.estilo} />
      {children}
    </>
  ) : (
    children
  );

  const inner =
    r.containerSize === false ? (
      cuerpo
    ) : (
      <Container size={r.containerSize} px={{ base: "md", lg: "xl" }}>
        {cuerpo}
      </Container>
    );

  const contenido = fondoEnSeccion ? (
    inner
  ) : (
    <Container
      size={r.containerSize === false ? "lg" : r.containerSize}
      px={{ base: "md", lg: "xl" }}
    >
      <Box
        style={{
          ...r.fondo,
          borderRadius: "var(--mantine-radius-lg)",
          paddingInline: "var(--mantine-spacing-lg)",
          paddingBlock: "var(--mantine-spacing-xl)",
        }}
      >
        {cuerpo}
      </Box>
    </Container>
  );

  // Responsive por nodo (Tanda 3 F10/D17): overrides `movil` + `visibleEn`. Con `movil` presente, el
  // padding y el min-height/flex se manejan por CLASE + custom props (media query en globals.css) en vez
  // de las props inline de Mantine ⇒ SSR-safe sin JS. Sin `movil`/`visibleEn` ⇒ `resp` vacío y el render
  // es byte-idéntico al actual (I-U8). `visibleEn` (ocultamiento por breakpoint) es ortogonal (ambos paths).
  const resp = resolverResponsive(estilo);
  const usaResponsive = estilo?.movil !== undefined;
  const className = resp.clases.length > 0 ? resp.clases.join(" ") : undefined;

  return (
    <Box
      component="section"
      id={id}
      // Contrato del inline editing (Tanda 3 F12/D19): el `data-nodo` en el `<section>` de nivel superior
      // deja que el runtime resuelva el nodo dueño de un `[data-campo]` clickeado. Inerte fuera de preview.
      data-nodo={id}
      className={className}
      // Con overrides móviles el padding lo pone la clase `sx-sec-responsive` (custom props); si no, las
      // props inline de siempre (byte-idéntico).
      py={usaResponsive || padIndependiente ? undefined : r.py}
      pt={!usaResponsive && padIndependiente ? r.pyTop : undefined}
      pb={!usaResponsive && padIndependiente ? r.pyBottom : undefined}
      style={{
        ...(fondoEnSeccion ? r.fondo : {}),
        position: "relative",
        // Custom props responsive (F10/D17): las lee `globals.css` en su media query. Vacío ⇒ sin efecto.
        ...(resp.vars as CSSProperties),
        // Alto mínimo + alineación vertical (F06/D9): solo con `altoMin` presente ⇒ la sección pasa a
        // flex-column para centrar/anclar el contenido. Sin altoMin (default `auto`), NADA de esto se
        // aplica ⇒ layout byte-idéntico al actual (I-H). `svh` no anima (CLS=0, I-C). Con overrides móviles
        // (`usaResponsive`), esto lo maneja la clase `sx-sec-altomin` (media query) ⇒ no se inlinea acá.
        ...(!usaResponsive && r.altoMin
          ? { minHeight: r.altoMin, display: "flex", flexDirection: "column", justifyContent: r.justifyVertical }
          : {}),
      }}
    >
      {/* Entrada on-scroll (F03): SSR-visible + reduced-motion + solo-bajo-el-fold (I-B..I-E). */}
      <Animar preset={preset}>{contenido}</Animar>

      {r.divisor && (
        <DivisorInferior
          forma={r.divisor.forma}
          altura={r.divisor.altura}
          invertir={r.divisor.invertir}
          color={divisorColor ?? "var(--mantine-color-body)"}
        />
      )}
    </Box>
  );
}

/**
 * Color del texto del kicker por `estilo` (Tanda 2 F16). `dimmed` (default) = sin color explícito (el
 * `c="dimmed"` de siempre — editorial intacto, no-op I-H). `marca` = token del primario. `acento` = token
 * de la escala acento con FALLBACK a marca (I-T2). Espeja `colorEyebrow` del hero. Cero hex (I-A).
 */
function colorKicker(estilo: string): string | undefined {
  switch (estilo) {
    case "acento":
      return "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";
    case "marca":
      return "var(--mantine-primary-color-filled)";
    case "dimmed":
    default:
      return undefined; // hereda el dimmed del <Text c="dimmed">
  }
}

/**
 * Kicker de sección (Tanda 2 F15/fidelidad editorial): numeral romano opcional (serif itálico, color de
 * marca) + texto en MAYÚSCULAS con tracking — el "I EL LIBRO / II ELIGE TU PACK" del prototipo editorial.
 * El color del texto sale de `estilo` (dimmed/marca/acento, Tanda 2 F16): default `dimmed` = gris de
 * siempre; `acento` = los kickers ROSA por sección del prototipo dreamy. Texto plano (schema, nunca HTML
 * del tenant, I3); el numeral usa la display font del tema (Playfair) por `--mantine-font-family-headings`.
 * Cero hex (tokens de marca, I-A).
 */
function KickerSeccion({ texto, numeral, estilo }: { texto: string; numeral: string; estilo: string }) {
  const color = colorKicker(estilo);
  return (
    <Group gap="sm" align="baseline" mb="xs" wrap="nowrap">
      {numeral !== "ninguno" && (
        <Text
          span
          fw={700}
          style={{
            fontFamily: "var(--mantine-font-family-headings)",
            fontStyle: "italic",
            color: "var(--mantine-primary-color-filled)",
          }}
        >
          {numeral}
        </Text>
      )}
      <Text
        span
        fw={600}
        size="sm"
        c={color ? undefined : "dimmed"}
        tt="uppercase"
        style={{ letterSpacing: "0.18em", ...(color ? { color } : {}) }}
      >
        {texto}
      </Text>
    </Group>
  );
}

// ── Divisores de forma (SVG generado por NOSOTROS, nunca markup del tenant) ────────────────────
// Las 5 formas del enum dibujan (F09c cerró triangulo/perforacion). viewBox fijo
// 0 0 1200 120; `preserveAspectRatio="none"` estira a lo ancho. El fill = color de la sección
// SIGUIENTE (transición). Solo `transform` en `invertir` (CLS=0, I-C).

/** Borde de ticket: 10 muescas semicirculares (perforación) sobre la línea y=84. */
const PATH_PERFORACION = (() => {
  const r = 26;
  const y = 84;
  let d = `M0,${y}`;
  for (let k = 0; k < 10; k++) {
    const c = 60 + 120 * k;
    d += ` L${c - r},${y} A${r},${r} 0 0 1 ${c + r},${y}`;
  }
  return d + ` L1200,${y} L1200,120 L0,120 Z`;
})();

const PATHS_DIVISOR: Record<string, string | undefined> = {
  onda: "M0,60 C200,110 400,10 600,60 C800,110 1000,10 1200,60 L1200,120 L0,120 Z",
  diagonal: "M0,120 L1200,20 L1200,120 Z",
  curva: "M0,120 Q600,0 1200,120 Z",
  triangulo: "M0,120 L600,10 L1200,120 Z",
  perforacion: PATH_PERFORACION,
};

const ALTURA_DIVISOR_PX: Record<string, number> = { s: 40, m: 70, l: 100 };

function DivisorInferior({
  forma,
  altura,
  invertir,
  color,
}: {
  forma: string;
  altura: string;
  invertir: boolean;
  color: string;
}) {
  const d = PATHS_DIVISOR[forma];
  if (!d) return null; // forma sin soporte en F02 ⇒ sin divisor (degradación)
  const h = ALTURA_DIVISOR_PX[altura] ?? ALTURA_DIVISOR_PX.m!;
  return (
    <Box
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        lineHeight: 0,
        pointerEvents: "none",
        ...(invertir ? { transform: "scaleX(-1)" } : {}),
      }}
    >
      <svg
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: h }}
      >
        <path d={d} fill={color} />
      </svg>
    </Box>
  );
}
