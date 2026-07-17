import { Button, Card, Group, SimpleGrid, Skeleton, Table, Text } from "@mantine/core";
import {
  IconArrowRight,
  IconBook2,
  IconClock,
  IconCoin,
  IconShoppingCart,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import Link from "next/link";

import { AdminLayout } from "~/components/admin/admin-layout";
import { EstadoBadge } from "~/components/admin/estado-badge";
import { StatCard } from "~/components/admin/stat-card";
import { clp, fechaHora, num } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

export default function AdminDashboard() {
  const resumen = api.panel.getResumenTienda.useQuery(undefined, {
    retry: false,
  });
  const ventas = api.panel.listarVentas.useQuery(
    { cursor: null },
    { retry: false },
  );

  const ultimas = (ventas.data?.items ?? []).slice(0, 5);
  const kpis = resumen.data;

  return (
    <AdminLayout
      title="Resumen"
      description="Una mirada rápida a cómo va tu tienda."
    >
      {resumen.isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={104} radius="md" />
          ))}
        </SimpleGrid>
      ) : resumen.isError || !kpis ? (
        <div className="py-10 text-center">
          <Text size="sm" c="red">
            No pudimos cargar los indicadores.
          </Text>
          <Button
            variant="default"
            size="xs"
            mt="sm"
            onClick={() => void resumen.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
          <StatCard
            label="Ventas pagadas"
            value={num(kpis.ventasPagadas)}
            icon={IconShoppingCart}
            hint="órdenes confirmadas"
          />
          <StatCard
            label="Ingresos"
            value={clp(kpis.ingresos)}
            icon={IconCoin}
            hint="total cobrado (bruto)"
          />
          <StatCard
            label="Pendientes"
            value={num(kpis.ordenesPendientes)}
            icon={IconClock}
            hint="órdenes sin pagar"
          />
          <StatCard
            label="Productos activos"
            value={num(kpis.productosActivos)}
            icon={IconBook2}
            hint="a la venta"
          />
        </SimpleGrid>
      )}

      <Card withBorder mt="md" padding="lg" radius="md">
        <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
          <div>
            <Text fw={600}>Últimas ventas</Text>
            <Text size="sm" c="dimmed">
              Las compras más recientes
            </Text>
          </div>
          <Button
            component={Link}
            href="/admin/ventas"
            variant="subtle"
            size="xs"
            rightSection={<IconArrowRight className="size-4" />}
          >
            Ver todas
          </Button>
        </Group>

        <Table.ScrollContainer minWidth={480}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Cliente</Table.Th>
                <Table.Th className="hidden md:table-cell">Productos</Table.Th>
                <Table.Th className="hidden sm:table-cell">Fecha</Table.Th>
                <Table.Th className="text-right">Total</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ventas.isLoading ? (
                [0, 1, 2].map((i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Skeleton height={16} width={160} />
                    </Table.Td>
                    <Table.Td className="hidden md:table-cell">
                      <Skeleton height={16} width={128} />
                    </Table.Td>
                    <Table.Td className="hidden sm:table-cell">
                      <Skeleton height={16} width={96} />
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Skeleton height={16} width={64} className="ml-auto" />
                    </Table.Td>
                    <Table.Td>
                      <Skeleton height={20} width={80} />
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : ventas.isError ? (
                <Table.Tr>
                  <Table.Td colSpan={5} className="py-10 text-center">
                    <Text size="sm" c="red">
                      No pudimos cargar las ventas.
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
              ) : ultimas.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5} className="py-10 text-center" c="dimmed">
                    Todavía no hay ventas.
                  </Table.Td>
                </Table.Tr>
              ) : (
                ultimas.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td c="dimmed">{o.email}</Table.Td>
                    <Table.Td className="hidden max-w-[240px] truncate md:table-cell">
                      {o.productos.join(", ")}
                    </Table.Td>
                    <Table.Td className="hidden whitespace-nowrap sm:table-cell" c="dimmed">
                      {fechaHora(o.createdAt)}
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums">
                      {clp(o.total)}
                    </Table.Td>
                    <Table.Td>
                      <EstadoBadge estado={o.estado} />
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </AdminLayout>
  );
}
