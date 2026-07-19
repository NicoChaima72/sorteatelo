import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconBooks, IconGift } from "@tabler/icons-react";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { StepperCantidad } from "~/components/storefront/stepper-cantidad";
import { clp } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { gradienteTematico } from "~/styles/tenantTheme";
import { api, type RouterOutputs } from "~/utils/api";

/** Tipo derivado del backend (no redeclarar el shape a mano). */
type ProductoCatalogo =
  RouterOutputs["checkout"]["listarProductosDeCatalogo"][number];

/**
 * Catálogo del page builder (widget `catalogo`, F05/ADR-0016; plantilla-rica F04, design.md §5.1 pto
 * 3): grid de tarjetas con portada, título, precio (`tabular-nums`, CLP, I4), badge "Sorteo" y
 * agregar/stepper de cantidad. Las props vienen del Documento (`props.titulo`/`modo`/`productoIds`/
 * `columnas`). Reusa `checkout.listarProductosDeCatalogo` (tenant-scoped server-side, I1; referencias
 * ajenas/inactivas descartadas en silencio, D6). Card sin portada ⇒ placeholder temático (§5.2).
 */
export function CatalogoStorefront({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "catalogo" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const productos = api.checkout.listarProductosDeCatalogo.useQuery({
    modo: props.modo,
    productoIds: props.productoIds,
  });
  const cols = { base: 1, sm: 2, md: props.columnas };

  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo}
      ancla="catalogo"
      divisorColor={divisorColor}
    >
      <Stack gap="lg">
        <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
          {props.titulo}
        </Title>

        {productos.isLoading ? (
          <SimpleGrid cols={cols} spacing="lg">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={320} radius="md" />
            ))}
          </SimpleGrid>
        ) : productos.isError ? (
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
        ) : !productos.data || productos.data.length === 0 ? (
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
        ) : (
          <SimpleGrid cols={cols} spacing="lg">
            {productos.data.map((producto) => (
              <TarjetaProducto
                key={producto.id}
                producto={producto}
                colorPrimario={colorPrimario}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </SeccionWrapper>
  );
}

function TarjetaProducto({
  producto,
  colorPrimario,
}: {
  producto: ProductoCatalogo;
  colorPrimario: string | null;
}) {
  const { contiene, agregar, quitar } = useCarrito();
  const enCarrito = contiene(producto.id);

  return (
    <Card
      withBorder
      radius="md"
      padding={0}
      className="h-full animar-hover-lift animar-zoom-hover"
    >
      <Stack gap={0} h="100%">
        <Portada
          url={producto.portadaUrl}
          titulo={producto.titulo}
          colorPrimario={colorPrimario}
          participaEnSorteo={producto.participaEnSorteo}
        />

        <Stack gap="sm" p="md" className="flex-1">
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
              <Group gap="xs" wrap="nowrap">
                <StepperCantidad id={producto.id} size="sm" />
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => quitar(producto.id)}
                >
                  Quitar
                </Button>
              </Group>
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
      </Stack>
    </Card>
  );
}

/** Portada del producto: imagen, o placeholder temático (gradiente + inicial) si no hay (§5.2). */
function Portada({
  url,
  titulo,
  colorPrimario,
  participaEnSorteo,
}: {
  url: string | null;
  titulo: string;
  colorPrimario: string | null;
  participaEnSorteo: boolean;
}) {
  const inicial = titulo.trim().charAt(0).toUpperCase() || "?";

  return (
    <Box pos="relative" style={{ aspectRatio: "4 / 3", overflow: "hidden" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={titulo}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <Box
          aria-hidden
          className="flex items-center justify-center"
          style={{
            width: "100%",
            height: "100%",
            background: gradienteTematico(colorPrimario),
          }}
        >
          <Text fz={44} fw={800} c="white" style={{ opacity: 0.9 }}>
            {inicial}
          </Text>
        </Box>
      )}

      {participaEnSorteo && (
        <Badge
          variant="filled"
          radius="sm"
          leftSection={<IconGift className="size-3" stroke={2} />}
          pos="absolute"
          top={8}
          left={8}
          styles={{ label: { textTransform: "none" } }}
        >
          Sorteo
        </Badge>
      )}
    </Box>
  );
}
