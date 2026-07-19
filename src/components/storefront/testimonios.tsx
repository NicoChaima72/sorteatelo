import {
  Avatar,
  Box,
  Card,
  Group,
  Rating,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { type TestimoniosProps } from "~/lib/pagebuilder/widgets";

/**
 * `testimonios` (sección, F11): reseñas de clientes. TEXTO PLANO con límites (I3, nunca HTML). Layout
 * grid o carrusel (scroll horizontal sin dependencia externa). Avatar con inicial de fallback.
 */
export function Testimonios({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "testimonios" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg">
        {props.titulo && (
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
            {props.titulo}
          </Title>
        )}
        {props.layout === "carrusel" ? (
          <ScrollArea offsetScrollbars scrollbarSize={8}>
            <Group gap="lg" wrap="nowrap" align="stretch">
              {props.items.map((item, i) => (
                <Box key={`${item.nombre}-${i}`} miw={280} maw={320}>
                  <Tarjeta item={item} />
                </Box>
              ))}
            </Group>
          </ScrollArea>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {props.items.map((item, i) => (
              <Tarjeta key={`${item.nombre}-${i}`} item={item} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </SeccionWrapper>
  );
}

function Tarjeta({ item }: { item: TestimoniosProps["items"][number] }) {
  return (
    <Card withBorder radius="md" padding="lg" h="100%" className="animar-hover-lift">
      <Stack gap="sm" h="100%">
        {item.estrellas !== undefined && (
          <Rating value={item.estrellas} readOnly size="sm" />
        )}
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }} className="flex-1">
          {item.texto}
        </Text>
        <Group gap="sm" wrap="nowrap">
          <Avatar src={item.avatarUrl ?? undefined} radius="xl" size="md">
            {item.nombre.trim().charAt(0).toUpperCase()}
          </Avatar>
          <Box className="min-w-0">
            <Text fw={600} size="sm" truncate>
              {item.nombre}
            </Text>
            {item.handle && (
              <Text size="xs" c="dimmed" truncate>
                {item.handle}
              </Text>
            )}
          </Box>
        </Group>
      </Stack>
    </Card>
  );
}
