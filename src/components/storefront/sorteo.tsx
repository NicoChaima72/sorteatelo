import {
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconGift, IconScale } from "@tabler/icons-react";

import { fecha, num } from "~/lib/formato";
import { api } from "~/utils/api";

/**
 * Sección del sorteo ACTIVO del storefront (F05/D8, ADR-0008). Consume `getSorteoActivoStorefront`
 * (público, tenant-scoped, SIN correos). Solo aparece cuando hay un sorteo ACTIVO; con él, el
 * DISCLAIMER del sorteo es OBLIGATORIO y visible (I8/D7/ADR-0008): texto fijo de plataforma que deja
 * claro que el responsable del sorteo es el Organizador, no la plataforma. No es configurable por tenant.
 *
 * Es una sección opcional/decorativa de la home: si la query falla o no hay sorteo, simplemente no se
 * renderiza (el catálogo es el contenido principal) — no rompe la home con un error.
 */

/** Disclaimer FIJO de plataforma (S8; redacción legal fina se ajusta con abogado en F10, ADR-0008). */
const DISCLAIMER_SORTEO =
  "Este sorteo es organizado y ejecutado exclusivamente por quien opera esta tienda, único " +
  "responsable de sus bases, premios y resultado. La plataforma solo provee la tecnología: no " +
  "organiza el sorteo ni responde por su ejecución. Revisa las bases antes de participar.";

export function SorteoStorefront() {
  const sorteo = api.checkout.getSorteoActivoStorefront.useQuery(undefined, {
    retry: false,
  });

  if (sorteo.isLoading) return <Skeleton height={160} radius="md" />;
  if (sorteo.isError || !sorteo.data) return null;

  const s = sorteo.data;

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group gap="xs" wrap="nowrap">
          <IconGift className="size-5" stroke={1.75} />
          <Text fw={700} fz="lg">
            Sorteo activo
          </Text>
        </Group>

        <Stack gap={4}>
          <Text fw={600}>{s.nombre}</Text>
          <Text size="sm">
            Premio: <strong>{s.premio}</strong>
          </Text>
          <Text size="sm" c="dimmed">
            Vigente del {fecha(s.fechaInicio)} al {fecha(s.fechaFin)}
          </Text>
          <Group gap="xs" mt={4}>
            <Badge variant="light" styles={{ label: { textTransform: "none" } }}>
              {num(s.totalParticipaciones)}{" "}
              {s.totalParticipaciones === 1 ? "participación" : "participaciones"}
            </Badge>
          </Group>
        </Stack>

        {s.basesTexto && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
            {s.basesTexto}
          </Text>
        )}
        {s.basesUrl && (
          <Anchor href={s.basesUrl} target="_blank" rel="noreferrer" size="sm">
            Ver las bases completas
          </Anchor>
        )}

        <Alert
          variant="light"
          color="gray"
          icon={<IconScale className="size-[18px]" />}
          title="Responsabilidad del sorteo"
        >
          <Text size="xs">{DISCLAIMER_SORTEO}</Text>
        </Alert>
      </Stack>
    </Card>
  );
}
