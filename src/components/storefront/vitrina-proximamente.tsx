import { AspectRatio, Badge, Box, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";

import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `vitrina_proximamente` (sección, Tanda 2 F01/D1): grid de LANZAMIENTOS FUTUROS bloqueados — el caso
 * "Un libro a la vez" del mockup `tienda-libro.html` (bcac). Cada ítem es un cover con TRATAMIENTO
 * BLOQUEADO (grayscale + opacidad), un candado superpuesto y el estado "Próximamente". Sin `imagenUrl`
 * degrada a un placeholder tematizado (I-G, `<ImagenConFallback>` sin `src`). Cero hex inline (I-A): el
 * candado/estado usan tokens de la escala del tenant. Es contenido editorial (no depende del sorteo).
 */
export function VitrinaProximamente({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "vitrina_proximamente" }>;
  colorPrimario: string | null;
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
        <SimpleGrid cols={{ base: 1, xs: 2, md: props.columnas }} spacing="lg">
          {props.items.map((item, i) => (
            <Stack key={`${item.titulo}-${i}`} gap="xs">
              <Box pos="relative" style={{ borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}>
                <AspectRatio ratio={3 / 4}>
                  {/* Tratamiento "bloqueado": la portada va en grayscale + opacidad baja. Sin imagenUrl
                      cae al placeholder tematizado (I-G). */}
                  <ImagenConFallback
                    src={item.imagenUrl}
                    alt={item.titulo}
                    colorPrimario={colorPrimario}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      filter: "grayscale(1)",
                      opacity: 0.55,
                    }}
                  />
                </AspectRatio>
                {/* Candado centrado sobre la portada (Tabler, cero hex — color del texto del shell). */}
                <Box
                  aria-hidden
                  pos="absolute"
                  inset={0}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
                >
                  <IconLock className="size-8" stroke={1.75} color="var(--mantine-color-white)" opacity={0.9} />
                </Box>
                <Badge
                  variant="light"
                  radius="sm"
                  pos="absolute"
                  bottom={8}
                  left={8}
                  leftSection={<IconLock className="size-3" stroke={2} />}
                  styles={{ label: { textTransform: "none" } }}
                >
                  Próximamente
                </Badge>
              </Box>
              <Text fw={600} lh={1.2}>
                {item.titulo}
              </Text>
              {item.subtitulo && (
                <Text size="sm" c="dimmed">
                  {item.subtitulo}
                </Text>
              )}
            </Stack>
          ))}
        </SimpleGrid>
        {props.notaPie && (
          <Text size="sm" c="dimmed" ta="center" maw={560} mx="auto">
            {props.notaPie}
          </Text>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
