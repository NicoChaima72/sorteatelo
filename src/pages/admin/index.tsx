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
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px]" />)
        ) : resumen.isError || !kpis ? (
          <div className="col-span-full py-10 text-center">
            <p className="text-sm text-destructive">
              No pudimos cargar los indicadores.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void resumen.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Últimas ventas</CardTitle>
            <CardDescription>Las compras más recientes</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/ventas">
              Ver todas
              <IconArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Productos</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.isLoading ? (
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : ventas.isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-sm text-destructive">
                      No pudimos cargar las ventas.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void ventas.refetch()}
                    >
                      Reintentar
                    </Button>
                  </TableCell>
                </TableRow>
              ) : ultimas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Todavía no hay ventas.
                  </TableCell>
                </TableRow>
              ) : (
                ultimas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground">
                      {o.email}
                    </TableCell>
                    <TableCell className="hidden max-w-[240px] truncate md:table-cell">
                      {o.productos.join(", ")}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                      {fechaHora(o.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {clp(o.total)}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={o.estado} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
