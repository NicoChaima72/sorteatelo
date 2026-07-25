import { Fragment, type CSSProperties } from "react";

import { RunsTexto, estiloMarcasRun } from "~/components/storefront/runs-texto";
import { type HeroProps, type RichTexto } from "~/lib/pagebuilder/widgets";

/**
 * Render del título del hero sobre el motor de RUNS (Tanda 3 F02/D4). El título es un `RichTexto` (el
 * viejo `tituloAcento` fue ABSORBIDO en un run con su marca por la migración v2→v3). Devuelve el
 * CONTENIDO a colocar dentro de un `<Title>` (spans), NO el `<Title>` ⇒ testeable con
 * `renderToStaticMarkup` sin provider Mantine.
 *
 * Reglas duras (heredadas del hero puente):
 * - **Jamás HTML del tenant** (I-U1): el contenido son runs de texto plano; el estilo sale por TOKEN
 *   (cero hex, I-A). El acento vive como una marca de run (`acento`/`marca`/`resaltado`/`gradiente`).
 * - **SSR-visible** (I-D): el reveal por palabra es CSS puro (`.animar-revelar-palabra`, delay inline);
 *   el `opacity:0` vive en el keyframe gateado de globals.css, NUNCA inline ⇒ el HTML SSR sale visible.
 * - **reduced-motion** (I-B): las clases de animación están gateadas por la media query ⇒ estático.
 */

type EfectoTitulo = HeroProps["efectoTitulo"];

/** CSS del título completo con gradiente ANIMADO (efectoTitulo). El gradiente es VISIBLE con
 *  reduced-motion; solo la animación de posición la agrega la clase `animar-holo` (gateada). */
const GRADIENTE_ANIMADO_CSS: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, var(--mantine-primary-color-filled), var(--mantine-color-acento-filled, var(--mantine-primary-color-6)), var(--mantine-primary-color-filled))",
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

/** Parte un string conservando los espacios (tokens de whitespace intercalados). PURO. */
export function partirEnPalabras(texto: string): string[] {
  return texto.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Texto plano de un RichTexto (concatena los runs). Para el efecto `gradiente_animado`. PURO. */
export function textoPlanoDeRuns(rico: RichTexto): string {
  return rico.children.map((r) => r.t).join("");
}

export function TituloHero({
  titulo,
  efecto,
}: {
  titulo: RichTexto;
  efecto: EfectoTitulo;
}) {
  // Gradiente animado: todo el título como gradiente (las marcas por-run se subsumen en el gradiente —
  // mismo comportamiento que el hero previo, donde el efecto ganaba sobre `tituloAcento`).
  if (efecto === "gradiente_animado") {
    return (
      <span className="animar-holo" style={GRADIENTE_ANIMADO_CSS}>
        {textoPlanoDeRuns(titulo)}
      </span>
    );
  }

  // Reveal por palabra: cada palabra un span con delay escalonado; las palabras de un run con marca
  // heredan el estilo de la marca (p.ej. el run del acento queda coloreado dentro del reveal).
  if (efecto === "revelar_palabras") {
    let iPalabra = 0;
    return (
      <>
        {titulo.children.map((run, ri) => {
          const estilo = estiloMarcasRun(run.m);
          return partirEnPalabras(run.t).map((token, ti) => {
            if (/^\s+$/.test(token)) return <Fragment key={`${ri}-${ti}`}>{token}</Fragment>;
            const delay = `${Math.min(iPalabra++, 12) * 0.07}s`;
            return (
              <span
                key={`${ri}-${ti}`}
                className="animar-revelar-palabra"
                style={{ animationDelay: delay, ...estilo }}
              >
                {token}
              </span>
            );
          });
        })}
      </>
    );
  }

  // Sin efecto: runs directos (marcas por token, links seguros).
  return <RunsTexto rico={titulo} />;
}
