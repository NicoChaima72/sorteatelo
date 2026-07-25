import { Box, Button, Stack, Text } from "@mantine/core";
import { IconConfetti } from "@tabler/icons-react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `momento_ticket` (sección, Tanda 2 F12): la tarjeta aspiracional "¡Estás dentro!" del prototipo dreamy
 * — la visualización del número de sorteo que recibes al comprar. Borde PUNTEADO del acento (con fallback
 * a marca, I-T2), ícono confetti FIJO (Tabler, parte de la identidad del widget), `codigoEjemplo` en un
 * chip MONO, CTA opcional. Contenido editorial (no depende del sorteo real). Cero hex (I-A): todo color
 * sale de tokens del tenant (`color-mix` para el borde/relleno punteado).
 */
export function MomentoTicket({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "momento_ticket" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  // Token del acento con fallback a marca (I-T2): el borde punteado y el CTA usan el acento del tenant.
  const acento = "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box
        maw={460}
        mx="auto"
        p="xl"
        ta="center"
        style={{
          borderRadius: "var(--mantine-radius-lg)",
          border: `2px dashed color-mix(in srgb, ${acento} 45%, transparent)`,
          background: "var(--mantine-color-body)",
          boxShadow: "var(--mantine-shadow-sm)",
        }}
      >
        <Stack gap="xs" align="center">
          <IconConfetti className="size-9" stroke={1.5} style={{ color: acento }} />
          <Text fw={800} fz={{ base: 20, sm: 24 }} lh={1.2}>
            {props.titulo}
          </Text>
          {props.etiqueta && (
            <Text fz="sm" c="dimmed">
              {props.etiqueta}
            </Text>
          )}
          <Box
            style={{
              display: "inline-block",
              borderRadius: "var(--mantine-radius-md)",
              background: "var(--mantine-primary-color-0)",
              padding: "8px 16px",
            }}
          >
            <Text
              component="span"
              fw={700}
              fz="lg"
              ff="monospace"
              style={{ letterSpacing: "0.12em", color: "var(--mantine-primary-color-filled)" }}
            >
              {props.codigoEjemplo}
            </Text>
          </Box>
          {props.ctaTexto && (
            <Button
              component="a"
              href={`#${props.ctaAncla}`}
              fullWidth
              mt="xs"
              radius="md"
              styles={{
                root: {
                  background: acento,
                  color: "var(--mantine-color-acento-contrast, var(--mantine-primary-color-contrast))",
                },
              }}
            >
              {props.ctaTexto}
            </Button>
          )}
          {props.nota && (
            <Text fz="xs" c="dimmed">
              {props.nota}
            </Text>
          )}
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}
