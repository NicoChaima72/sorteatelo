import { Box, Divider, Group } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** `py` apretado por defecto: un separador entre secciones no debe abrir un hueco enorme. */
const ESTILO_SEPARADOR_DEFAULT = EstiloSeccionSchema.parse({ padY: "s" });

/** Escala (px) del motivo por tamaño. */
const ALTURA: Record<string, number> = { s: 18, m: 28, l: 40 };
/** Trazo del motivo (token gris, subtle — nunca hex, I-A). */
const TRAZO = "var(--mantine-color-gray-4)";

/**
 * `separador` (sección, catálogo-v2 F04): separador decorativo entre secciones. El motivo es un SVG
 * generado por NOSOTROS de un enum cerrado (línea/puntos/onda/perforación de ticket/zigzag), nunca
 * markup del tenant (I3). Centrado y acotado. Decorativo ⇒ `aria-hidden`.
 */
export function Separador({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "separador" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const alto = ALTURA[props.tamano] ?? ALTURA.m!;
  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo ?? ESTILO_SEPARADOR_DEFAULT}
      divisorColor={divisorColor}
    >
      <Box aria-hidden mx="auto" maw={props.estilo === "linea" ? 520 : 220}>
        <Motivo estilo={props.estilo} alto={alto} />
      </Box>
    </SeccionWrapper>
  );
}

function Motivo({ estilo, alto }: { estilo: string; alto: number }) {
  if (estilo === "linea") {
    return <Divider />;
  }
  if (estilo === "puntos") {
    const n = 5;
    return (
      <Group justify="center" gap={alto / 2}>
        {Array.from({ length: n }).map((_, i) => (
          <Box
            key={i}
            style={{
              width: alto / 4,
              height: alto / 4,
              borderRadius: "50%",
              background: TRAZO,
            }}
          />
        ))}
      </Group>
    );
  }
  if (estilo === "perforacion") {
    // Perforación de ticket: línea de troquel (dashes gruesos).
    return (
      <Box
        style={{
          height: 0,
          borderTop: `2px dashed ${TRAZO}`,
        }}
      />
    );
  }
  // onda / zigzag ⇒ SVG stroke.
  const d =
    estilo === "onda"
      ? "M0,10 C25,0 40,20 60,10 C80,0 95,20 120,10"
      : "M0,2 L15,18 L30,2 L45,18 L60,2 L75,18 L90,2 L105,18 L120,2";
  return (
    <svg
      viewBox="0 0 120 20"
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height: alto }}
    >
      <path d={d} fill="none" stroke={TRAZO} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
