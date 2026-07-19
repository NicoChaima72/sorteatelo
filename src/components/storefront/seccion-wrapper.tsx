import { Box, Container } from "@mantine/core";
import { type ReactNode } from "react";

import { Animar } from "~/components/storefront/animar";
import { estiloSeccionACss } from "~/styles/estiloSeccion";
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
  ancla,
  divisorColor,
  children,
}: {
  /** Id estable del nodo (dirección del scroll del editor, D7). */
  id: string;
  estilo?: EstiloSeccion;
  /** Ancla semántica de navegación (`catalogo`/`sorteo`/`como-funciona`); se emite como scroll target. */
  ancla?: string;
  /** Color sólido de la sección SIGUIENTE (fill del divisor inferior — lee como transición). */
  divisorColor?: string;
  children: ReactNode;
}) {
  const r = estiloSeccionACss(estilo);
  // `heredar` ⇒ default del TemaPagina (v1: "subir"). El preset animable lo resuelve `<Animar>`.
  const preset: PresetEntrada = r.entrada === "heredar" ? "subir" : (r.entrada as PresetEntrada);

  const contenido =
    r.containerSize === false ? (
      children
    ) : (
      <Container size={r.containerSize} px={{ base: "md", lg: "xl" }}>
        {children}
      </Container>
    );

  return (
    <Box
      component="section"
      id={id}
      py={r.py}
      style={{ ...r.fondo, position: "relative" }}
    >
      {/* Ancla semántica de navegación (scroll target; el id del nodo va en el <section>). */}
      {ancla && (
        <span
          id={ancla}
          aria-hidden
          style={{ position: "absolute", top: 0, left: 0 }}
        />
      )}

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
