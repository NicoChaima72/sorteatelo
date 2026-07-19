import { Badge, Box, Button, Group, Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowRight, IconGift, IconShoppingBag, IconTicket } from "@tabler/icons-react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/** Los 3 pasos FIJOS de la mecánica (producto → ticket → sorteo). Íconos internos (enum-libre acá). */
const MECANICA = [
  { icono: IconShoppingBag, titulo: "Compras", desc: "Elige un producto y paga seguro." },
  { icono: IconTicket, titulo: "Sumas tickets", desc: "Cada compra suma tickets al sorteo." },
  { icono: IconGift, titulo: "Participas", desc: "Entras automáticamente al sorteo activo." },
] as const;

/**
 * `bloque_ticket_promo` (sección, catálogo-v2 F06): explicador "compra = participas" — corazón del
 * modelo. La presencia del sorteo activo la decide el render (`useSorteoActivo`, server-side): con
 * `mostrarSorteoActivo` y sorteo activo ⇒ badge "Sorteo abierto". `mostrarMecanica` muestra los 3
 * pasos. No copia datos del sorteo al documento (I2).
 */
export function BloqueTicketPromo({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "bloque_ticket_promo" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const sorteo = useSorteoActivo();
  const hayCta = Boolean(props.ctaTexto);
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg" align="center" ta="center" maw={820} mx="auto">
        {props.mostrarSorteoActivo && sorteo.data && (
          <Badge
            variant="light"
            size="lg"
            radius="sm"
            leftSection={<IconTicket className="size-3.5" stroke={2} />}
            styles={{ label: { textTransform: "none" } }}
          >
            Sorteo abierto
          </Badge>
        )}
        <Title order={2} fz={{ base: 26, sm: 34 }} fw={800} lh={1.15}>
          {props.titulo}
        </Title>
        {props.descripcion && (
          <Text size="lg" c="dimmed" maw={620}>
            {props.descripcion}
          </Text>
        )}

        {props.mostrarMecanica && (
          <Group gap={0} justify="center" align="stretch" wrap="wrap" mt="xs">
            {MECANICA.map((paso, i) => {
              const Icono = paso.icono;
              return (
                <Group key={paso.titulo} gap="sm" wrap="nowrap" align="center">
                  <Paper withBorder radius="md" p="md" maw={220}>
                    <Stack gap={6} align="center" ta="center">
                      <ThemeIcon variant="light" size="xl" radius="md">
                        <Icono className="size-6" stroke={1.75} />
                      </ThemeIcon>
                      <Text fw={600}>{paso.titulo}</Text>
                      <Text size="sm" c="dimmed">
                        {paso.desc}
                      </Text>
                    </Stack>
                  </Paper>
                  {i < MECANICA.length - 1 && (
                    <Box component="span" visibleFrom="sm" style={{ lineHeight: 0 }}>
                      <IconArrowRight
                        className="size-5"
                        stroke={1.75}
                        color="var(--mantine-color-dimmed)"
                      />
                    </Box>
                  )}
                </Group>
              );
            })}
          </Group>
        )}

        {hayCta && (
          <Button
            component="a"
            href={props.ctaAncla === "sorteo" ? "#sorteo" : "#catalogo"}
            size="md"
            radius="md"
            mt="xs"
            className="animar-pulso-cta"
          >
            {props.ctaTexto}
          </Button>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
