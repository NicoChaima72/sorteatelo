import { Button, Group, Skeleton, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconDownload,
  IconMailForward,
  IconShoppingCart,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { DetalleVenta } from "~/components/admin/detalle-venta";
import { EmptyState } from "~/components/admin/empty-state";
import { EstadoBadge } from "~/components/admin/estado-badge";
import { PanelCard } from "~/components/admin/panel-card";
import { descargarArchivo } from "~/lib/descargar";
import { clp, fechaHora } from "~/lib/formato";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // Matriz de acceso del panel scopeado por subdominio (ADR-0022): redirige al login del apex,
  // al storefront o a la primera tienda, o responde 404 neutral, según host + sesión + membresía.
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
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
  // Detalle de una venta (F06). Se guarda el ID y NO la fila: así el Drawer sigue el dato vivo si
  // la query refetchea (una orden PENDIENTE que pasa a PAGADO se actualiza a la vista). El id
  // sobrevive al cierre a propósito — limpiarlo junto con `opened` vaciaría el panel a mitad de la
  // animación de salida.
  const utils = api.useUtils();

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalleAbierto, detalle] = useDisclosure(false);
  // El export es una acción de un solo tiro, no una query de la pantalla: no hay `isPending` de
  // mutation del que colgarse (es un `.query()`), así que el loading es de esta página.
  const [exportando, setExportando] = useState(false);

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
        message:
          "No pudimos reenviar el correo. Intenta nuevamente en un momento.",
        color: "red",
      }),
  });

  const filas = ventas.data?.pages.flatMap((p) => p.items) ?? [];
  const ventaDelDetalle = filas.find((o) => o.id === detalleId) ?? null;

  const verDetalle = (id: string) => {
    setDetalleId(id);
    detalle.open();
  };

  /**
   * Export CSV (F07). Se pide por el cliente CRUDO de tRPC (`utils.client`) y no por una `useQuery`
   * ni por `utils.fetch`: los dos dejarían el archivo —con la PII de todos los Compradores— vivo en
   * la caché de React Query, y una segunda descarga podría servir el CSV viejo. Acá es un tiro y se
   * va con el Blob.
   */
  const exportarCsv = async () => {
    setExportando(true);
    try {
      const { nombreArchivo, contenido } =
        await utils.client.panel.exportarVentasCsv.query();
      descargarArchivo({
        nombre: nombreArchivo,
        contenido,
        tipo: "text/csv;charset=utf-8",
      });
    } catch {
      notifications.show({
        message:
          "No pudimos generar el archivo. Intenta nuevamente en un momento.",
        color: "red",
      });
    } finally {
      setExportando(false);
    }
  };

  return (
    <AdminLayout
      title="Ventas"
      description="Todas las compras de tu tienda, con su estado y lo que te queda."
      actions={
        // `variant="default"` y no el filled de «Agregar producto»: exportar es una utilidad sobre
        // lo que ya está en pantalla, no la acción que la página viene a proponer. Deshabilitado
        // mientras no haya nada que exportar — bajar un archivo con solo el encabezado se lee como
        // que el export está roto.
        <Button
          variant="default"
          onClick={() => void exportarCsv()}
          loading={exportando}
          disabled={ventas.isLoading || filas.length === 0}
          leftSection={<IconDownload className="size-4" />}
        >
          <span className="hidden sm:inline">Exportar CSV</span>
        </Button>
      }
    >
      <PanelCard padding={0}>
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
                      {o.items.map((it) => it.titulo).join(", ")}
                    </Table.Td>
                    <Table.Td
                      className="hidden whitespace-nowrap sm:table-cell"
                      c="dimmed"
                    >
                      {fechaHora(o.createdAt)}
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums">
                      {clp(o.total)}
                    </Table.Td>
                    <Table.Td
                      className="hidden text-right tabular-nums md:table-cell"
                      c="dimmed"
                    >
                      {o.comision ? `−${clp(o.comision)}` : "—"}
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums" fw={500}>
                      {o.neto ? clp(o.neto) : "—"}
                    </Table.Td>
                    <Table.Td>
                      <EstadoBadge estado={o.estado} />
                    </Table.Td>
                    <Table.Td className="pr-6">
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Button
                          variant="subtle"
                          color="gray"
                          size="xs"
                          onClick={() => verDetalle(o.id)}
                        >
                          Detalle
                        </Button>
                        {o.estado === "PAGADO" && (
                          <Button
                            variant="light"
                            size="xs"
                            leftSection={
                              <IconMailForward className="size-3.5" />
                            }
                            loading={
                              reenviar.isPending &&
                              reenviar.variables?.orderId === o.id
                            }
                            onClick={() => reenviar.mutate({ orderId: o.id })}
                          >
                            Reenviar
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </PanelCard>

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

      <DetalleVenta
        venta={ventaDelDetalle}
        opened={detalleAbierto}
        onClose={detalle.close}
      />
    </AdminLayout>
  );
}
