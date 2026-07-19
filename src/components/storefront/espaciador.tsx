import { Box } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** Sin `py` propio ni animación de entrada: el espaciador ES el espacio, no debe doblarlo ni animar. */
const ESTILO_ESPACIADOR_DEFAULT = EstiloSeccionSchema.parse({ padY: "ninguno", entrada: "ninguna" });

/** Altura del enum → px. Reserva tamaño ⇒ CLS=0 (I-C). */
const ALTO: Record<string, number> = { xs: 16, s: 32, m: 64, l: 96, xl: 144 };

/**
 * `espaciador` (sección, catálogo-v2 F04): espacio vertical vacío ajustable (estructural). No lleva
 * contenido; su único efecto es abrir aire entre secciones. `aria-hidden` (no aporta semántica).
 */
export function Espaciador({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "espaciador" }>;
  divisorColor?: string;
}) {
  const alto = ALTO[nodo.props.alto] ?? ALTO.m!;
  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo ?? ESTILO_ESPACIADOR_DEFAULT}
      divisorColor={divisorColor}
    >
      <Box aria-hidden h={alto} />
    </SeccionWrapper>
  );
}
