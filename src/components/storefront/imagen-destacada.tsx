import { Anchor, AspectRatio, Box, Stack, Text } from "@mantine/core";
import { type CSSProperties, type ReactNode } from "react";

import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { MarcoHolo } from "~/components/storefront/marco-holo";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type FormaImagen } from "~/lib/pagebuilder/widgets";
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
 * Máscara de forma CURADA (builder-tanda-1 F07/D11) como CSS aplicable a la imagen. PURO. Border-radius
 * (círculo/blob/arco) y clip-path (ticket) escalan de forma responsive (%/calc, nunca un path fijo en
 * px). `ninguna` ⇒ `{}` (default no-op, I-H). Cero valores libres del tenant (I-A): solo estos 5.
 */
export function formaImagenCss(forma: FormaImagen): CSSProperties {
  switch (forma) {
    case "ninguna":
      return {};
    case "circulo":
      // 1:1 ⇒ círculo perfecto; otro ratio ⇒ elipse (el editor sugiere ratio 1:1 para un círculo).
      return { borderRadius: "50%" };
    case "blob":
      // Blob orgánico: border-radius de 8 valores (escala responsive, sin path fijo).
      return { borderRadius: "42% 58% 63% 37% / 45% 45% 55% 55%" };
    case "arco":
      // Arco/portal: top elíptico + base con esquinas suaves.
      return { borderRadius: "48% 48% 10px 10px" };
    case "ticket":
      // Muescas laterales al medio (motivo troquel del talonario). Polígono curado, escala con calc/%.
      return {
        clipPath:
          "polygon(0 0, 100% 0, 100% 44%, calc(100% - 10px) 50%, 100% 56%, 100% 100%, 0 100%, 0 56%, 10px 50%, 0 44%)",
      };
  }
}

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
  // Ancho (Tanda 2 F03/D3): `completo` = full-bleed (sin maw); `card` = holocard/portada compacta
  // (~420px); `contenido` (default) = la columna de lectura de siempre (900px, no-op).
  const maw = props.ancho === "completo" ? undefined : props.ancho === "card" ? 420 : 900;
  const radius = "var(--mantine-radius-md)";
  // Máscara de forma (F07/D11): border-radius (círculo/blob/arco) o clip-path (ticket) que gana sobre el
  // `radius` base. `ninguna` ⇒ `{}` ⇒ la imagen conserva el radio actual (no-op, I-H). El slot ya reserva
  // el `ratio` ⇒ recortar no cambia el tamaño reservado (CLS=0, I-C).
  const formaCss = formaImagenCss(props.forma);

  const imagen = ratio ? (
    <AspectRatio ratio={ratio}>
      <ImagenConFallback
        src={props.imagenUrl}
        alt={props.alt}
        colorPrimario={colorPrimario}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: radius, ...formaCss }}
      />
    </AspectRatio>
  ) : (
    <ImagenConFallback
      src={props.imagenUrl}
      alt={props.alt}
      colorPrimario={colorPrimario}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: radius, ...formaCss }}
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
