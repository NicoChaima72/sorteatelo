import { Anchor, AspectRatio, Box, Stack, Text } from "@mantine/core";
import { type ReactNode } from "react";

import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { MarcoHolo } from "~/components/storefront/marco-holo";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/** Ratio del enum → relación numérica para `<AspectRatio>`. `natural` ⇒ sin recorte (alto intrínseco). */
const RATIO: Record<string, number | null> = {
  natural: null,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:4": 3 / 4,
};

/**
 * `imagen_destacada` (sección, catálogo-v2 F04): una imagen grande con `alt` (accesibilidad),
 * `caption` y enlace opcionales. `ancho:"completo"` la lleva al ancho del contenedor. Con enlace,
 * envuelve en `<Anchor>` + zoom-hover CSS (F03). La imagen usa `<ImagenConFallback>` ⇒ URL rota
 * degrada a un gradiente tematizado + ícono, nunca un `<img>` roto (I-G, design.md §5.2).
 */
export function ImagenDestacada({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "imagen_destacada" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const ratio = RATIO[props.ratio] ?? null;
  const maw = props.ancho === "completo" ? undefined : 900;
  const radius = "var(--mantine-radius-md)";

  const imagen = ratio ? (
    <AspectRatio ratio={ratio}>
      <ImagenConFallback
        src={props.imagenUrl}
        alt={props.alt}
        colorPrimario={colorPrimario}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: radius }}
      />
    </AspectRatio>
  ) : (
    <ImagenConFallback
      src={props.imagenUrl}
      alt={props.alt}
      colorPrimario={colorPrimario}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: radius }}
      // Natural: la imagen no lleva alto conocido; el placeholder reserva 3/2 para no romper el layout.
      fallbackStyle={{ aspectRatio: "3 / 2", height: "auto" }}
    />
  );

  const conEnlace: ReactNode = props.enlaceUrl ? (
    <Anchor
      href={props.enlaceUrl}
      target="_blank"
      rel="noreferrer"
      className="animar-zoom-hover"
      style={{ display: "block", overflow: "hidden", borderRadius: radius }}
    >
      {imagen}
    </Anchor>
  ) : (
    imagen
  );

  // Variante holográfica (F12): el marco anima su borde de gradiente + tilt 3D (transform-only,
  // reduced-motion/SSR-safe). El marco ya recorta con su propio radio, así que envuelve la imagen tal cual.
  const contenidoImagen: ReactNode = props.holo ? (
    <MarcoHolo radius={radius}>{conEnlace}</MarcoHolo>
  ) : (
    conEnlace
  );

  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box maw={maw} mx={maw ? "auto" : undefined}>
        <Stack gap="xs">
          {contenidoImagen}
          {props.caption && (
            <Text size="sm" c="dimmed" ta="center">
              {props.caption}
            </Text>
          )}
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}
