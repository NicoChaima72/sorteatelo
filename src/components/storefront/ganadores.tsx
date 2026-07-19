import {
  Badge,
  Box,
  Card,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconTrophy } from "@tabler/icons-react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { useSorteoResumen } from "~/components/storefront/use-sorteo-activo";
import { fecha } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** Banda gris por defecto (equivalente visual al `default-hover`+borders previo, ahora tokenizado). */
const ESTILO_GANADORES_DEFAULT = EstiloSeccionSchema.parse({
  fondo: { tipo: "esquema", esquema: "superficie_alt" },
});

/** Tarjeta común (manual o automático): un nombre/enmascarado + premio + fecha/handle opcional. */
interface TarjetaGanador {
  nombre: string;
  premio: string;
  fecha?: string;
  handle?: string;
}

/**
 * `ganadores` (sección, v2 en catálogo-v2 F06). `fuente:"manual"` (default = look v1) usa la lista que
 * escribe el Organizador (texto plano, I3; consentimiento suyo, §3). `fuente:"automatico"` lee los
 * raffles CERRADOS del tenant con el ganador ENMASCARADO server-side (ADR-0004,
 * `getSorteoResumenStorefront`) — jamás el correo completo. Sin ganadores (lista vacía o sin
 * cerrados) ⇒ auto-oculto (no rompe la home).
 */
export function Ganadores({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "ganadores" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;

  // Modo automático: los ganadores salen del server (enmascarados). El hook siempre se llama (regla de
  // hooks); en modo manual se ignora su resultado.
  const resumen = useSorteoResumen(props.maxAutomaticos);
  const automaticos: TarjetaGanador[] =
    props.fuente === "automatico" && resumen.data
      ? resumen.data
          .filter((r) => r.ganadorEnmascarado) // solo cerrados con ganador registrado
          .map((r) => ({ nombre: r.ganadorEnmascarado!, premio: r.premio, fecha: fecha(r.fechaFin) }))
      : [];

  const manuales: TarjetaGanador[] = props.items ?? [];
  const tarjetas = props.fuente === "automatico" ? automaticos : manuales;

  if (tarjetas.length === 0) return null; // auto-oculto sin ganadores (§5.2)

  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo ?? ESTILO_GANADORES_DEFAULT}
      divisorColor={divisorColor}
    >
      <Stack gap="lg">
        <Group gap="xs">
          <ThemeIcon variant="light" size="lg" radius="md">
            <IconTrophy className="size-5" stroke={1.75} />
          </ThemeIcon>
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
            {props.titulo ?? "Nuestros ganadores"}
          </Title>
        </Group>
        {props.layout === "carrusel" ? (
          <ScrollArea offsetScrollbars scrollbarSize={8}>
            <Group gap="lg" wrap="nowrap" align="stretch">
              {tarjetas.map((item, i) => (
                <Box key={`${item.nombre}-${i}`} miw={240} maw={280}>
                  <Tarjeta item={item} />
                </Box>
              ))}
            </Group>
          </ScrollArea>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {tarjetas.map((item, i) => (
              <Tarjeta key={`${item.nombre}-${i}`} item={item} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </SeccionWrapper>
  );
}

function Tarjeta({ item }: { item: TarjetaGanador }) {
  return (
    <Card withBorder radius="md" padding="lg" h="100%" className="animar-hover-lift">
      <Stack gap="xs">
        <Text fw={700}>{item.nombre}</Text>
        <Badge variant="light" styles={{ label: { textTransform: "none" } }}>
          {item.premio}
        </Badge>
        {item.fecha && (
          <Text size="xs" c="dimmed">
            {item.fecha}
          </Text>
        )}
        {item.handle && (
          <Text size="xs" c="dimmed">
            {item.handle}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
