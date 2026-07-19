import { Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `beneficios_grid` (sección, catálogo-v2 F04): grilla 2–6 de beneficios (ícono + título + desc).
 * Los íconos salen del enum `ICONOS_BENEFICIO` (mapeado a Tabler, nunca string libre — I-A). Estética
 * per-tenant: `ThemeIcon variant="light"` toma el primario de la escala del tenant (I-G). Hover-lift
 * CSS incorporado (F03). No depende de datos del tenant ⇒ SIEMPRE presente.
 */
export function BeneficiosGrid({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "beneficios_grid" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg">
        {props.titulo && (
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700} ta="center">
            {props.titulo}
          </Title>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, md: props.columnas }} spacing="lg">
          {props.items.map((item, i) => {
            const Icono = iconoBeneficio(item.icono);
            return (
              <Card
                key={`${item.titulo}-${i}`}
                withBorder
                radius="md"
                padding="lg"
                h="100%"
                className="animar-hover-lift"
              >
                <Stack gap="sm">
                  <ThemeIcon variant="light" size="xl" radius="md">
                    <Icono className="size-6" stroke={1.75} />
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
      </Stack>
    </SeccionWrapper>
  );
}
