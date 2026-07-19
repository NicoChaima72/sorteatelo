import { Blockquote, Box, List, Stack, Text, Title } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type BloqueTexto } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `texto_rico` (sección, catálogo-v2 F04): cuerpo editorial estructurado por bloques TIPADOS
 * (subtítulo/párrafo/cita/lista) — NUNCA HTML (I3). Cada bloque se despacha por un switch exhaustivo.
 * `ancho:"estrecho"` acota la columna de lectura (prosa). Texto plano `pre-wrap` (respeta saltos).
 */
export function TextoRico({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "texto_rico" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const maw = props.ancho === "estrecho" ? 680 : undefined;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box maw={maw} mx={maw ? "auto" : undefined}>
        <Stack gap="md">
          {props.bloques.map((bloque, i) => (
            <BloqueRender key={i} bloque={bloque} />
          ))}
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}

/** Despacho de un bloque por `tipo` (discriminated-union cerrada; exhaustivo con candado `never`). */
function BloqueRender({ bloque }: { bloque: BloqueTexto }) {
  switch (bloque.tipo) {
    case "subtitulo":
      return (
        <Title order={3} fz={{ base: 20, sm: 24 }} fw={700}>
          {bloque.texto}
        </Title>
      );
    case "parrafo":
      return <Text style={{ whiteSpace: "pre-wrap" }}>{bloque.texto}</Text>;
    case "cita":
      return (
        <Blockquote cite={bloque.autor ? `— ${bloque.autor}` : undefined} radius="md">
          {bloque.texto}
        </Blockquote>
      );
    case "lista":
      return (
        <List type={bloque.estilo === "numerada" ? "ordered" : "unordered"} spacing="xs">
          {bloque.items.map((item, i) => (
            <List.Item key={i}>{item}</List.Item>
          ))}
        </List>
      );
    default: {
      const _exhaustivo: never = bloque;
      void _exhaustivo;
      return null;
    }
  }
}
