import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Indicator,
  Stack,
  Text,
} from "@mantine/core";
import { IconShoppingCart, IconTrash } from "@tabler/icons-react";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { clp } from "~/lib/formato";

/**
 * UI del carrito (F04). Botón del header con contador + drawer con los ítems. Mobile-first:
 * el drawer entra desde la derecha y ocupa el ancho útil en móvil.
 *
 * I4: se muestran los precios POR ÍTEM con `clp()` + la CANTIDAD de productos; NO se suma un total
 * en el cliente (jamás aritmética de dinero acá). El total definitivo lo calcula el server en
 * `iniciarCheckout` y lo muestra Flow en su página de pago.
 */
export function BotonCarrito({ onOpen }: { onOpen: () => void }) {
  const { cantidad } = useCarrito();
  return (
    <Indicator
      label={cantidad}
      size={18}
      disabled={cantidad === 0}
      offset={4}
      aria-label={`Carrito con ${cantidad} productos`}
    >
      <ActionIcon
        variant="subtle"
        color="gray"
        size="lg"
        onClick={onOpen}
        aria-label="Abrir carrito"
      >
        <IconShoppingCart className="size-5" stroke={1.75} />
      </ActionIcon>
    </Indicator>
  );
}

export function CarritoDrawer({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { items, quitar, vaciar, cantidad } = useCarrito();

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={<Text fw={600}>Tu carrito</Text>}
      padding="md"
      size="sm"
    >
      {cantidad === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconShoppingCart
            className="size-8"
            stroke={1.5}
            color="var(--mantine-color-dimmed)"
          />
          <Text size="sm" c="dimmed" ta="center">
            Tu carrito está vacío. Agrega productos para continuar.
          </Text>
        </Stack>
      ) : (
        <Stack gap="md" h="100%">
          <Stack gap="sm" className="flex-1 overflow-y-auto">
            {items.map((item) => (
              <Group
                key={item.id}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
              >
                <div className="min-w-0">
                  <Text size="sm" fw={500} truncate>
                    {item.titulo}
                  </Text>
                  <Text size="sm" c="dimmed" className="tabular-nums">
                    {clp(item.precio)}
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => quitar(item.id)}
                  aria-label={`Quitar ${item.titulo}`}
                >
                  <IconTrash className="size-4" stroke={1.75} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>

          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {cantidad} {cantidad === 1 ? "producto" : "productos"}. El total a
              pagar se calcula de forma segura al continuar.
            </Text>
            <Button component={Link} href="/checkout" onClick={onClose} fullWidth>
              Ir a pagar
            </Button>
            <Button variant="subtle" color="gray" size="xs" onClick={vaciar}>
              Vaciar carrito
            </Button>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
