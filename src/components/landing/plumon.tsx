import { type ReactNode } from "react";

import { cn } from "~/lib/utils";

import s from "./landing.module.css";

/**
 * Plumón — trazo orgánico de destacador amarillo detrás de una palabra (firma de «El Talonario»).
 * Dos variantes (`a`/`b`) con distinta inclinación y borde para que dos plumones seguidos no se
 * vean clonados. El texto resaltado siempre va en tinta (legible sobre el amarillo); sobre una
 * banda amarilla el trazo pasa a blanco solo (`.bandaAmarilla` en el CSS module). Cero hex: el
 * amarillo sale del token `--mantine-color-amarillo-6`.
 */
export function Plumon({
  children,
  variante = "a",
}: {
  children: ReactNode;
  variante?: "a" | "b";
}) {
  return (
    <span className={cn(variante === "b" ? s.plumonB : s.plumon)}>
      {children}
    </span>
  );
}
