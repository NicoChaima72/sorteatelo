import { Box } from "@mantine/core";
import { useState } from "react";

import { gradientePortadaDeterminista } from "~/styles/tenantTheme";

/**
 * **Miniatura cuadrada de un producto** (F03): la portada del catálogo, achicada, para que el ítem
 * del carrito y el del resumen del checkout se puedan reconocer de un vistazo en vez de ser una
 * línea de texto.
 *
 * Degradación elegante (design.md §5.2, frontend-conventions § Degradación elegante de imágenes):
 * **nunca un `<img>` roto ni un hueco**. Sin portada —o si la imagen falla en el navegador, que pasa
 * con una URL de R2 caída o un glitch de red— cae al **mismo dibujo que la tarjeta del catálogo**:
 * el gradiente determinista por título (`gradientePortadaDeterminista`), así el fallback de la
 * miniatura y el de la tapa grande son reconociblemente la misma cosa.
 *
 * `gradientePortadaDeterminista` recibe `null` como color porque su primer parámetro está en desuso:
 * el gradiente sale de las CSS vars de la escala del tenant (cero hex, I5), no de un hex en JS.
 *
 * `aria-hidden`: el título del producto ya viaja como texto al lado en las dos superficies que la
 * usan, así que anunciar la imagen sería repetirlo.
 */
export function MiniaturaProducto({
  url,
  titulo,
  tamano = 56,
}: {
  url: string | null | undefined;
  /** Del título sale la semilla del gradiente de fallback (mismo dibujo que en el catálogo). */
  titulo: string;
  /** Lado del cuadrado en px. */
  tamano?: number;
}) {
  const [fallo, setFallo] = useState(false);
  const hayImagen = Boolean(url) && !fallo;

  return (
    <Box
      aria-hidden
      w={tamano}
      h={tamano}
      style={{
        flexShrink: 0, // la miniatura no cede ancho: lo que se comprime es el título
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
        background: hayImagen
          ? undefined
          : gradientePortadaDeterminista(null, titulo),
      }}
    >
      {hayImagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          onError={() => setFallo(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </Box>
  );
}
