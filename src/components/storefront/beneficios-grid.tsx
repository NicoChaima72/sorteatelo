import { Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { emojiBeneficio, iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `beneficios_grid` (sección, catálogo-v2 F04): grilla 2–6 de beneficios (ícono + título + desc).
 * Los íconos salen del enum `ICONOS_BENEFICIO` (mapeado a Tabler, nunca string libre — I-A). Estética
 * per-tenant: `ThemeIcon variant="light"` toma el primario de la escala del tenant (I-G). Hover-lift
 * CSS incorporado (F03). No depende de datos del tenant ⇒ SIEMPRE presente.
 *
 * `estiloItem` (fidelidad landing_idol prueba): `icono` (DEFAULT, no-op I-H) o `emoji_borde` = EMOJI a
 * color (set curado, D2) + card con borde de ACENTO dorado — las feature cards del mockup morado/BTS.
 */
export function BeneficiosGrid({
  nodo,
  divisorColor,
  comoHoja,
}: {
  nodo: Extract<SeccionNode, { tipo: "beneficios_grid" }>;
  divisorColor?: string;
  /** `true` ⇒ se renderiza como HOJA de una `fila` (sin chrome de sección propio, Tanda 3 F08/D14). */
  comoHoja?: boolean;
}) {
  const props = nodo.props;
  const emojiBorde = props.estiloItem === "emoji_borde";
  // Fidelidad landing_idol: las feature cards son SUPERFICIE (morado del ACENTO) con BORDE de acción
  // (dorado = PRIMARIO), como el `#1E0E45` + borde oro 20% del mockup. El borde usa el PRIMARIO (el color
  // de acción/oro del tenant); el relleno un morado de la escala del ACENTO oscurecido a nivel card. Cero
  // hex (I-A), ambos degradan a la marca sin acento.
  const bordeAccion = "color-mix(in srgb, var(--mantine-primary-color-filled) 32%, transparent)";
  const fondoFicha = "color-mix(in srgb, var(--mantine-color-acento-filled, var(--mantine-primary-color-8)) 66%, var(--mantine-color-black))";
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor} comoHoja={comoHoja}>
      <Stack gap="lg">
        {props.titulo && (
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700} ta="center" data-campo="titulo" className="st-titulo-poster">
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
                style={emojiBorde ? { borderColor: bordeAccion, background: fondoFicha } : undefined}
              >
                <Stack gap="sm">
                  {emojiBorde ? (
                    // Emoji a color del set curado (D2) — sin caja ThemeIcon, como el 📊/💸/🎤/🏦 del mockup.
                    <Text component="span" fz={28} lh={1} aria-hidden>
                      {emojiBeneficio(item.icono)}
                    </Text>
                  ) : (
                    <ThemeIcon variant="light" size="xl" radius="md">
                      <Icono className="size-6" stroke={1.75} />
                    </ThemeIcon>
                  )}
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
