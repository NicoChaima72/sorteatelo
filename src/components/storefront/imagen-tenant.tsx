import { Box } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { useState, type CSSProperties } from "react";

import { gradienteTematico } from "~/styles/tenantTheme";

/**
 * Imagen SUBIDA por el Organizador (prop `urlPublica`: imagen_destacada F04, logos_confianza F05,
 * galeria F08) con DEGRADACIÓN ELEGANTE ante URL rota (I-G, design.md §5.2 / frontend-conventions
 * §"Degradación elegante de imágenes"). Distinta de las imágenes resueltas server-side (hero/portada/
 * premio, que caen a `gradienteTematico` por AUSENCIA): acá la URL puede quedar colgada (D11: borrar
 * un `PageAsset` NO invalida el documento) ⇒ un `onError` client-side reemplaza el `<img>` por un
 * bloque de gradiente TEMATIZADO (fuente única `gradienteTematico`, cero hex — I-A) con un ícono,
 * NUNCA un `<img>` roto. SSR renderiza el `<img>` VISIBLE (I-D); solo swap-ea si falla en el cliente.
 */
export function ImagenConFallback({
  src,
  alt,
  colorPrimario = null,
  style,
  fallbackStyle,
  className,
}: {
  src: string;
  alt: string;
  /** Color de marca del tenant (para el gradiente del placeholder vía `gradienteTematico`). */
  colorPrimario?: string | null;
  /** Estilo del `<img>` (y base del placeholder). */
  style?: CSSProperties;
  /** Estilo extra SOLO del placeholder (p.ej. reservar `aspectRatio` cuando el `<img>` es natural). */
  fallbackStyle?: CSSProperties;
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <Box
        role="img"
        aria-label={alt}
        className={className}
        style={{
          ...style,
          ...fallbackStyle,
          background: gradienteTematico(colorPrimario),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconPhoto
          className="size-10"
          stroke={1.25}
          color="var(--mantine-color-white)"
          style={{ opacity: 0.85 }}
        />
      </Box>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFallo(true)}
      style={style}
    />
  );
}
