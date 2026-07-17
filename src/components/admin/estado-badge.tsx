import { Badge } from "@mantine/core";

/**
 * Estado de una Orden/Pago tal como lo devuelve el dominio (enum `OrderStatus` de Prisma).
 * Se declara local (string union) para no importar el enum de `@prisma/client` en el bundle
 * del cliente.
 */
export type EstadoOrden = "PENDIENTE" | "PAGADO" | "FALLIDO";

// Color del estado vía inline style = excepción de data-viz de las convenciones (design.md
// §2/§9: la semántica de color de comercio está PENDIENTE — se mantiene el patrón provisorio,
// badge neutro outline + punto de color inline, hasta cerrar la paleta de marca).
const META: Record<EstadoOrden, { label: string; color: string }> = {
  PAGADO: { label: "Pagado", color: "#16a34a" },
  PENDIENTE: { label: "Pendiente", color: "#d97706" },
  FALLIDO: { label: "Fallido", color: "#dc2626" },
};

export function EstadoBadge({ estado }: { estado: EstadoOrden }) {
  const meta = META[estado];
  return (
    <Badge
      variant="outline"
      color="gray"
      radius="sm"
      leftSection={
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: meta.color,
          }}
        />
      }
      styles={{ label: { fontWeight: 400, textTransform: "none" } }}
    >
      {meta.label}
    </Badge>
  );
}
