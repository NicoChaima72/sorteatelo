import {
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconTicket } from "@tabler/icons-react";

import { useCountUp } from "~/components/storefront/animar";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { num } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** `py` más apretado por defecto (equivalente al `py={{ base:"lg", md:"xl" }}` previo). */
const ESTILO_CONTADOR_DEFAULT = EstiloSeccionSchema.parse({ padY: "m" });

/**
 * `contador_tickets` (F10): conteo REAL de tickets del sorteo ACTIVO (server-side vía `useSorteoActivo`
 * — sin PII, ADR-0004). Auto-oculto sin sorteo activo (§3). Con `metaTickets`, barra de progreso.
 */
export function ContadorTickets({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "contador_tickets" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const sorteo = useSorteoActivo();
  const total = sorteo.data?.totalParticipaciones ?? 0;
  // Count-up al entrar al viewport (F03): SSR = valor final; reduced-motion ⇒ inmediato (I-D/I-B).
  const { valor, ref } = useCountUp<HTMLHeadingElement>(total);
  if (sorteo.isError || !sorteo.data) return null; // auto-oculto sin sorteo

  const pct = props.metaTickets
    ? Math.min(100, Math.round((total / props.metaTickets) * 100))
    : null;

  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo ?? ESTILO_CONTADOR_DEFAULT}
      divisorColor={divisorColor}
    >
      <Stack gap="sm" align="center">
        <Group gap="xs">
          <ThemeIcon variant="light" size="lg" radius="md">
            <IconTicket className="size-5" stroke={1.75} />
          </ThemeIcon>
          <Text fw={600}>{props.etiqueta ?? "Tickets vendidos"}</Text>
        </Group>
        <Title
          ref={ref}
          order={2}
          fz={{ base: 40, sm: 56 }}
          fw={800}
          className="tabular-nums"
        >
          {num(valor)}
        </Title>
        {props.metaTickets !== undefined && (
          <Stack gap={4} w="100%" maw={420}>
            <Progress value={pct ?? 0} size="lg" radius="xl" />
            {props.mostrarPorcentaje && (
              <Text size="sm" c="dimmed" ta="center">
                {pct}% de la meta ({num(props.metaTickets)})
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
