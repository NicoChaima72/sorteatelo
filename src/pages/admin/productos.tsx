import { IconPencil, IconPlus } from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useEffect, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { clp } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api, type RouterOutputs } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

type Producto = RouterOutputs["panel"]["listarProductos"][number];

function iniciales(titulo: string) {
  return titulo
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ProductoFormDialog({
  open,
  onOpenChange,
  producto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Producto | null;
}) {
  const esEdicion = producto !== null;
  const utils = api.useUtils();

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("3000");
  const [pdfPath, setPdfPath] = useState("");
  const [portadaUrl, setPortadaUrl] = useState("");
  const [activo, setActivo] = useState(true);

  // Rehidratar el form cada vez que se abre con un target distinto.
  useEffect(() => {
    if (!open) return;
    setTitulo(producto?.titulo ?? "");
    setDescripcion(producto?.descripcion ?? "");
    setPrecio(producto?.precio ?? "3000");
    setPdfPath(producto?.pdfPath ?? "");
    setPortadaUrl(producto?.portadaUrl ?? "");
    setActivo(producto?.activo ?? true);
  }, [open, producto]);

  const onDone = async () => {
    await Promise.all([
      utils.panel.listarProductos.invalidate(),
      // el KPI "Productos activos" del dashboard también depende de esto
      utils.panel.getResumenTienda.invalidate(),
    ]);
    onOpenChange(false);
  };

  const crear = api.panel.crearProducto.useMutation({ onSuccess: onDone });
  const actualizar = api.panel.actualizarProducto.useMutation({
    onSuccess: onDone,
  });

  const enviando = crear.isPending || actualizar.isPending;
  const error = crear.error?.message ?? actualizar.error?.message ?? null;

  const submit = () => {
    if (esEdicion) {
      actualizar.mutate({
        id: producto.id,
        titulo,
        descripcion,
        precio,
        pdfPath,
        portadaUrl,
        activo,
      });
    } else {
      crear.mutate({ titulo, descripcion, precio, pdfPath, portadaUrl });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {esEdicion ? "Editar producto" : "Agregar producto"}
          </DialogTitle>
          <DialogDescription>
            {esEdicion
              ? "Modifica los datos del producto y guarda los cambios."
              : "Completa los datos del producto que quieres poner a la venta."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Cómo enriquecer a tu idol favorito"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Un par de líneas que enganchen a tu lectora."
              className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="precio">Precio (CLP)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="precio"
                  className="pl-7 tabular-nums"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
            {esEdicion && (
              <div className="grid gap-2">
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={activo ? "activo" : "borrador"}
                  onValueChange={(v) => setActivo(v === "activo")}
                >
                  <SelectTrigger id="estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">A la venta</SelectItem>
                    <SelectItem value="borrador">Borrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="portada">Portada (URL, opcional)</Label>
            <Input
              id="portada"
              value={portadaUrl}
              onChange={(e) => setPortadaUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pdfPath">Ruta del PDF</Label>
            <Input
              id="pdfPath"
              value={pdfPath}
              onChange={(e) => setPdfPath(e.target.value)}
              placeholder="autora/mi-libro.pdf"
            />
            <p className="text-xs text-muted-foreground">
              Por ahora es una ruta de texto. La subida real del archivo llega
              con la próxima etapa (entrega de PDF).
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={enviando}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={enviando}>
            {enviando
              ? "Guardando…"
              : esEdicion
                ? "Guardar cambios"
                : "Agregar producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilasSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <TableRow key={i}>
          <TableCell className="pl-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20" />
          </TableCell>
          <TableCell className="pr-6" />
        </TableRow>
      ))}
    </>
  );
}

export default function ProductosPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Producto | null>(null);
  const productos = api.panel.listarProductos.useQuery(undefined, {
    retry: false,
  });

  function openNew() {
    setEditTarget(null);
    setFormOpen(true);
  }
  function openEdit(producto: Producto) {
    setEditTarget(producto);
    setFormOpen(true);
  }

  const lista = productos.data ?? [];

  return (
    <AdminLayout
      title="Productos"
      description="Agrega, edita y administra los productos de tu catálogo."
      actions={
        <Button onClick={openNew}>
          <IconPlus className="size-4" />
          <span className="hidden sm:inline">Agregar producto</span>
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Producto</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.isLoading ? (
                <FilasSkeleton />
              ) : productos.isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center">
                    <p className="text-sm text-destructive">
                      No pudimos cargar tus productos.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void productos.refetch()}
                    >
                      Reintentar
                    </Button>
                  </TableCell>
                </TableRow>
              ) : lista.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Todavía no tienes productos. Agrega el primero con el botón
                    de arriba.
                  </TableCell>
                </TableRow>
              ) : (
                lista.map((producto) => (
                  <TableRow key={producto.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                          {iniciales(producto.titulo)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {producto.titulo}
                          </div>
                          <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                            {producto.descripcion}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {clp(producto.precio)}
                    </TableCell>
                    <TableCell>
                      {producto.activo ? (
                        <Badge variant="secondary">A la venta</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="font-normal text-muted-foreground"
                        >
                          Borrador
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => openEdit(producto)}
                        >
                          <IconPencil className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProductoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        producto={editTarget}
      />
    </AdminLayout>
  );
}
