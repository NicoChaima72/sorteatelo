import { type CSSProperties, type ReactNode } from "react";

import { cn } from "~/lib/utils";

import s from "./landing.module.css";

/**
 * Etiqueta — eyebrow mono estampado del talonario (series, cabeceras, notas). IBM Plex Mono
 * uppercase con tracking amplio. Es un `<span>` PLANO a propósito: así el color lo controla SOLO el
 * CSS module (`.etiqueta` lee `--tinta-suave` del contexto de banda, con fallback), sin que una
 * regla de color de Mantine `Text` compita según el orden de carga de estilos. Para forzar un color
 * puntual (p. ej. tinta sobre la banda amarilla) se pasa `c` = token del theme.
 */
export function Etiqueta({
  children,
  className,
  style,
  c,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Token de color del theme (p. ej. `black`, `white`) para forzar el color del eyebrow. */
  c?: string;
}) {
  return (
    <span
      className={cn(s.etiqueta, className)}
      style={c ? { color: `var(--mantine-color-${c})`, ...style } : style}
    >
      {children}
    </span>
  );
}
