import { Button, Card, Group, Skeleton, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMailForward, IconShoppingCart } from "@tabler/icons-react";
import { type GetServerSideProps } from "next";

import { AdminLayout } from "~/components/admin/admin-layout";
import { EmptyState } from "~/components/admin/empty-state";
import { EstadoBadge } from "~/components/admin/estado-badge";
import { clp, fechaHora } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

function FilasSkeleton() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <Table.Tr key={i}>
          <Table.Td className="pl-6">
            <Skeleton height={16} width={80} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={16} width={160} />
          </Table.Td>
          <Table.Td className="text-right">
            <Skeleton height={16} width={64} className="ml-auto" />
          </Table.Td>
          <Table.Td className="text-right">
            <Skeleton height={16} width={64} className="ml-auto" />
          </Table.Td>
          <Table.Td>
            <Skeleton height={20} width={80} />
          </Table.Td>
          <Table.Td className="pr-6 text-right">
            <Skeleton height={28} width={96} className="ml-auto" />
          </Table.Td>
        </Table.Tr>
      ))}
    </>
  );
}

export default function VentasPage() {
  const ventas = api.panel.listarVentas.useInfiniteQuery(
    {},
    {
      getNextPageParam: (ultima) => ultima.nextCursor ?? undefined,
      retry: false,
    },
  );

  // Reenvío del correo de descarga (F04/D9). No invalida queries: la regeneración de tokens no
  // cambia nada visible en la tabla de ventas. El loading es por-fila (variables.orderId).
  const reenviar = api.panel.reenviarCorreoDescarga.useMutation({
    onSuccess: () =>
      notifications.show({
        message: "Correo de descarga reenviado.",
        color: "green",
      }),
    onError: () =>
      notifications.show({
        message: "No pudimos reenviar el correo. Intenta nuevamente en un momento.",
        color: "red",
      }),
  });

  const filas = ventas.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AdminLayout
      title="Ventas"
      description="Todas las compras de tu tienda, con su estado y lo que te queda."
    >
      <Card withBorder padding={0} radius="md">
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="pl-6">Cliente</Table.Th>
                <Table.Th className="hidden lg:table-cell">Productos</Table.Th>
                <Table.Th className="hidden sm:table-cell">Fecha</Table.Th>
                <Table.Th className="text-right">Total</Table.Th>
                <Table.Th className="hidden text-right md:table-cell">
                  Comisión
                </Table.Th>
                <Table.Th className="text-right">Te queda</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th className="pr-6 text-right">Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ventas.isLoading ? (
                <FilasSkeleton />
              ) : ventas.isError ? (
                <Table.Tr>
                  <Table.Td colSpan={8} className="py-12 text-center">
                    <Text size="sm" c="red">
                      No pudimos cargar tus ventas.
                    </Text>
                    <Button
                      variant="default"
                      size="xs"
                      mt="sm"
                      onClick={() => void ventas.refetch()}
                    >
                      Reintentar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ) : filas.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <EmptyState
                      icon={IconShoppingCart}
                      title="Todavía no vendes nada — y está bien"
                      description="Cuando alguien compre en tu tienda, cada venta aparecerá acá con su estado y lo que te queda."
                    />
                  </Table.Td>
                </Table.Tr>
              ) : (
                filas.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td className="pl-6" c="dimmed">
                      {o.email}
                    </Table.Td>
                    <Table.Td className="hidden max-w-[240px] truncate lg:table-cell">
                      {o.productos.join(", ")}
                    </Table.Td>
                    <Table.Td className="hidden whitespace-nowrap sm:table-cell" c="dimmed">
                      {fechaHora(o.createdAt)}
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums">
                      {clp(o.total)}
                    </Table.Td>
                    <Table.Td className="hidden text-right tabular-nums md:table-cell" c="dimmed">
                      {o.comision ? `−${clp(o.comision)}` : "—"}
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums" fw={500}>
                      {o.neto ? clp(o.neto) : "—"}
                    </Table.Td>
                    <Table.Td>
                      <EstadoBadge estado={o.estado} />
                    </Table.Td>
                    <Table.Td className="pr-6 text-right">
                      {o.estado === "PAGADO" ? (
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<IconMailForward className="size-3.5" />}
                          loading={
                            reenviar.isPending &&
                            reenviar.variables?.orderId === o.id
                          }
                          onClick={() => reenviar.mutate({ orderId: o.id })}
                        >
                          Reenviar
                        </Button>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {ventas.hasNextPage && (
        <Group justify="center" mt="md">
          <Button
            variant="default"
            onClick={() => void ventas.fetchNextPage()}
            loading={ventas.isFetchingNextPage}
          >
            Cargar más
          </Button>
        </Group>
      )}
    </AdminLayout>
  );
}
