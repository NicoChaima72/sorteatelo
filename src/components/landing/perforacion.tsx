import { cn } from "~/lib/utils";

import s from "./landing.module.css";

/**
 * Perforación — separador dashed del talonario (el troquel entre secciones). Cero hex: la línea
 * sale del token `--mantine-color-gray-3` vía el CSS module acotado.
 */
export function Perforacion({ className }: { className?: string }) {
  return <hr className={cn(s.perforacion, className)} />;
}
