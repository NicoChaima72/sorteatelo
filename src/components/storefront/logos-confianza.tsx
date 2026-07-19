import { Box, Group, Stack, Text } from "@mantine/core";

import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/** Alto fijo de cada logo (reserva tamaño ⇒ CLS=0, I-C). */
const ALTO_LOGO = 44;

/**
 * `logos_confianza` (sección, catálogo-v2 F05): banda de logos/aliados. `animacion:"cinta"` = marquee
 * CSS infinito (F03: contenido duplicado seamless, pausa en hover, reduced-motion-safe); `estatica` =
 * grilla centrada. Cada logo usa `<ImagenConFallback>` ⇒ URL rota degrada, nunca `<img>` roto (I-G).
 */
export function LogosConfianza({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "logos_confianza" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;

  const logo = (alt: string, url: string, key: string | number) => (
    <ImagenConFallback
      key={key}
      src={url}
      alt={alt}
      colorPrimario={colorPrimario}
      style={{ height: ALTO_LOGO, width: "auto", objectFit: "contain", flex: "0 0 auto" }}
      fallbackStyle={{ width: ALTO_LOGO * 2, borderRadius: "var(--mantine-radius-sm)" }}
    />
  );

  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="md">
        {props.titulo && (
          <Text fw={600} c="dimmed" ta="center" tt="uppercase" fz="sm" style={{ letterSpacing: "0.06em" }}>
            {props.titulo}
          </Text>
        )}

        {props.animacion === "cinta" ? (
          // Marquee: contenido DUPLICADO para el loop seamless (translateX -50%). Pausa en hover.
          <Box className="animar-marquee-pausa" style={{ overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}>
            <Box className="animar-marquee" style={{ gap: 48, alignItems: "center", paddingBlock: 4 }}>
              {[...props.items, ...props.items].map((it, i) => logo(it.alt, it.imagenUrl, i))}
            </Box>
          </Box>
        ) : (
          <Group gap={48} justify="center" align="center" wrap="wrap">
            {props.items.map((it, i) => logo(it.alt, it.imagenUrl, i))}
          </Group>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
