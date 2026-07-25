import { Badge, Box, Button, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { clp } from "~/lib/formato";
import { type PacksPrecioProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `packs_precio` (sección, Tanda 2 F12): tarjetas de precio — la sección "Más libros, más chances" del
 * prototipo dreamy. La opción `destacado` va como card filled del primario con un `badge` de acento (la
 * card violeta "MÁS ELEGIDO"); el resto son tarjetas claras con sombra suave. El precio es COPY de
 * marketing (no un cobro — el checkout cobra el Decimal real, ADR-0006), formateado con `clp()`
 * (Intl.NumberFormat CLP, `tabular-nums`). El CTA ancla al catálogo (enum cerrado). Cero hex (I-A).
 */
export function PacksPrecio({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "packs_precio" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const cols = Math.min(props.items.length, 3);
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg" maw={cols >= 3 ? undefined : 760} mx="auto" w="100%">
        {props.titulo && (
          <Title order={2} fz={{ base: 22, sm: 28 }} fw={700} ta="center">
            {props.titulo}
          </Title>
        )}
        <SimpleGrid cols={{ base: 1, sm: cols }} spacing="lg">
          {props.items.map((item, i) => (
            <PackCard key={`${item.titulo}-${i}`} item={item} />
          ))}
        </SimpleGrid>
      </Stack>
    </SeccionWrapper>
  );
}

/** Una tarjeta de pack. `destacado` = fondo filled del primario + badge de acento; si no, card clara. */
function PackCard({ item }: { item: PacksPrecioProps["items"][number] }) {
  const destacado = item.destacado;
  return (
    <Box
      pos="relative"
      p="lg"
      style={{
        borderRadius: "var(--mantine-radius-lg)",
        boxShadow: "var(--mantine-shadow-sm)",
        ...(destacado
          ? {
              background: "var(--mantine-primary-color-filled)",
              color: "var(--mantine-primary-color-contrast)",
            }
          : {
              background: "var(--mantine-color-body)",
              border: "1px solid var(--mantine-color-default-border)",
            }),
      }}
    >
      {item.badge && (
        <Badge
          radius="sm"
          pos="absolute"
          top={-10}
          right={16}
          styles={{
            root: {
              background: "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))",
              color: "var(--mantine-color-acento-contrast, var(--mantine-primary-color-contrast))",
            },
            label: { textTransform: "none" },
          }}
        >
          {item.badge}
        </Badge>
      )}
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={2}>
          <Text fw={700} fz="lg" lh={1.2}>
            {item.titulo}
          </Text>
          {item.detalle && (
            <Text
              fz="sm"
              c={destacado ? undefined : "dimmed"}
              style={destacado ? { color: "color-mix(in srgb, currentColor 78%, transparent)" } : undefined}
            >
              {item.detalle}
            </Text>
          )}
        </Stack>
        <Text fw={800} fz={{ base: 22, sm: 26 }} className="tabular-nums" style={{ whiteSpace: "nowrap" }}>
          {clp(item.precio)}
        </Text>
      </Group>
      {item.ctaTexto && (
        <Button
          component="a"
          href={`#${item.ctaAncla}`}
          fullWidth
          mt="md"
          radius="md"
          variant={destacado ? "white" : "filled"}
        >
          {item.ctaTexto}
        </Button>
      )}
    </Box>
  );
}
