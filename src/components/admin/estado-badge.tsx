import { Badge } from "@mantine/core";

import { ESTADO_ORDEN_COLOR, type EstadoOrden } from "~/styles/theme";

export type { EstadoOrden };

/**
 * Badge del estado de una Orden/Pago. El color sale del mapa semántico ÚNICO del theme
 * (`ESTADO_ORDEN_COLOR`, D5) — cero hex inline (I2). Badge `light` en el token del estado:
 * el color comunica el estado, el texto lo confirma (dirección §5: color funcional + texto).
 */
const LABEL: Record<EstadoOrden, string> = {
  PAGADO: "Pagado",
  PENDIENTE: "Pendiente",
  FALLIDO: "Fallido",
};

export function EstadoBadge({ estado }: { estado: EstadoOrden }) {
  return (
    <Badge
      variant="light"
      color={ESTADO_ORDEN_COLOR[estado]}
      radius="sm"
      styles={{ label: { fontWeight: 500, textTransform: "none" } }}
    >
      {LABEL[estado]}
    </Badge>
  );
}
