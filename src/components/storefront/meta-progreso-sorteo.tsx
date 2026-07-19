import { Box, Group, Progress, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconFlag, IconTemperature } from "@tabler/icons-react";

import { useCountUp } from "~/components/storefront/animar";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { num } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `meta_progreso_sorteo` (sección, catálogo-v2 F06): barra/termómetro hacia la meta de tickets
 * (goal-gradient). La META viene del documento (`metaTickets`); el PROGRESO real (conteo de tickets)
 * lo da el server (`useSorteoActivo` — sin PII, I2/ADR-0004). Auto-oculto sin sorteo activo (§5.2).
 * count-up del conteo (F03: SSR = valor final). `hitos` son marcas intermedias sobre la barra.
 */
export function MetaProgresoSorteo({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "meta_progreso_sorteo" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const sorteo = useSorteoActivo();
  const total = sorteo.data?.totalParticipaciones ?? 0;
  const { valor, ref } = useCountUp<HTMLSpanElement>(total);
  if (sorteo.isError || !sorteo.data) return null; // auto-oculto sin sorteo activo

  const pct = Math.min(100, Math.round((total / props.metaTickets) * 100));
  const restantes = Math.max(0, props.metaTickets - total);
  const esTermometro = props.estilo === "termometro";

  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="md" maw={640} mx="auto">
        <Group gap="xs" justify="center">
          <ThemeIcon variant="light" size="lg" radius="md">
            {esTermometro ? (
              <IconTemperature className="size-5" stroke={1.75} />
            ) : (
              <IconFlag className="size-5" stroke={1.75} />
            )}
          </ThemeIcon>
          <Title order={2} fz={{ base: 20, sm: 26 }} fw={700} ta="center">
            {props.titulo ?? "Meta del sorteo"}
          </Title>
        </Group>

        <Group justify="space-between" align="baseline">
          <Text fz={{ base: 24, sm: 30 }} fw={800} className="tabular-nums">
            <span ref={ref}>{num(valor)}</span>{" "}
            <Text span size="sm" c="dimmed" fw={500}>
              / {num(props.metaTickets)} tickets
            </Text>
          </Text>
          <Text fw={700} c="var(--mantine-primary-color-filled)" className="tabular-nums">
            {pct}%
          </Text>
        </Group>

        {/* Barra + hitos. La barra reserva su alto (CLS=0, I-C); los hitos se posicionan encima. */}
        <Box style={{ position: "relative" }}>
          <Progress value={pct} size={esTermometro ? "xl" : "lg"} radius="xl" />
          {props.hitos?.map((hito, i) => {
            const izq = Math.min(100, (hito.en / props.metaTickets) * 100);
            return (
              <Box
                key={i}
                style={{ position: "absolute", top: "100%", left: `${izq}%`, transform: "translateX(-50%)", marginTop: 4 }}
              >
                <Text size="xs" c="dimmed" ta="center" style={{ whiteSpace: "nowrap" }}>
                  {hito.etiqueta}
                </Text>
              </Box>
            );
          })}
        </Box>

        {props.mostrarRestantes && restantes > 0 && (
          <Text size="sm" c="dimmed" ta="center" mt={props.hitos?.length ? "lg" : 0}>
            Faltan {num(restantes)} tickets para llegar a la meta.
          </Text>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
