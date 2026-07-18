import { Button, Card, Group, Skeleton, Table, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconBan,
  IconBuildingStore,
  IconRefresh,
  IconShieldLock,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";

import { AdminLayout } from "~/components/admin/admin-layout";
import { EmptyState } from "~/components/admin/empty-state";
import { EstadoTiendaBadge } from "~/components/admin/estado-tienda-badge";
import { fecha, num } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

export default function OperadorPage() {
  const utils = api.useUtils();
  const tiendas = api.operador.listarTiendas.useQuery(undefined, {
    retry: false,
  });

  const invalidar = () => utils.operador.listarTiendas.invalidate();

  const suspender = api.operador.suspenderTienda.useMutation({
    onSuccess: async () => {
      await invalidar();
      notifications.show({ message: "Tienda suspendida.", color: "green" });
    },
    onError: (error) =>
      notifications.show({ message: error.message, color: "red" }),
  });

  const reactivar = api.operador.reactivarTienda.useMutation({
    onSuccess: async () => {
      await invalidar();
      notifications.show({
        message: "Tienda reactivada (queda en configuración).",
        color: "green",
      });
    },
    onError: (error) =>
      notifications.show({ message: error.message, color: "red" }),
  });

  const confirmarSuspender = (tenantId: string, nombre: string) =>
    modals.openConfirmModal({
      title: "Suspender tienda",
      children: (
        <Text size="sm">
          <Text component="span" fw={600}>
            {nombre}
          </Text>{" "}
          dejará de estar disponible en su dirección pública y no podrá vender.
          Podrás reactivarla después (quedará en configuración).
        </Text>
      ),
      labels: { confirm: "Suspender", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => suspender.mutate({ tenantId }),
    });

  const esNoAutorizado = tiendas.error?.data?.code === "FORBIDDEN";
  const filas = tiendas.data?.tiendas ?? [];

  return (
    <AdminLayout
      title="Operador"
      description="Supervisión de todas las tiendas de la plataforma."
    >
      <Card withBorder padding="lg" radius="md">
        <div>
          <Text fw={600}>Tiendas de la plataforma</Text>
          <Text size="sm" c="dimmed">
            Suspende o reactiva tiendas. No editas su contenido.
          </Text>
        </div>

        <Table.ScrollContainer minWidth={640} className="mt-4">
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tienda</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th className="text-right">Productos</Table.Th>
                <Table.Th className="text-right">Órdenes</Table.Th>
                <Table.Th className="hidden sm:table-cell">Creada</Table.Th>
                <Table.Th className="text-right">Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tiendas.isLoading ? (
                [0, 1, 2].map((i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Skeleton height={16} width={180} />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={110} />
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Skeleton height={16} width={32} className="ml-auto" />
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Skeleton height={16} width={32} className="ml-auto" />
                    </Table.Td>
                    <Table.Td className="hidden sm:table-cell">
                      <Skeleton height={16} width={80} />
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Skeleton height={28} width={96} className="ml-auto" />
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : esNoAutorizado ? (
                <Table.Tr>
                  <Table.Td colSpan={6} className="py-12 text-center">
                    <Group justify="center" gap="xs" mb={4}>
                      <IconShieldLock
                        className="size-5"
                        stroke={1.75}
                        color="var(--mantine-color-dimmed)"
                      />
                      <Text size="sm" fw={500}>
                        No tienes acceso a esta sección
                      </Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      El panel del Operador es solo para operadores de la
                      plataforma.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : tiendas.isError ? (
                <Table.Tr>
                  <Table.Td colSpan={6} className="py-10 text-center">
                    <Text size="sm" c="red">
                      No pudimos cargar las tiendas.
                    </Text>
                    <Button
                      variant="default"
                      size="xs"
                      mt="sm"
                      onClick={() => void tiendas.refetch()}
                    >
                      Reintentar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ) : filas.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <EmptyState
                      icon={IconBuildingStore}
                      title="Todavía no hay tiendas en la plataforma"
                      description="Cuando alguien cree su tienda, la verás acá para supervisarla."
                    />
                  </Table.Td>
                </Table.Tr>
              ) : (
                filas.map((t) => {
                  const suspendiendo =
                    suspender.isPending &&
                    suspender.variables?.tenantId === t.id;
                  const reactivando =
                    reactivar.isPending &&
                    reactivar.variables?.tenantId === t.id;
                  return (
                    <Table.Tr key={t.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {t.nombre}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t.slug}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <EstadoTiendaBadge estado={t.estado} />
                      </Table.Td>
                      <Table.Td className="text-right tabular-nums">
                        {num(t.productos)}
                      </Table.Td>
                      <Table.Td className="text-right tabular-nums">
                        {num(t.ordenes)}
                      </Table.Td>
                      <Table.Td
                        className="hidden whitespace-nowrap sm:table-cell"
                        c="dimmed"
                      >
                        {fecha(t.createdAt)}
                      </Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" gap="xs" wrap="nowrap">
                          {t.estado === "SUSPENDIDA" ? (
                            <Button
                              size="compact-sm"
                              variant="light"
                              color="exito"
                              leftSection={<IconRefresh className="size-3.5" />}
                              loading={reactivando}
                              onClick={() =>
                                reactivar.mutate({ tenantId: t.id })
                              }
                            >
                              Reactivar
                            </Button>
                          ) : (
                            <Button
                              size="compact-sm"
                              variant="light"
                              color="red"
                              leftSection={<IconBan className="size-3.5" />}
                              loading={suspendiendo}
                              onClick={() => confirmarSuspender(t.id, t.nombre)}
                            >
                              Suspender
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </AdminLayout>
  );
}
