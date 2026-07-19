import { Box, Center, Stack, Title } from "@mantine/core";

import { EmbedFacade } from "~/components/storefront/embed-facade";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `video` (sección, F11): video embebido iframe-only sobre el contrato de F07 (`<EmbedFacade>` →
 * `<EmbedFrame>`, sandbox de ADR-0018). La `src` la construye `construirEmbedSrc(plataforma, videoId)`
 * — NUNCA HTML crudo (I3/I4). Facade lazy: el iframe carga al click. Ref inválida ⇒ no renderiza.
 */
export function Video({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "video" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box maw={640} mx="auto" w="100%">
        <Stack gap="lg">
          {props.titulo && (
            <Title order={2} fz={{ base: 24, sm: 30 }} fw={700} ta="center">
              {props.titulo}
            </Title>
          )}
          <Center>
            <EmbedFacade
              red={props.plataforma}
              referencia={props.videoId}
              titulo={props.titulo ?? "Video"}
              ratio={props.ratio}
            />
          </Center>
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}
