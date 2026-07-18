import { Badge, Button, Card, Divider, Group, Paper, SimpleGrid, Skeleton, Stack, Table, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarEvent,
  IconPlayerPlay,
  IconTicket,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";

import { AdminLayout } from "~/components/admin/admin-layout";
import { AssetUploader } from "~/components/admin/asset-uploader";
import { EmptyState } from "~/components/admin/empty-state";
import { StatCard } from "~/components/admin/stat-card";
import { fechaHora, num } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

export default function SorteoPage() {
  const utils = api.useUtils();
  const sorteoQuery = api.panel.getSorteo.useQuery(undefined, { retry: false });

  const ejecutar = api.panel.ejecutarSorteo.useMutation({
    onSuccess: async () => {
      await utils.panel.getSorteo.invalidate();
      notifications.show({
        message: "Sorteo ejecutado. Ya hay un ganador.",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const sorteo = sorteoQuery.data?.sorteo ?? null;
  const ejecutado = sorteo?.ejecutadoAt != null;

  // Confirmación destructiva (D6/I7): la ejecución es IRREVERSIBLE — abre un modal explícito
  // con `openConfirmModal` (reemplaza el Dialog ad-hoc). No auto-ejecuta: espera confirmación.
  const confirmarEjecucion = () => {
    if (!sorteo) return;
    modals.openConfirmModal({
      title: "Ejecutar el sorteo",
      children: (
        <Text size="sm">
          Se elegirá un ganador al azar entre las{" "}
          {num(sorteo.totalParticipaciones)} participaciones (tickets). Esta
          acción registra quién y cuándo lo ejecutó y{" "}
          <Text span fw={600} c="var(--mantine-color-text)">
            no se puede deshacer
          </Text>
          .
        </Text>
      ),
      labels: { confirm: "Sí, ejecutar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => ejecutar.mutate({ raffleId: sorteo.id }),
    });
  };

  return (
    <AdminLayout
      title="Sorteo"
      description="Administra el sorteo activo, sus participantes y el ganador."
    >
      {sorteoQuery.isLoading ? (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Skeleton height={104} radius="md" />
            <Skeleton height={104} radius="md" />
            <Skeleton height={104} radius="md" />
          </SimpleGrid>
          <Skeleton height={160} radius="md" />
        </Stack>
      ) : sorteoQuery.isError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <Text size="sm" c="red">
            No pudimos cargar el sorteo.
          </Text>
          <Button
            variant="default"
            mt="md"
            onClick={() => void sorteoQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : !sorteo ? (
        <EmptyState
          icon={IconTicket}
          title="Todavía no hay un sorteo en tu tienda"
          description="Los sorteos se arman con las ventas de tu tienda. Cuando tengas uno activo, lo administras acá."
        />
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <StatCard
              label="Participaciones"
              value={num(sorteo.totalParticipaciones)}
              icon={IconUsers}
              hint="tickets en el sorteo"
            />
            <StatCard
              label="Estado"
              value={sorteo.estado === "ACTIVO" ? "Activo" : "Cerrado"}
              icon={IconTicket}
              hint={ejecutado ? "sorteo ejecutado" : "en curso"}
            />
            <StatCard
              label="Cierre"
              value={fechaHora(sorteo.fechaFin)}
              icon={IconCalendarEvent}
              hint="fecha de fin"
            />
          </SimpleGrid>

          <Card withBorder mt="md" padding="lg" radius="md">
            <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
              <div>
                <Text fw={600}>{sorteo.nombre}</Text>
                <Text size="sm" c="dimmed">
                  {sorteo.premio}
                </Text>
              </div>
              <Badge
                variant={ejecutado ? "outline" : "light"}
                color={ejecutado ? "gray" : undefined}
                styles={{ label: { textTransform: "none" } }}
              >
                {ejecutado ? "Cerrado" : "Activo"}
              </Badge>
            </Group>

            {!ejecutado && (
              <>
                <Divider my="md" />
                <AssetUploader
                  destino={{ destino: "premio", raffleId: sorteo.id }}
                  urlActual={sorteo.premioImageUrl}
                  label="Imagen del premio"
                  description="Se muestra en la vitrina del sorteo de tu tienda. Sin imagen se usa un degradado con tu color."
                  onSubido={() => utils.panel.getSorteo.invalidate()}
                />
              </>
            )}

            <div className="mt-4">
              {ejecutado ? (
                <Paper
                  withBorder
                  radius="md"
                  py="lg"
                  bg="var(--mantine-color-default-hover)"
                >
                  <Stack align="center" gap={4}>
                    <IconTrophy
                      className="size-8"
                      stroke={1.75}
                      color="var(--mantine-color-premio-6)"
                    />
                    <Text size="sm" c="dimmed">
                      Ganador
                    </Text>
                    <Text size="lg" fw={600}>
                      {sorteo.ganadorEmail}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Sorteado el {fechaHora(sorteo.ejecutadoAt!)}
                      {sorteo.ejecutadoPor ? ` por ${sorteo.ejecutadoPor}` : ""}
                    </Text>
                  </Stack>
                </Paper>
              ) : (
                <Group gap="sm" wrap="wrap">
                  <Button
                    onClick={confirmarEjecucion}
                    disabled={sorteo.totalParticipaciones === 0}
                    leftSection={<IconPlayerPlay className="size-4" />}
                  >
                    Ejecutar sorteo
                  </Button>
                  <Text size="xs" c="dimmed">
                    {sorteo.totalParticipaciones === 0
                      ? "Aún no hay participaciones para sortear."
                      : "Elige un ganador al azar entre los tickets. La acción no se puede deshacer."}
                  </Text>
                </Group>
              )}
            </div>
          </Card>

          <Card withBorder mt="md" padding={0} radius="md">
            <div className="px-6 pt-5">
              <Text fw={600}>Participantes</Text>
              <Text size="sm" c="dimmed">
                Quienes están dentro del sorteo y cuántos tickets tienen
              </Text>
            </div>
            <Table.ScrollContainer minWidth={360}>
              <Table verticalSpacing="sm" mt="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th className="pl-6">Cliente</Table.Th>
                    <Table.Th className="text-right">Tickets</Table.Th>
                    <Table.Th className="pr-6 text-right">
                      Última participación
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sorteo.participantes.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <EmptyState
                          icon={IconUsers}
                          title="Todavía no hay participantes"
                          description="Cuando alguien compre un producto que participa del sorteo, entrará acá con sus tickets."
                        />
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    sorteo.participantes.map((p) => (
                      <Table.Tr key={p.email}>
                        <Table.Td className="pl-6" c="dimmed">
                          {p.email}
                        </Table.Td>
                        <Table.Td className="text-right tabular-nums" c="dimmed">
                          {num(p.tickets)}
                        </Table.Td>
                        <Table.Td className="whitespace-nowrap pr-6 text-right" c="dimmed">
                          {fechaHora(p.ultimaInscripcion)}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
