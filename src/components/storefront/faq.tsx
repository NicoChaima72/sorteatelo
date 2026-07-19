import { Accordion, Box, Stack, Text, Title } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `faq` (sección, F11): preguntas frecuentes en acordeón. TEXTO PLANO pre-wrap con límites (I3, nunca
 * HTML interpretado). Reduce fricción de compra (buena para conversión). Ancho de LECTURA acotado
 * (maw centrado) dentro del wrapper compartido.
 */
export function Faq({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "faq" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box maw={620} mx="auto" w="100%">
        <Stack gap="lg">
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
            {props.titulo}
          </Title>
          <Accordion variant="separated" radius="md">
            {props.items.map((item, i) => (
              <Accordion.Item key={`${item.pregunta}-${i}`} value={`faq-${i}`}>
                <Accordion.Control>
                  <Text fw={600} size="sm">
                    {item.pregunta}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                    {item.respuesta}
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}
