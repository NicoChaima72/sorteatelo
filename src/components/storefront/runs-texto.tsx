import { Fragment, type CSSProperties } from "react";

import {
  type DestinoLink,
  type MarcaRun,
  type MarkDefLink,
  type RichTexto,
  type Run,
} from "~/lib/pagebuilder/widgets";

/**
 * Render del motor de RUNS (Tanda 3 F01/D2). Mapea un `RichTexto` a una secuencia de `<span>`/`<a>` por
 * TOKEN — jamás HTML del tenant, jamás `dangerouslySetInnerHTML` (I-U1/ADR-0018). Devuelve el CONTENIDO
 * (spans), NO un contenedor: se embebe dentro de un `<Text>`/`<Title>`/`<Box>` del componente que lo usa,
 * heredando su tipografía/color base. Es PURO ⇒ testeable con `renderToStaticMarkup` sin provider Mantine.
 *
 * Reglas duras:
 * - `t` es texto plano (schema); las marcas resuelven a estilo por TOKEN (peso / itálica / color acento
 *   con FALLBACK a marca I-T2 / destacador como background del PROPIO span —lección en memoria del
 *   proyecto, nunca capa aparte— / escala en `em`, jamás px). Cero hex (I-A).
 * - Los links salen SOLO del `markDef` resuelto por id: `ancla`→`#ancla`, `pagina`→`/slug`, `url`→href
 *   https (validado en el schema) con `rel="noopener noreferrer nofollow"` + `target="_blank"`. Un
 *   `run.link` sin markDef NO debería llegar (el schema lo rechaza), pero si llegara se renderiza como
 *   texto plano (defensa, nunca `<a>` roto).
 */

/**
 * CSS de las marcas de un run. Cero hex: tokens de la escala acento con FALLBACK a marca (I-T2/I-A). Las
 * marcas de COLOR (`acento`/`marca`/`resaltado`/`gradiente`) ESPEJAN `estiloAcentoCss` de `titulo-hero.tsx`
 * byte-a-byte ⇒ un hero con `tituloAcento` migrado a runs (F02/D4) renderiza igual (migración lossless).
 */
export function estiloMarcasRun(m: MarcaRun[] | undefined): CSSProperties {
  const s: CSSProperties = {};
  if (!m || m.length === 0) return s;
  if (m.includes("fuerte")) s.fontWeight = 700;
  if (m.includes("enfasis")) s.fontStyle = "italic";
  if (m.includes("acento")) {
    // Color de la escala ACENTO con fallback a marca (I-T2).
    s.color = "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";
  }
  if (m.includes("marca")) {
    // Color del PRIMARIO del tenant (estilo `marca` del tituloAcento — palabra en color de MARCA).
    s.color = "var(--mantine-primary-color-filled)";
  }
  if (m.includes("gradiente")) {
    // Texto con gradiente marca→acento vía background-clip (estilo `gradiente` del tituloAcento).
    s.backgroundImage =
      "linear-gradient(90deg, var(--mantine-primary-color-filled), var(--mantine-color-acento-filled, var(--mantine-primary-color-6)))";
    s.WebkitBackgroundClip = "text";
    s.backgroundClip = "text";
    s.color = "transparent";
  }
  if (m.includes("resaltado")) {
    // Destacador como background-image del PROPIO span (banda inferior), con `box-decoration-break: clone`
    // para envolver bien si la palabra parte en dos líneas. NUNCA una capa aparte con z-index.
    s.backgroundImage =
      "linear-gradient(180deg, transparent 62%, var(--mantine-color-acento-2, var(--mantine-primary-color-2)) 62%)";
    s.paddingInline = "0.08em";
    s.boxDecorationBreak = "clone";
    s.WebkitBoxDecorationBreak = "clone";
  }
  // Escala en `em` (relativa a la tipografía heredada, jamás px). xl gana sobre lg si ambos vinieran.
  if (m.includes("escala_xl")) s.fontSize = "1.35em";
  else if (m.includes("escala_lg")) s.fontSize = "1.15em";
  return s;
}

/** Resuelve el `href` de un destino de link. Enum/unión cerrada ⇒ nunca URL libre (I-U1). PURO. */
export function hrefDestino(destino: DestinoLink): string {
  switch (destino.tipo) {
    case "ancla":
      return `#${destino.ancla}`;
    case "pagina":
      return `/${destino.slug}`;
    case "url":
      return destino.url;
  }
}

/** Un run como span/anchor. `markDefs` indexado por id para resolver el link. */
function RunRender({ run, defs }: { run: Run; defs: Map<string, MarkDefLink> }) {
  const estilo = estiloMarcasRun(run.m);
  const def = run.link ? defs.get(run.link) : undefined;

  if (def) {
    const externo = def.destino.tipo === "url";
    return (
      <a
        href={hrefDestino(def.destino)}
        {...(externo ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "0.15em", ...estilo }}
      >
        {run.t}
      </a>
    );
  }

  // Sin link: span con estilo de marcas, o texto plano si no hay marcas (DOM más limpio).
  if (Object.keys(estilo).length === 0) return <Fragment>{run.t}</Fragment>;
  return <span style={estilo}>{run.t}</span>;
}

export function RunsTexto({ rico }: { rico: RichTexto }) {
  const defs = new Map<string, MarkDefLink>((rico.markDefs ?? []).map((d) => [d.id, d]));
  return (
    <>
      {rico.children.map((run, i) => (
        <RunRender key={i} run={run} defs={defs} />
      ))}
    </>
  );
}
