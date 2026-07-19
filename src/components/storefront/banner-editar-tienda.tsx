import { Anchor, Box, Container, Group, Text } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { debeMostrarBanner } from "~/lib/pagebuilder/banner";
import { hrefApex } from "~/lib/urlApex";
import { api } from "~/utils/api";

/**
 * Banner "Editar mi tienda" (F09/D11, ADR-0019; acciones actualizadas en F09c). Aparece SOLO para la
 * Organizadora (o el Operador) logueada que visita SU tienda, y SOLO **post-hidratación**: monta con
 * `useEffect` y consulta `pagebuilder.puedoEditar` (autorización por `TenantMembership` server-side, I7)
 * recién ahí. En SSR y hasta hidratar no existe ⇒ el HTML anónimo es idéntico para todos ⇒ CDN-cacheable
 * (riesgo R5).
 *
 * Chrome NEUTRO de PLATAFORMA (D13): barra oscura, NUNCA el color de marca del tenant (que sí tiñe el
 * resto del storefront). La marca de plataforma está PENDIENTE ⇒ neutro, sin inventar.
 */
export function BannerEditarTienda({ slug }: { slug: string }) {
  // Orden canónico (frontend-conventions): estado → query → efecto.
  const [montado, setMontado] = useState(false);
  const consulta = api.pagebuilder.puedoEditar.useQuery(undefined, {
    enabled: montado, // solo client-side tras montar: no toca el SSR
    retry: false,
  });
  useEffect(() => setMontado(true), []);

  if (!debeMostrarBanner({ montado, puedeEditar: consulta.data?.puedeEditar ?? false })) {
    return null;
  }

  return (
    <Box bg="dark.7" c="white" py={8}>
      <Container size="lg" px={{ base: "md", lg: "xl" }}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap" className="min-w-0">
            <IconPencil className="size-4 shrink-0" stroke={1.75} />
            <Text size="sm" fw={500} truncate>
              Estás viendo tu tienda publicada
            </Text>
          </Group>
          <Group gap="md" wrap="nowrap" className="shrink-0">
            {/* Acción PRIMARIA (F09c): editar la página de ESTA tienda → `/editor` relativo (misma tienda). */}
            <Anchor href="/editor" c="white" fw={700} size="sm" underline="always">
              Editar mi página
            </Anchor>
            {/* Secundaria: el panel del Organizador, en el apex (`/admin`) — fuente única `hrefApex` (F09c). */}
            <Anchor
              href={hrefApex({ path: "/admin", slug })}
              c="gray.4"
              fw={500}
              size="sm"
              underline="never"
              visibleFrom="xs"
            >
              Mi panel
            </Anchor>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
