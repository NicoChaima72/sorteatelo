import { Box } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** Glifo del separador entre mensajes (enum cerrado → carácter). */
const SEP_GLIFO: Record<string, string> = {
  punto: "·",
  estrella: "★",
  guion: "—",
};

/** Velocidad (enum) → `animation-duration` fijo (no CSS libre): cinta más larga = más lenta. */
const DURACION: Record<string, string> = {
  lenta: "44s",
  media: "26s",
  rapida: "15s",
};

/**
 * `cinta_texto` (sección, catálogo-v2 F12): marquee infinito tipo ticker. Reusa el marquee CSS de
 * `logos_confianza` (`.animar-marquee` + `.animar-marquee-pausa`, F03): contenido DUPLICADO para el
 * loop seamless (translateX -50%), pausa en hover, y con `prefers-reduced-motion` NO anima (queda
 * estático — la clase está gateada por la media query en globals.css, I-B). La banda toma su fondo del
 * `esquema` (fondo + texto legible por construcción, mismo sistema que `estiloSeccion`); el `nodo.estilo`
 * explícito gana. `entrada:"ninguna"` porque el movimiento del widget ES el marquee (una animación por
 * elemento, síntesis §4.6). Cero hex inline (I-A): el color sale del esquema.
 */
export function CintaTexto({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "cinta_texto" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const sep = SEP_GLIFO[props.separador] ?? "·";
  const duracion = DURACION[props.velocidad] ?? DURACION.media;

  // La banda: full-bleed, alto compacto, fondo del esquema. `nodo.estilo` explícito gana.
  const estilo =
    nodo.estilo ??
    EstiloSeccionSchema.parse({
      fondo: { tipo: "esquema", esquema: props.esquema },
      padY: "s",
      ancho: "completo",
      entrada: "ninguna",
    });

  // Una "corrida" = todos los mensajes, cada uno seguido de su separador. Se duplica para el loop.
  const corrida = props.mensajes.map((msg, i) => (
    <Box key={i} component="span" style={{ display: "inline-flex", alignItems: "center" }}>
      <span style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{msg}</span>
      <span aria-hidden style={{ opacity: 0.6, paddingInline: 24 }}>{sep}</span>
    </Box>
  ));

  return (
    <SeccionWrapper id={nodo.id} estilo={estilo} divisorColor={divisorColor}>
      <Box
        className="animar-marquee-pausa"
        style={{ overflow: "hidden", width: "100%" }}
      >
        <Box
          className="animar-marquee"
          style={{ animationDuration: duracion, alignItems: "center", fontSize: "var(--mantine-font-size-sm)" }}
        >
          {/* Contenido DUPLICADO ⇒ translateX(-50%) loop seamless. `aria-hidden` en la 2ª copia. */}
          <Box component="span" style={{ display: "inline-flex", alignItems: "center", paddingInlineEnd: 0 }}>
            {corrida}
          </Box>
          <Box component="span" aria-hidden style={{ display: "inline-flex", alignItems: "center" }}>
            {props.mensajes.map((msg, i) => (
              <span key={`d${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
                <span style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{msg}</span>
                <span style={{ opacity: 0.6, paddingInline: 24 }}>{sep}</span>
              </span>
            ))}
          </Box>
        </Box>
      </Box>
    </SeccionWrapper>
  );
}
