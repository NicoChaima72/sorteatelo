import { Button, Group, Stack, Text } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import {
  formatoCompacto,
  useCountdown,
} from "~/components/storefront/use-countdown";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** Banda gris por defecto cuando `intensidad:"fuerte"` y no hay estilo (equivalente al look previo). */
const ESTILO_FUERTE_DEFAULT = EstiloSeccionSchema.parse({
  padY: "m",
  fondo: { tipo: "esquema", esquema: "superficie_alt" },
});
/** Sin banda por defecto en `suave` (transparente, `py` m). */
const ESTILO_SUAVE_DEFAULT = EstiloSeccionSchema.parse({ padY: "m" });

/**
 * `urgencia_countdown` (F10): cuenta regresiva al cierre del sorteo ACTIVO. Auto-oculto sin sorteo o
 * si ya venció (§3). El componente interno aísla `useCountdown` para no llamar un hook condicional.
 */
export function UrgenciaCountdown({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "urgencia_countdown" }>;
  divisorColor?: string;
}) {
  const sorteo = useSorteoActivo();
  if (sorteo.isError || !sorteo.data) return null; // auto-oculto sin sorteo
  return (
    <UrgenciaInner
      fechaFin={sorteo.data.fechaFin}
      nodo={nodo}
      divisorColor={divisorColor}
    />
  );
}

function UrgenciaInner({
  fechaFin,
  nodo,
  divisorColor,
}: {
  fechaFin: Date;
  nodo: Extract<SeccionNode, { tipo: "urgencia_countdown" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const t = useCountdown(fechaFin);
  if (t.terminado) return null; // auto-oculto al vencer

  const fuerte = props.intensidad === "fuerte";
  const ctaHref = props.ctaAncla === "sorteo" ? "#sorteo" : "#catalogo";
  const estilo =
    nodo.estilo ?? (fuerte ? ESTILO_FUERTE_DEFAULT : ESTILO_SUAVE_DEFAULT);

  return (
    <SeccionWrapper id={nodo.id} estilo={estilo} divisorColor={divisorColor}>
      <Stack gap="md" align="center">
        <Group gap="xs">
          <IconClock
            className="size-5"
            stroke={1.75}
            color="var(--mantine-primary-color-filled)"
          />
          <Text fw={600}>{props.mensaje ?? "El sorteo cierra pronto"}</Text>
        </Group>
        <Text
          fz={{ base: 32, sm: 44 }}
          fw={800}
          className={fuerte ? "tabular-nums animar-pulso" : "tabular-nums"}
        >
          {formatoCompacto(t)}
        </Text>
        {props.ctaTexto && (
          <Button component="a" href={ctaHref} size="md" radius="md">
            {props.ctaTexto}
          </Button>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
