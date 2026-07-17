import { ActionIcon, Group, Text } from "@mantine/core";
import { IconMinus, IconPlus } from "@tabler/icons-react";

import { MAX_CANTIDAD_POR_ITEM, useCarrito } from "~/components/storefront/carrito";

/**
 * Stepper +/− de cantidad de un ítem del carrito (F02/D7, ADR-0012). Lee y escribe la cantidad
 * vía `useCarrito` — no maneja estado propio ni dinero (I4: solo cuenta unidades). El `−` se
 * deshabilita en 1 (para quitar del carrito está el botón "Quitar") y el `+` en el tope de cordura
 * (`MAX_CANTIDAD_POR_ITEM`, que espeja el `max` de Zod del server). Devuelve null si el ítem no está
 * en el carrito. Color por tokens del theme (`variant="default"`), número con `tabular-nums`.
 */
export function StepperCantidad({
  id,
  size = "md",
}: {
  id: string;
  size?: "sm" | "md";
}) {
  const { items, setCantidad } = useCarrito();
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  return (
    <Group gap={6} wrap="nowrap">
      <ActionIcon
        variant="default"
        size={size}
        radius="md"
        disabled={item.cantidad <= 1}
        onClick={() => setCantidad(id, item.cantidad - 1)}
        aria-label={`Quitar una unidad de ${item.titulo}`}
      >
        <IconMinus className="size-4" stroke={1.75} />
      </ActionIcon>
      <Text
        size="sm"
        fw={500}
        className="tabular-nums"
        w={20}
        ta="center"
        aria-label={`Cantidad: ${item.cantidad}`}
      >
        {item.cantidad}
      </Text>
      <ActionIcon
        variant="default"
        size={size}
        radius="md"
        disabled={item.cantidad >= MAX_CANTIDAD_POR_ITEM}
        onClick={() => setCantidad(id, item.cantidad + 1)}
        aria-label={`Agregar una unidad de ${item.titulo}`}
      >
        <IconPlus className="size-4" stroke={1.75} />
      </ActionIcon>
    </Group>
  );
}
