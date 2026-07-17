import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Skeleton,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useEffect, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { clp } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api, type RouterOutputs } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

type Producto = RouterOutputs["panel"]["listarProductos"][number];

interface ProductoForm {
  titulo: string;
  descripcion: string;
  precio: string; // dinero SIEMPRE string (I2): CLP entero ⇒ Decimal en el server.
  pdfPath: string;
  portadaUrl: string;
  activo: boolean;
}

const VALORES_INICIALES: ProductoForm = {
  titulo: "",
  descripcion: "",
  precio: "3000",
  pdfPath: "",
  portadaUrl: "",
  activo: true,
};

function iniciales(titulo: string) {
  return titulo
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ProductoFormModal({
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

  const form = useForm<ProductoForm>({
    initialValues: VALORES_INICIALES,
    validate: {
      titulo: (v) => (v.trim() === "" ? "El título es obligatorio" : null),
      // El precio viaja como string (I2); validamos que sea un entero CLP > 0 en el cliente,
      // el server vuelve a validar. Jamás aritmética con number.
      precio: (v) =>
        /^\d+$/.test(v.trim()) && Number(v) > 0
          ? null
          : "Ingresa un precio válido en pesos",
    },
  });

  // Rehidratar el form cada vez que se abre con un target distinto.
  useEffect(() => {
    if (!open) return;
    form.setValues({
      titulo: producto?.titulo ?? "",
      descripcion: producto?.descripcion ?? "",
      precio: producto?.precio ?? "3000",
      pdfPath: producto?.pdfPath ?? "",
      portadaUrl: producto?.portadaUrl ?? "",
      activo: producto?.activo ?? true,
    });
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto]);

  const onDone = async () => {
    await Promise.all([
      utils.panel.listarProductos.invalidate(),
      // el KPI "Productos activos" del dashboard también depende de esto
      utils.panel.getResumenTienda.invalidate(),
    ]);
    notifications.show({
      message: esEdicion ? "Cambios guardados." : "Producto agregado.",
      color: "green",
    });
    onOpenChange(false);
  };

  const onError = (error: { message: string }) => {
    notifications.show({ message: error.message, color: "red" });
  };

  const crear = api.panel.crearProducto.useMutation({ onSuccess: onDone, onError });
  const actualizar = api.panel.actualizarProducto.useMutation({
    onSuccess: onDone,
    onError,
  });

  const enviando = crear.isPending || actualizar.isPending;

  const submit = form.onSubmit((valores) => {
    if (esEdicion) {
      actualizar.mutate({ id: producto.id, ...valores });
    } else {
      // crear no recibe `activo` (nace a la venta por defecto en el server).
      crear.mutate({
        titulo: valores.titulo,
        descripcion: valores.descripcion,
        precio: valores.precio,
        pdfPath: valores.pdfPath,
        portadaUrl: valores.portadaUrl,
      });
    }
  });

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={esEdicion ? "Editar producto" : "Agregar producto"}
      size="lg"
    >
      <Text size="sm" c="dimmed" mb="md">
        {esEdicion
          ? "Modifica los datos del producto y guarda los cambios."
          : "Completa los datos del producto que quieres poner a la venta."}
      </Text>

      <form onSubmit={submit}>
        <div className="grid gap-4">
          <TextInput
            label="Título"
            placeholder="Ej. Cómo enriquecer a tu idol favorito"
            {...form.getInputProps("titulo")}
          />

          <Textarea
            label="Descripción"
            placeholder="Un par de líneas que enganchen a tu lectora."
            minRows={3}
            autosize
            {...form.getInputProps("descripcion")}
          />

          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label="Precio (CLP)"
              leftSection="$"
              inputMode="numeric"
              classNames={{ input: "tabular-nums" }}
              {...form.getInputProps("precio")}
            />
            {esEdicion && (
              <Select
                label="Estado"
                data={[
                  { value: "activo", label: "A la venta" },
                  { value: "borrador", label: "Borrador" },
                ]}
                allowDeselect={false}
                value={form.values.activo ? "activo" : "borrador"}
                onChange={(v) => form.setFieldValue("activo", v === "activo")}
              />
            )}
          </div>

          <TextInput
            label="Portada (URL, opcional)"
            placeholder="https://…"
            {...form.getInputProps("portadaUrl")}
          />

          <TextInput
            label="Ruta del PDF"
            placeholder="autora/mi-libro.pdf"
            description="Por ahora es una ruta de texto. La subida real del archivo llega con la próxima etapa (entrega de PDF)."
            {...form.getInputProps("pdfPath")}
          />
        </div>

        <Group justify="flex-end" mt="lg" gap="sm">
          <Button
            variant="default"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={enviando}>
            {esEdicion ? "Guardar cambios" : "Agregar producto"}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

function FilasSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Table.Tr key={i}>
          <Table.Td className="pl-6">
            <Group gap="sm" wrap="nowrap">
              <Skeleton height={40} width={40} radius="md" />
              <div className="space-y-1.5">
                <Skeleton height={16} width={160} />
                <Skeleton height={12} width={224} />
              </div>
            </Group>
          </Table.Td>
          <Table.Td className="text-right">
            <Skeleton height={16} width={64} className="ml-auto" />
          </Table.Td>
          <Table.Td>
            <Skeleton height={20} width={80} />
          </Table.Td>
          <Table.Td className="pr-6" />
        </Table.Tr>
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
        <Button onClick={openNew} leftSection={<IconPlus className="size-4" />}>
          <span className="hidden sm:inline">Agregar producto</span>
        </Button>
      }
    >
      <Card withBorder padding={0} radius="md">
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="pl-6">Producto</Table.Th>
                <Table.Th className="text-right">Precio</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th className="pr-6 text-right">Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {productos.isLoading ? (
                <FilasSkeleton />
              ) : productos.isError ? (
                <Table.Tr>
                  <Table.Td colSpan={4} className="py-12 text-center">
                    <Text size="sm" c="red">
                      No pudimos cargar tus productos.
                    </Text>
                    <Button
                      variant="default"
                      size="xs"
                      mt="sm"
                      onClick={() => void productos.refetch()}
                    >
                      Reintentar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ) : lista.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4} className="py-12 text-center" c="dimmed">
                    Todavía no tienes productos. Agrega el primero con el botón
                    de arriba.
                  </Table.Td>
                </Table.Tr>
              ) : (
                lista.map((producto) => (
                  <Table.Tr key={producto.id}>
                    <Table.Td className="pl-6">
                      <Group gap="sm" wrap="nowrap">
                        <Avatar radius="md" color="gray" size={40}>
                          {iniciales(producto.titulo)}
                        </Avatar>
                        <div className="min-w-0">
                          <Text fw={500} truncate>
                            {producto.titulo}
                          </Text>
                          <Text size="xs" c="dimmed" className="max-w-[280px]" truncate>
                            {producto.descripcion}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td className="text-right tabular-nums">
                      {clp(producto.precio)}
                    </Table.Td>
                    <Table.Td>
                      {producto.activo ? (
                        <Badge
                          variant="light"
                          styles={{ label: { textTransform: "none" } }}
                        >
                          A la venta
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          color="gray"
                          styles={{ label: { fontWeight: 400, textTransform: "none" } }}
                        >
                          Borrador
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td className="pr-6">
                      <Group justify="flex-end" gap={4}>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label="Editar"
                          onClick={() => openEdit(producto)}
                        >
                          <IconPencil className="size-4" />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <ProductoFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        producto={editTarget}
      />
    </AdminLayout>
  );
}
