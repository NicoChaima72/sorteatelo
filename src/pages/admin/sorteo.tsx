import {
  IconCalendarEvent,
  IconPlayerPlay,
  IconTicket,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { StatCard } from "~/components/admin/stat-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sorteoQuery = api.panel.getSorteo.useQuery(undefined, { retry: false });

  const ejecutar = api.panel.ejecutarSorteo.useMutation({
    onSuccess: async () => {
      setConfirmOpen(false);
      await utils.panel.getSorteo.invalidate();
    },
  });

  const sorteo = sorteoQuery.data?.sorteo ?? null;
  const ejecutado = sorteo?.ejecutadoAt != null;

  return (
    <AdminLayout
      title="Sorteo"
      description="Administra el sorteo activo, sus participantes y el ganador."
    >
      {sorteoQuery.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : sorteoQuery.isError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <p className="text-sm text-destructive">
            No pudimos cargar el sorteo.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => void sorteoQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : !sorteo ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <IconTicket
            className="size-8 text-muted-foreground/50"
            stroke={1.5}
          />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Todavía no hay un sorteo en tu tienda. Los sorteos se crean con las
            ventas de tu tienda.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Participantes"
              value={num(sorteo.totalParticipantes)}
              icon={IconUsers}
              hint="participaciones registradas"
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
          </div>

          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>{sorteo.nombre}</CardTitle>
                  <CardDescription>{sorteo.premio}</CardDescription>
                </div>
                <Badge variant={ejecutado ? "outline" : "secondary"}>
                  {ejecutado ? "Cerrado" : "Activo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {ejecutado ? (
                <div className="flex flex-col items-center rounded-lg border bg-muted/40 py-6 text-center">
                  <IconTrophy className="size-8 text-primary" stroke={1.75} />
                  <p className="mt-2 text-sm text-muted-foreground">Ganador</p>
                  <p className="text-lg font-semibold">{sorteo.ganadorEmail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sorteado el {fechaHora(sorteo.ejecutadoAt!)}
                    {sorteo.ejecutadoPor ? ` por ${sorteo.ejecutadoPor}` : ""}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={sorteo.totalParticipantes === 0}
                  >
                    <IconPlayerPlay className="size-4" />
                    Ejecutar sorteo
                  </Button>
                  <p className="text-xs text-muted-foreground sm:ml-1">
                    {sorteo.totalParticipantes === 0
                      ? "Aún no hay participantes para sortear."
                      : "Elige un ganador al azar. La acción no se puede deshacer."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Participantes</CardTitle>
              <CardDescription>
                Quienes están dentro del sorteo
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Cliente</TableHead>
                    <TableHead className="pr-6 text-right">
                      Se inscribió
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorteo.participantes.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Todavía no hay participantes.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorteo.participantes.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="pl-6 text-muted-foreground">
                          {p.email}
                        </TableCell>
                        <TableCell className="pr-6 text-right whitespace-nowrap text-muted-foreground">
                          {fechaHora(p.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Ejecutar el sorteo</DialogTitle>
                <DialogDescription>
                  Se elegirá un ganador al azar entre los{" "}
                  {num(sorteo.totalParticipantes)} participantes. Esta acción
                  registra quién y cuándo lo ejecutó y{" "}
                  <span className="font-medium text-foreground">
                    no se puede deshacer
                  </span>
                  .
                </DialogDescription>
              </DialogHeader>
              {ejecutar.error && (
                <p role="alert" className="text-sm text-destructive">
                  {ejecutar.error.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={ejecutar.isPending}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  onClick={() => ejecutar.mutate({ raffleId: sorteo.id })}
                  disabled={ejecutar.isPending}
                >
                  {ejecutar.isPending ? "Sorteando…" : "Sí, ejecutar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AdminLayout>
  );
}
