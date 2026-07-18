import { Badge } from "@mantine/core";

import { ESTADO_TIENDA_COLOR, type EstadoTienda } from "~/styles/theme";

export type { EstadoTienda };

/**
 * Badge del estado del ciclo de vida de una Tienda. Mismo criterio que `EstadoBadge`: el color
 * sale del mapa semántico ÚNICO del theme (`ESTADO_TIENDA_COLOR`, D5) — cero hex inline (I2).
 * "En configuración" usa ámbar (nunca rojo, I5); "suspendida" sí es rojo (estado de bloqueo).
 */
const LABEL: Record<EstadoTienda, string> = {
  ALTA: "Alta",
  CONFIGURACION: "En configuración",
  PUBLICADA: "Publicada",
  SUSPENDIDA: "Suspendida",
};

export function EstadoTiendaBadge({ estado }: { estado: EstadoTienda }) {
  return (
    <Badge
      variant="light"
      color={ESTADO_TIENDA_COLOR[estado]}
      radius="sm"
      styles={{ label: { fontWeight: 500, textTransform: "none" } }}
    >
      {LABEL[estado]}
    </Badge>
  );
}
