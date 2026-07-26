import {
  Box,
  Card,
  Flex,
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
        <Title order={2} fz={{ base: 24, sm: 30 }} fw={700} className="st-titulo-poster">
          {props.titulo}
        </Title>

        {props.layout === "lista" ? (
          <ListaMetodo pasos={pasos} />
        ) : props.estiloTarjeta === "dreamy" ? (
          <PasosDreamy pasos={pasos} />
        ) : (
          <SimpleGrid
            cols={{ base: 1, sm: pasos.length >= 3 ? 3 : pasos.length }}
            spacing="lg"
          >
            {pasos.map((paso, i) => {
              const Icono = ICONOS[paso.icono] ?? IconSparkles;
              const contorno = props.estiloTarjeta === "contorno";
              return (
                <Card
                  key={`${paso.titulo}-${i}`}
                  withBorder
                  radius="md"
                  padding="lg"
                  // `contorno`: la card se FUNDE con el fondo de la sección (bg transparente) y solo un
                  // borde sutil la delinea — sin el relleno del body (que sobre un fondo oscuro cálido lee
                  // marrón). Cero hex (I-A).
                  style={
                    contorno
                      ? { background: "transparent", borderColor: "color-mix(in srgb, currentColor 18%, transparent)" }
                      : undefined
                  }
                >
                  <Stack gap="sm">
                    <Group gap="sm" wrap="nowrap">
                      {contorno ? (
                        // Ícono SIN caja rellena (evita el tinte marrón): solo el glifo en el color de acción
                        // (primario), dentro de un cuadro de borde sutil.
                        <ThemeIcon
                          variant="default"
                          size="xl"
                          radius="md"
                          styles={{
                            root: {
                              background: "transparent",
                              border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
                              color: "var(--mantine-primary-color-filled)",
                            },
                          }}
                        >
                          <Icono className="size-6" stroke={1.75} />
                        </ThemeIcon>
                      ) : (
                        <ThemeIcon variant="light" size="xl" radius="md">
                          <Icono className="size-6" stroke={1.75} />
                        </ThemeIcon>
                      )}
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
 * Estilo `dreamy` del layout `tarjetas` (builder-dreamy-secciones F01/D4): el paso EXACTO del prototipo
 * `dev-ref/variant-dreamy` (L171-179). Tres diferencias con `solida`/`contorno`, todas del prototipo:
 *  (1) la card es AIREADA — blanco translúcido + ring BLANCO (sin el borde gris del `withBorder`), radio
 *      generoso y sin sombra (misma familia que la stat-card dreamy de `estadisticas.tsx`);
 *  (2) el ícono Tabler NO se pinta: lo reemplaza un CÍRCULO RELLENO en el primario con el NÚMERO del paso
 *      (el numeral dejó de ser el texto dimmed al lado del ícono y pasó a ser el protagonista);
 *  (3) el contenido va a la IZQUIERDA en una FILA (círculo + texto) que pasa a COLUMNA en desktop.
 * `paso.icono` sigue siendo requerido por el schema (sin cambio de shape, I5) pero acá no se usa.
 * Cero hex: todo sale de tokens del tenant vía `light-dark()`/`color-mix()` (I1).
 */
function PasosDreamy({
  pasos,
}: {
  pasos: { icono: string; titulo: string; desc: string }[];
}) {
  return (
    <SimpleGrid
      cols={{ base: 1, sm: pasos.length >= 3 ? 3 : pasos.length }}
      spacing="md"
    >
      {pasos.map((paso, i) => (
        <Flex
          key={`${paso.titulo}-${i}`}
          className="st-paso-dreamy"
          gap="sm"
          // El quiebre fila→columna va en `sm`, el MISMO breakpoint donde el `SimpleGrid` de arriba pasa a
          // N columnas: si la card quebrara más tarde (md), entre 48em y 62em habría 3 columnas angostas
          // con el círculo y el texto todavía lado a lado. Un solo corte para la sección entera.
          direction={{ base: "row", sm: "column" }}
          align="flex-start"
          p={{ base: "md", sm: "lg" }}
          h="100%"
          style={{
            background:
              "light-dark(color-mix(in srgb, var(--mantine-color-white) 70%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 70%, transparent))",
            borderRadius: "var(--mantine-radius-lg)",
            // ring BLANCO/airy (≈ sin borde): NO el `--mantine-color-default-border` gris del `withBorder`.
            border:
              "1px solid light-dark(color-mix(in srgb, var(--mantine-color-white), transparent 20%), var(--mantine-color-dark-4))",
          }}
        >
          <Box
            className="st-paso-dreamy-num tabular-nums"
            w={{ base: 36, sm: 44 }}
            h={{ base: 36, sm: 44 }}
            fz={{ base: 14, sm: 16 }}
            fw={800}
            style={{
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "var(--mantine-primary-color-filled)",
              color: "var(--mantine-primary-color-contrast)",
            }}
          >
            {i + 1}
          </Box>
          <Box miw={0}>
            <Text fw={700} fz={{ base: 14, sm: 16 }} lh={1.3}>
              {paso.titulo}
            </Text>
            <Text c="dimmed" fz={{ base: 12, sm: 14 }} lh={1.5} mt={2}>
              {paso.desc}
            </Text>
          </Box>
        </Flex>
      ))}
    </SimpleGrid>
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
