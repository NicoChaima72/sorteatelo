import { Box } from "@mantine/core";
import { type ReactNode } from "react";

import { cn } from "~/lib/utils";

import s from "./landing.module.css";

/**
 * Sello — timbre de goma del talonario: caja mono uppercase con borde e inclinación leve. El color
 * (borde + texto) sale de un token del theme vía el prop `c` de Mantine (`Box c={color}`), cero hex.
 * Para los estados de comercio del panel se usa `EstadoBadge`/`EstadoTiendaBadge` — este Sello es la
 * pieza decorativa de las superficies de marca (landing/login).
 */
export function Sello({
  children,
  color = "exito",
  className,
}: {
  children: ReactNode;
  /** Token de color del theme (p. ej. `exito`, `pendiente`, `red`, `sorteatelo`). */
  color?: string;
  className?: string;
}) {
  return (
    <Box component="span" c={color} className={cn(s.sello, className)}>
      {children}
    </Box>
  );
}
