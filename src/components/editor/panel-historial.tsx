import { ActionIcon, Button, Card, Group, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconRestore } from "@tabler/icons-react";

import { fecha } from "~/lib/formato";
import { api } from "~/utils/api";

/**
 * Panel de HISTORIAL de publicaciones (catálogo-v2 F10/F12): lista las revisiones y permite RESTAURAR
 * una vieja al Borrador (`revertir` → `revertirPagina`). El rollback NO publica (I6): copia la revisión
 * al borrador y hay que Publicar de nuevo. Tras restaurar, el editor recarga el borrador y la preview.
 */
export function PanelHistorial({
  onVolver,
  onRevertido,
}: {
  onVolver: () => void;
  onRevertido: () => void;
}) {
  const versiones = api.pagebuilder.listarVersiones.useQuery(undefined, { retry: false });
  const revertir = api.pagebuilder.revertir.useMutation({
    onSuccess: () => {
      notifications.show({
        color: "teal",
        title: "Restaurado al borrador",
        message: "Revisa el resultado y publica para hacerlo visible.",
      });
      onRevertido();
    },
    onError: (e) => notifications.show({ color: "red", title: "No se pudo restaurar", message: e.message }),
  });

  return (
    <Stack gap="sm" p="md">
      <Group gap="xs" wrap="nowrap">
        <ActionIcon variant="subtle" onClick={onVolver} aria-label="Volver a la lista">
          <IconArrowLeft className="size-4" />
        </ActionIcon>
        <Text fw={600}>Historial de publicaciones</Text>
      </Group>

      {versiones.isLoading ? (
        <Group justify="center" p="md"><Loader /></Group>
      ) : !versiones.data || versiones.data.length === 0 ? (
        <Text size="sm" c="dimmed">Todavía no publicaste ninguna versión.</Text>
      ) : (
        <Stack gap={6}>
          {versiones.data.map((v) => (
            <Card key={v.revision} withBorder padding="xs" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500}>Versión {v.revision}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {fecha(v.createdAt)}
                    {v.publishedBy ? ` · ${v.publishedBy}` : ""}
                  </Text>
                </div>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconRestore className="size-3.5" />}
                  loading={revertir.isPending && revertir.variables?.revision === v.revision}
                  onClick={() => revertir.mutate({ revision: v.revision })}
                >
                  Restaurar
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
