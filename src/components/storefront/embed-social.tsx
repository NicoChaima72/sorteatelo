import { Box, Center, Stack, Text } from "@mantine/core";

import { EmbedFacade } from "~/components/storefront/embed-facade";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `embed_social` (sección, F11): post social embebido iframe-only sobre F07 (`<EmbedFacade>` →
 * `<EmbedFrame>`). La `src` la arma `construirEmbedSrc(red, ref)` desde un id/handle validado por
 * regex — NUNCA el `blockquote`+`<script>` de la plataforma ni HTML crudo (I3/I4). Ratio vertical
 * (9:16) por defecto para el formato de post social. Ref inválida ⇒ no renderiza.
 */
export function EmbedSocial({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "embed_social" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box maw={540} mx="auto" w="100%">
        <Stack gap="md" align="center">
          <Center>
            <EmbedFacade
              red={props.red}
              referencia={props.ref}
              titulo={props.leyenda ?? "Publicación"}
              ratio="9:16"
            />
          </Center>
          {props.leyenda && (
            <Text size="sm" c="dimmed" ta="center" maw={360}>
              {props.leyenda}
            </Text>
          )}
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}
