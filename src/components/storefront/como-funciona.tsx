import {
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconBolt,
  IconClock,
  IconDownload,
  IconGift,
  IconShieldCheck,
  IconShoppingBag,
  IconSparkles,
  IconTicket,
  type IconProps,
} from "@tabler/icons-react";
import { type ComponentType } from "react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * Sección "Cómo funciona" (widget `como_funciona`, F05/ADR-0016; plantilla-rica F04, design.md §5.1
 * pto 5). Sin `props.pasos` ⇒ los 3 pasos FIJOS de plataforma (comprar → recibir el PDF → entrar al
 * sorteo). Con pasos ⇒ los del documento, cada uno con su `icono` (enum cerrado mapeado acá — nunca
 * string libre) y textos con límite. No depende de datos del tenant ⇒ SIEMPRE presente.
 */

/** Mapa del enum `ICONOS_PASO` (documento) al ícono Tabler (render). Enum cerrado ⇒ sin string libre. */
const ICONOS: Record<string, ComponentType<IconProps>> = {
  compra: IconShoppingBag,
  descarga: IconDownload,
  ticket: IconTicket,
  regalo: IconGift,
  escudo: IconShieldCheck,
  rayo: IconBolt,
  chispa: IconSparkles,
  reloj: IconClock,
};

/** Los 3 pasos FIJOS de plataforma (fallback cuando el documento no define `pasos`). */
const PASOS_FIJOS = [
  {
    icono: "compra",
    titulo: "Compra tu producto",
    desc: "Elige lo que quieres, paga de forma segura con tu tarjeta. No necesitas crear una cuenta.",
  },
  {
    icono: "descarga",
    titulo: "Recibe tu descarga",
    desc: "Te llega al correo el enlace para descargar tu producto al instante, apenas se confirma el pago.",
  },
  {
    icono: "ticket",
    titulo: "Entra al sorteo",
    desc: "Si el producto participa, tu compra suma tickets al sorteo de la tienda automáticamente.",
  },
];

export function ComoFunciona({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "como_funciona" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const pasos =
    props.pasos && props.pasos.length > 0 ? props.pasos : PASOS_FIJOS;

  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo}
      divisorColor={divisorColor}
    >
      <Stack gap="lg">
        <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
          {props.titulo}
        </Title>

        {props.layout === "lista" ? (
          <ListaMetodo pasos={pasos} />
        ) : (
          <SimpleGrid
            cols={{ base: 1, sm: pasos.length >= 3 ? 3 : pasos.length }}
            spacing="lg"
          >
            {pasos.map((paso, i) => {
              const Icono = ICONOS[paso.icono] ?? IconSparkles;
              return (
                <Card key={`${paso.titulo}-${i}`} withBorder radius="md" padding="lg">
                  <Stack gap="sm">
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon variant="light" size="xl" radius="md">
                        <Icono className="size-6" stroke={1.75} />
                      </ThemeIcon>
                      <Text fz={28} fw={800} c="dimmed" className="tabular-nums">
                        {i + 1}
                      </Text>
                    </Group>
                    <Text fw={600}>{paso.titulo}</Text>
                    <Text size="sm" c="dimmed">
                      {paso.desc}
                    </Text>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </Stack>
    </SeccionWrapper>
  );
}

/**
 * Layout `lista` (Tanda 2 F15/fidelidad editorial): el "método" del prototipo editorial — lista NUMERADA
 * vertical, numeral serif itálico grande de marca a la izquierda + título (serif) + desc, con un divisor
 * inferior sutil entre pasos (excepto el último). Elegante y sobrio (sin cards ni íconos). Cero hex (I-A).
 */
function ListaMetodo({
  pasos,
}: {
  pasos: { icono: string; titulo: string; desc: string }[];
}) {
  return (
    <Stack gap={0}>
      {pasos.map((paso, i) => (
        <Group
          key={`${paso.titulo}-${i}`}
          gap="lg"
          align="flex-start"
          wrap="nowrap"
          py="lg"
          style={
            i < pasos.length - 1
              ? { borderBottom: "1px solid var(--mantine-color-default-border)" }
              : undefined
          }
        >
          <Text
            span
            fw={700}
            fz={{ base: 30, sm: 36 }}
            lh={1}
            className="tabular-nums"
            style={{
              fontFamily: "var(--mantine-font-family-headings)",
              fontStyle: "italic",
              color: "var(--mantine-primary-color-filled)",
              flex: "0 0 auto",
            }}
          >
            {i + 1}
          </Text>
          <Stack gap={4}>
            <Text
              fw={700}
              fz={{ base: 16, sm: 18 }}
              style={{ fontFamily: "var(--mantine-font-family-headings)" }}
            >
              {paso.titulo}
            </Text>
            <Text size="sm" c="dimmed">
              {paso.desc}
            </Text>
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}
