import { Badge, Box, Button, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { clp } from "~/lib/formato";
import { hrefDeAncla } from "~/lib/pagebuilder/nav";
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
          {props.items.map((item, i) =>
            props.variante === "ficha" ? (
              <FichaPrecio key={`${item.titulo}-${i}`} item={item} />
            ) : (
              <PackCard key={`${item.titulo}-${i}`} item={item} />
            ),
          )}
        </SimpleGrid>
      </Stack>
    </SeccionWrapper>
  );
}

/**
 * Ficha VERTICAL de precio (fidelidad tienda-libro bcac): badge mono arriba + precio grande en MONO +
 * detalle debajo, sobre card OSCURA de superficie. `destacado` = borde de ACENTO (dorado) + tinte
 * suave del acento (la price-card "featured" del mockup), NO filled del primario. Cero hex (I-A): todo
 * de tokens; el precio usa `--font-mono` (IBM Plex Mono, el mono de plataforma).
 */
function FichaPrecio({ item }: { item: PacksPrecioProps["items"][number] }) {
  const destacado = item.destacado;
  return (
    <Box
      p="xl"
      style={{
        position: "relative",
        borderRadius: "var(--mantine-radius-lg)",
        background: destacado
          ? "color-mix(in srgb, var(--mantine-color-acento-filled, var(--mantine-primary-color-filled)) 8%, var(--mantine-color-body))"
          : "var(--mantine-color-body)",
        border: destacado
          ? "1px solid var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))"
          : "1px solid var(--mantine-color-default-border)",
      }}
    >
      {item.badge && (
        <Badge
          variant="default"
          radius="sm"
          mb="sm"
          styles={{
            root: {
              background: "var(--mantine-color-default)",
              borderColor: "var(--mantine-color-default-border)",
              color: destacado
                ? "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))"
                : "var(--mantine-primary-color-4)",
            },
            label: { textTransform: "none", fontFamily: "var(--font-mono)" },
          }}
        >
          {item.badge}
        </Badge>
      )}
      <Text
        fw={700}
        fz={{ base: 30, sm: 34 }}
        lh={1.1}
        className="tabular-nums"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {clp(item.precio)}
      </Text>
      {item.detalle && (
        <Text fz="sm" c="dimmed" mt={4}>
          {item.detalle}
        </Text>
      )}
      {item.ctaTexto && (
        <Button
          component="a"
          href={hrefDeAncla(item.ctaAncla)}
          fullWidth
          mt="md"
          radius="md"
          variant={destacado ? "filled" : "default"}
        >
          {item.ctaTexto}
        </Button>
      )}
    </Box>
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
          href={hrefDeAncla(item.ctaAncla)}
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
