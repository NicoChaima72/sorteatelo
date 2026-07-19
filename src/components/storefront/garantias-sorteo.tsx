import { Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconScale } from "@tabler/icons-react";

import { iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `garantias_sorteo` (sección, catálogo-v2 F06): "cómo elegimos al ganador" — transparencia (anti
 * caso Naya Fácil). `metodo` = texto plano de cómo se ejecuta el sorteo; `items` = puntos de confianza
 * (ícono del enum ICONOS_BENEFICIO + título + desc). Contenido editorial, sin datos server-side.
 */
export function GarantiasSorteo({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "garantias_sorteo" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const items = props.items ?? [];
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg" maw={900} mx="auto">
        <Stack gap="sm" align="center" ta="center">
          <ThemeIcon variant="light" size="xl" radius="md">
            <IconScale className="size-6" stroke={1.75} />
          </ThemeIcon>
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
            {props.titulo}
          </Title>
          {props.metodo && (
            <Text c="dimmed" maw={640} style={{ whiteSpace: "pre-wrap" }}>
              {props.metodo}
            </Text>
          )}
        </Stack>

        {items.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: items.length >= 3 ? 3 : 2 }} spacing="lg">
            {items.map((item, i) => {
              const Icono = iconoBeneficio(item.icono);
              return (
                <Card key={`${item.titulo}-${i}`} withBorder radius="md" padding="lg" h="100%" className="animar-hover-lift">
                  <Stack gap="sm">
                    <ThemeIcon variant="light" size="lg" radius="md">
                      <Icono className="size-5" stroke={1.75} />
                    </ThemeIcon>
                    <Text fw={600}>{item.titulo}</Text>
                    {item.desc && (
                      <Text size="sm" c="dimmed">
                        {item.desc}
                      </Text>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
