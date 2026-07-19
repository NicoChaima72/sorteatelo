import { Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { useCountUp } from "~/components/storefront/animar";
import { iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { num } from "~/lib/formato";
import { type EstadisticasProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `estadisticas` (sección, catálogo-v2 F05): fila 2–4 de cifras grandes con COUNT-UP al entrar al
 * viewport (F03: SSR = valor final, reduced-motion ⇒ inmediato — I-D/I-B). Cifras NARRADAS por el
 * Organizador (prueba social editorial, no el conteo real del sorteo, §5). `prefijo`/`sufijo`
 * enmarcan el número; `icono` (opcional) del enum ICONOS_BENEFICIO.
 */
export function Estadisticas({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "estadisticas" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg">
        {props.titulo && (
          <Title order={2} fz={{ base: 22, sm: 28 }} fw={700} ta="center">
            {props.titulo}
          </Title>
        )}
        <SimpleGrid cols={{ base: 2, sm: props.items.length }} spacing="lg">
          {props.items.map((item, i) => (
            <StatItem key={i} item={item} />
          ))}
        </SimpleGrid>
      </Stack>
    </SeccionWrapper>
  );
}

/** Una cifra con count-up. Sub-componente porque `useCountUp` es un hook (uno por ítem). */
function StatItem({ item }: { item: EstadisticasProps["items"][number] }) {
  const { valor, ref } = useCountUp<HTMLSpanElement>(item.valor);
  const Icono = item.icono ? iconoBeneficio(item.icono) : null;
  return (
    <Stack gap={4} align="center" ta="center">
      {Icono && (
        <ThemeIcon variant="light" size="lg" radius="md">
          <Icono className="size-5" stroke={1.75} />
        </ThemeIcon>
      )}
      <Group gap={2} align="baseline" justify="center" wrap="nowrap">
        {item.prefijo && (
          <Text fz={{ base: 26, sm: 36 }} fw={800} lh={1}>
            {item.prefijo}
          </Text>
        )}
        <Text ref={ref} component="span" fz={{ base: 30, sm: 44 }} fw={800} lh={1} className="tabular-nums">
          {num(valor)}
        </Text>
        {item.sufijo && (
          <Text fz={{ base: 26, sm: 36 }} fw={800} lh={1}>
            {item.sufijo}
          </Text>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {item.etiqueta}
      </Text>
    </Stack>
  );
}
