import { type GetServerSideProps } from "next";

import { AdminLayout } from "~/components/admin/admin-layout";
import { EstadoBadge } from "~/components/admin/estado-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
        <TableRow key={i}>
          <TableCell className="pl-6">
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20" />
          </TableCell>
        </TableRow>
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

  const filas = ventas.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AdminLayout
      title="Ventas"
      description="Todas las compras de tu tienda, con su estado y lo que te queda."
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Cliente</TableHead>
                <TableHead className="hidden lg:table-cell">Productos</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Comisión
                </TableHead>
                <TableHead className="text-right">Te queda</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.isLoading ? (
                <FilasSkeleton />
              ) : ventas.isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <p className="text-sm text-destructive">
                      No pudimos cargar tus ventas.
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
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Todavía no tienes ventas. Cuando alguien compre en tu tienda,
                    aparecerá aquí.
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6 text-muted-foreground">
                      {o.email}
                    </TableCell>
                    <TableCell className="hidden max-w-[240px] truncate lg:table-cell">
                      {o.productos.join(", ")}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                      {fechaHora(o.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {clp(o.total)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                      {o.comision ? `−${clp(o.comision)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {o.neto ? clp(o.neto) : "—"}
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

      {ventas.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => void ventas.fetchNextPage()}
            disabled={ventas.isFetchingNextPage}
          >
            {ventas.isFetchingNextPage ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      )}
    </AdminLayout>
  );
}
