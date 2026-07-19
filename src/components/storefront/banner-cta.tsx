import { Button, Stack, Text, Title } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/**
 * `banner_cta` (sección, catálogo-v2 F04): banda CTA sobre fondo de marca / gradiente / imagen. El
 * fondo lo maneja el propio widget desde sus props: con `imagenFondoUrl` ⇒ fondo de imagen con overlay
 * `tinta` (opacidad = `overlayOscuridad`, contraste garantizado); SIN imagen ⇒ gradiente de marca
 * (`marca_vivo`) — degradación elegante (I-G). Si el Organizador define un `estilo` explícito, ese
 * gana (nodo.estilo ?? default). El texto hereda el color CLARO emparejado del fondo (legible por
 * construcción). El botón lleva el pulso CSS del CTA principal (F03).
 */
export function BannerCta({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "banner_cta" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const estilo =
    nodo.estilo ??
    EstiloSeccionSchema.parse({
      fondo: props.imagenFondoUrl
        ? {
            tipo: "imagen",
            url: props.imagenFondoUrl,
            overlay: "tinta",
            opacidadOverlay: props.overlayOscuridad,
          }
        : { tipo: "gradiente", preset: "marca_vivo" },
      padY: "xl",
    });

  return (
    <SeccionWrapper id={nodo.id} estilo={estilo} divisorColor={divisorColor}>
      <Stack gap="md" align="center" ta="center" maw={720} mx="auto">
        <Title order={2} fz={{ base: 26, sm: 36 }} fw={800} lh={1.15} c="inherit">
          {props.titulo}
        </Title>
        {props.subtitulo && (
          <Text fz={{ base: "md", sm: "lg" }} c="inherit" opacity={0.9}>
            {props.subtitulo}
          </Text>
        )}
        <Button
          component="a"
          href={`#${props.ctaAncla}`}
          variant="white"
          size="lg"
          radius="xl"
          mt="xs"
          className="animar-pulso-cta"
        >
          {props.ctaTexto}
        </Button>
      </Stack>
    </SeccionWrapper>
  );
}
