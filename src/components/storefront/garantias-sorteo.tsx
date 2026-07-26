import { Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconScale } from "@tabler/icons-react";

import { iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `garantias_sorteo` (sección, catálogo-v2 F06): "cómo elegimos al ganador" — transparencia (anti
 * caso Naya Fácil). `metodo` = texto plano de cómo se ejecuta el sorteo; `items` = puntos de confianza
 * (ícono del enum ICONOS_BENEFICIO + título + desc). Contenido editorial, sin datos server-side.
 *
 * `estiloVisual` (builder-dreamy-secciones F02/D5) es un RE-SKIN, no un cambio de estructura: `clasico`
 * (default no-op, I-H) deja el render de siempre; `dreamy` cambia solo DOS cosas del prototipo
 * `dev-ref/variant-dreamy` (L225-231) — la superficie de la card (translúcida con ring BLANCO en vez del
 * borde gris del `withBorder`) y la FORMA de la caja del ícono (círculo relleno suave en vez del cuadrado
 * `radius="md"`). El grid, el header y el modelo de contenido (`items[]`, `metodo`) quedan intactos (I5).
 * Cero hex: todo sale de tokens del tenant vía `light-dark()`/`color-mix()` (I1).
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
  const dreamy = props.estiloVisual === "dreamy";
  /** Radio de la caja del ícono: `xl` ⇒ círculo (dreamy); `md` ⇒ el cuadrado redondeado de siempre. */
  const radioIcono = dreamy ? "xl" : "md";
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg" maw={900} mx="auto">
        <Stack gap="sm" align="center" ta="center">
          <ThemeIcon variant="light" size="xl" radius={radioIcono}>
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
                <Card
                  key={`${item.titulo}-${i}`}
                  withBorder={!dreamy}
                  radius={dreamy ? "lg" : "md"}
                  padding="lg"
                  h="100%"
                  className="animar-hover-lift"
                  // dreamy: card AIREADA — blanco translúcido + ring BLANCO (misma receta que la stat-card
                  // dreamy de `estadisticas.tsx` y que el paso dreamy de `como-funciona.tsx`).
                  style={
                    dreamy
                      ? {
                          background:
                            "light-dark(color-mix(in srgb, var(--mantine-color-white) 70%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 70%, transparent))",
                          border:
                            "1px solid light-dark(color-mix(in srgb, var(--mantine-color-white), transparent 20%), var(--mantine-color-dark-4))",
                        }
                      : undefined
                  }
                >
                  <Stack gap="sm">
                    <ThemeIcon variant="light" size="lg" radius={radioIcono}>
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
