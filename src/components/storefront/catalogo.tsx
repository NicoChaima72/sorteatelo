import {
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconBooks } from "@tabler/icons-react";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { clp } from "~/lib/formato";
import { api, type RouterOutputs } from "~/utils/api";

/** Tipo derivado del backend (no redeclarar el shape a mano). */
type ProductoCatalogo = RouterOutputs["checkout"]["listarProductos"][number];

/**
 * Catálogo del storefront (F03): grid de productos ACTIVOS de la Tienda del subdominio. Reusa
 * `checkout.listarProductos` (tenant-scoped server-side, I1). Resuelve los 3 estados
 * (loading/error/vacío), no solo el happy path (data-fetching-conventions). Montos con `~/lib/formato`
 * (`clp`), `tabular-nums` (I4) — el storefront solo MUESTRA, nunca opera dinero en el cliente.
 */
export function CatalogoStorefront() {
  const productos = api.checkout.listarProductos.useQuery();

  if (productos.isLoading) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={190} radius="md" />
        ))}
      </SimpleGrid>
    );
  }

  if (productos.isError) {
    return (
      <Stack align="center" py="xl" gap="sm">
        <Text size="sm" c="red">
          No pudimos cargar los productos.
        </Text>
        <Button
          variant="default"
          size="xs"
          onClick={() => void productos.refetch()}
        >
          Reintentar
        </Button>
      </Stack>
    );
  }

  if (!productos.data || productos.data.length === 0) {
    return (
      <Stack align="center" py="xl" gap="xs">
        <IconBooks
          className="size-8"
          stroke={1.5}
          color="var(--mantine-color-dimmed)"
        />
        <Text size="sm" c="dimmed" ta="center">
          Esta tienda todavía no tiene productos publicados.
        </Text>
      </Stack>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
      {productos.data.map((producto) => (
        <TarjetaProducto key={producto.id} producto={producto} />
      ))}
    </SimpleGrid>
  );
}

function TarjetaProducto({ producto }: { producto: ProductoCatalogo }) {
  const { contiene, agregar, quitar } = useCarrito();
  const enCarrito = contiene(producto.id);

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm" h="100%">
        <Stack gap={4} className="flex-1">
          <Text
            component={Link}
            href={`/producto/${producto.id}`}
            fw={600}
            lineClamp={2}
          >
            {producto.titulo}
          </Text>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {producto.descripcion}
          </Text>
        </Stack>

        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text fw={700} className="tabular-nums">
            {clp(producto.precio)}
          </Text>
          {enCarrito ? (
            <Button
              variant="light"
              color="gray"
              size="xs"
              onClick={() => quitar(producto.id)}
            >
              Quitar
            </Button>
          ) : (
            <Button
              size="xs"
              onClick={() =>
                agregar({
                  id: producto.id,
                  titulo: producto.titulo,
                  precio: producto.precio,
                })
              }
            >
              Agregar
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
