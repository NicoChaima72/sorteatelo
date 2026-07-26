import {
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Modal,
  Radio,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarEvent,
  IconFileText,
  IconHistory,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconTicket,
  IconTrophy,
  IconUsers,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { AssetUploader } from "~/components/admin/asset-uploader";
import { BasesUploader } from "~/components/admin/bases-uploader";
import { EmptyState } from "~/components/admin/empty-state";
import { PanelCard } from "~/components/admin/panel-card";
import { StatCard } from "~/components/admin/stat-card";
import {
  ACCEPT_BASES,
  useSubirBasesSorteo,
} from "~/components/admin/use-subir-bases";
import { fecha, fechaHora, num } from "~/lib/formato";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import { api, type RouterOutputs } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // Matriz de acceso del panel scopeado por subdominio (ADR-0022): redirige al login del apex,
  // al storefront o a la primera tienda, o responde 404 neutral, según host + sesión + membresía.
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
  return { props: {} };
};

type SorteoActual = NonNullable<RouterOutputs["panel"]["getSorteo"]["sorteo"]>;
type SorteoDeLista = RouterOutputs["panel"]["listarSorteos"]["sorteos"][number];

/** Valores del form de sorteo (crear y editar comparten forma). `fechaFin` como string del input. */
interface SorteoFormValues {
  nombre: string;
  premio: string;
  fechaFin: string;
}

/** Reglas de validación compartidas por el form de crear y el de editar (Mantine `useForm`). */
const VALIDACION_SORTEO = {
  nombre: (v: string) => (v.trim() ? null : "El nombre del sorteo es obligatorio"),
  premio: (v: string) => (v.trim() ? null : "El premio es obligatorio"),
  fechaFin: (v: string) => {
    if (!v) return "Elige la fecha de cierre";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "Fecha inválida";
    if (d.getTime() <= Date.now()) return "La fecha de cierre debe ser futura";
    return null;
  },
};

/** `Date` → valor de un `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`, hora LOCAL). */
function aInputDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Campos comunes de un form de sorteo (nombre, premio, fechaFin). Las BASES no son un campo del
 *  form: son un PDF que se SUBE (admin-bases-pdf F02/D2) — al crear, diferido tras `crearSorteo`;
 *  en el sorteo activo, con el `BasesUploader` inmediato. */
function CamposSorteo({ form }: { form: UseFormReturnType<SorteoFormValues> }) {
  return (
    <Stack gap="md">
      <TextInput
        label="Nombre del sorteo"
        placeholder="Ej. Sorteo de lanzamiento"
        withAsterisk
        {...form.getInputProps("nombre")}
      />
      <TextInput
        label="Premio"
        placeholder="Ej. Un pack firmado + envío"
        withAsterisk
        {...form.getInputProps("premio")}
      />
      <TextInput
        type="datetime-local"
        label="Fecha de cierre"
        description="Cuándo termina el sorteo. El ganador se elige manualmente después."
        withAsterisk
        min={aInputDateTime(new Date())}
        {...form.getInputProps("fechaFin")}
      />
    </Stack>
  );
}

/** Form de creación del sorteo + modal de arrastre de participantes de un sorteo anterior (F01). */
function FormularioCrearSorteo({ pasados }: { pasados: SorteoDeLista[] }) {
  const utils = api.useUtils();
  const [importarDesde, setImportarDesde] = useState<string | null>(null);
  const [modalAbierto, { open, close }] = useDisclosure(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const form = useForm({
    initialValues: { nombre: "", premio: "", fechaFin: "" },
    validate: VALIDACION_SORTEO,
  });

  // Las bases se suben DIFERIDO (admin-bases-pdf F02/D2): la key es per-raffle, así que el PDF
  // adjuntado acá se sube DESPUÉS de `crearSorteo`, con el id recién creado. Mismo modo que la
  // portada de un producto nuevo (frontend-conventions § Subida de imágenes de marca).
  const [basesFile, setBasesFile] = useState<File | null>(null);
  const { subir: subirBases, subiendo: subiendoBases } = useSubirBasesSorteo();

  const crear = api.panel.crearSorteo.useMutation();

  const onSubmit = form.onSubmit(async (values) => {
    try {
      const creado = await crear.mutateAsync({
        nombre: values.nombre.trim(),
        premio: values.premio.trim(),
        fechaFin: new Date(values.fechaFin),
        importarDesdeRaffleId: importarDesde ?? undefined,
      });
      // Si se adjuntaron bases, subirlas con el id recién creado (presigned PUT + confirmación).
      if (basesFile) await subirBases(creado.id, basesFile);
      await Promise.all([
        utils.panel.getSorteo.invalidate(),
        utils.panel.listarSorteos.invalidate(),
      ]);
      form.reset();
      setImportarDesde(null);
      setBasesFile(null);
      notifications.show({
        message: basesFile
          ? "Sorteo creado con sus bases. Ya está activo."
          : "Sorteo creado. Ya está activo.",
        color: "green",
      });
    } catch (e) {
      notifications.show({
        message: e instanceof Error ? e.message : "No pudimos crear el sorteo.",
        color: "red",
      });
      // El sorteo pudo crearse y fallar solo la subida: refrescar para no dejar la UI mintiendo.
      await Promise.all([
        utils.panel.getSorteo.invalidate(),
        utils.panel.listarSorteos.invalidate(),
      ]);
    }
  });

  const origen = pasados.find((s) => s.id === importarDesde) ?? null;

  const confirmarImportar = () => {
    setImportarDesde(seleccion);
    close();
  };

  return (
    <PanelCard>
      <Group gap="sm" mb="xs">
        <IconTicket className="size-5" stroke={1.75} color="var(--mantine-primary-color-filled)" />
        <Text fw={600}>Crea tu sorteo</Text>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Queda activo al crearlo: desde ahí, cada compra de un producto que participa suma tickets.
        Puedes elegir al ganador cuando quieras.
      </Text>

      <form onSubmit={onSubmit}>
        <CamposSorteo form={form} />

        <Divider my="md" label="Bases del sorteo" labelPosition="left" />
        <FileInput
          label="Bases del sorteo (PDF)"
          description="Obligatorias para publicar tu tienda con el sorteo activo. Puedes adjuntarlas ahora o subirlas después. La responsabilidad legal de su contenido es tuya."
          placeholder="Elegir el archivo PDF"
          accept={ACCEPT_BASES}
          clearable
          value={basesFile}
          onChange={setBasesFile}
          disabled={crear.isPending || subiendoBases}
          leftSection={<IconFileText className="size-4" />}
        />

        {pasados.length > 0 && (
          <>
            <Divider my="md" label="Participantes" labelPosition="left" />
            {origen ? (
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <IconUsersGroup
                    className="size-4"
                    stroke={1.75}
                    color="var(--mantine-primary-color-filled)"
                  />
                  <Text size="sm">
                    Se importarán {num(origen.totalParticipaciones)}{" "}
                    {origen.totalParticipaciones === 1 ? "ticket" : "tickets"} de{" "}
                    <Text span fw={600}>
                      {origen.nombre}
                    </Text>
                  </Text>
                </Group>
                <Button
                  variant="subtle"
                  size="xs"
                  color="gray"
                  leftSection={<IconX className="size-3.5" />}
                  onClick={() => setImportarDesde(null)}
                >
                  Quitar
                </Button>
              </Group>
            ) : (
              <Button
                variant="default"
                size="sm"
                leftSection={<IconUsersGroup className="size-4" />}
                onClick={() => {
                  setSeleccion(null);
                  open();
                }}
              >
                Importar participantes de un sorteo anterior
              </Button>
            )}
          </>
        )}

        <Group mt="lg">
          <Button
            type="submit"
            loading={crear.isPending || subiendoBases}
            leftSection={<IconPlus className="size-4" />}
          >
            Crear sorteo
          </Button>
        </Group>
      </form>

      <Modal
        opened={modalAbierto}
        onClose={close}
        title="Importar participantes"
        centered
      >
        <Text size="sm" c="dimmed" mb="md">
          Elige un sorteo anterior para arrastrar sus participantes (con sus tickets) al nuevo, o
          empieza de cero.
        </Text>
        <Radio.Group value={seleccion ?? ""} onChange={setSeleccion}>
          <Stack gap="xs">
            {pasados.map((s) => (
              <Radio
                key={s.id}
                value={s.id}
                label={
                  <span>
                    {s.nombre}
                    <Text span c="dimmed" size="xs">
                      {" "}
                      · {fecha(s.fechaFin)} ·{" "}
                      <span className="tabular-nums">{num(s.totalParticipaciones)}</span>{" "}
                      {s.totalParticipaciones === 1 ? "participante" : "participantes"}
                    </Text>
                  </span>
                }
              />
            ))}
          </Stack>
        </Radio.Group>
        <Group justify="flex-end" mt="lg">
          <Button
            variant="default"
            onClick={() => {
              setImportarDesde(null);
              close();
            }}
          >
            Empezar de cero
          </Button>
          <Button onClick={confirmarImportar} disabled={!seleccion}>
            Importar de este sorteo
          </Button>
        </Group>
      </Modal>
    </PanelCard>
  );
}

/**
 * Panel del sorteo ACTIVO: stats + edición + imagen del premio + BASES (PDF) + ejecución +
 * participantes (F01/F02; bases en admin-bases-pdf F02). Se alimenta SOLO de `getSorteo`: desde que
 * las bases dejaron de ser un enlace de texto, el form de edición ya no necesita nada de
 * `listarSorteos` para hidratarse (esa query queda para el Historial y el arrastre).
 */
function PanelSorteoActivo({ sorteo }: { sorteo: SorteoActual }) {
  const utils = api.useUtils();
  const [editando, setEditando] = useState(false);

  const form = useForm({
    initialValues: { nombre: "", premio: "", fechaFin: "" },
    validate: VALIDACION_SORTEO,
  });

  const editar = api.panel.editarSorteo.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.panel.getSorteo.invalidate(),
        utils.panel.listarSorteos.invalidate(),
      ]);
      setEditando(false);
      notifications.show({ message: "Sorteo actualizado.", color: "green" });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const ejecutar = api.panel.ejecutarSorteo.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.panel.getSorteo.invalidate(),
        utils.panel.listarSorteos.invalidate(),
      ]);
      notifications.show({
        message: "Sorteo ejecutado. Ya hay un ganador.",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const abrirEdicion = () => {
    form.setValues({
      nombre: sorteo.nombre,
      premio: sorteo.premio,
      fechaFin: aInputDateTime(sorteo.fechaFin),
    });
    setEditando(true);
  };

  const onGuardar = form.onSubmit((values) => {
    editar.mutate({
      raffleId: sorteo.id,
      nombre: values.nombre.trim(),
      premio: values.premio.trim(),
      fechaFin: new Date(values.fechaFin),
    });
  });

  // Confirmación destructiva (D6/I7): la ejecución es IRREVERSIBLE — modal explícito.
  const confirmarEjecucion = () => {
    modals.openConfirmModal({
      title: "Ejecutar el sorteo",
      children: (
        <Text size="sm">
          Se elegirá un ganador al azar entre las {num(sorteo.totalParticipaciones)}{" "}
          participaciones (tickets). Esta acción registra quién y cuándo lo ejecutó y{" "}
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
    <>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard
          label="Participaciones"
          value={num(sorteo.totalParticipaciones)}
          icon={IconUsers}
          hint="tickets en el sorteo"
        />
        <StatCard label="Estado" value="Activo" icon={IconTicket} hint="en curso" />
        <StatCard
          label="Cierre"
          value={fechaHora(sorteo.fechaFin)}
          icon={IconCalendarEvent}
          hint="fecha de fin"
        />
      </SimpleGrid>

      <PanelCard mt="md">
        {editando ? (
          <form onSubmit={onGuardar}>
            <Text fw={600} mb="md">
              Editar sorteo
            </Text>
            <CamposSorteo form={form} />
            <Group mt="lg">
              <Button type="submit" loading={editar.isPending}>
                Guardar cambios
              </Button>
              <Button
                variant="default"
                onClick={() => setEditando(false)}
                disabled={editar.isPending}
              >
                Cancelar
              </Button>
            </Group>
          </form>
        ) : (
          <>
            <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
              <div>
                <Text fw={600}>{sorteo.nombre}</Text>
                <Text size="sm" c="dimmed">
                  {sorteo.premio}
                </Text>
              </div>
              <Group gap="xs" wrap="nowrap">
                <Badge variant="light" styles={{ label: { textTransform: "none" } }}>
                  Activo
                </Badge>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconPencil className="size-3.5" />}
                  onClick={abrirEdicion}
                >
                  Editar
                </Button>
              </Group>
            </Group>

            <Divider my="md" />
            <AssetUploader
              destino={{ destino: "premio", raffleId: sorteo.id }}
              urlActual={sorteo.premioImageUrl}
              label="Imagen del premio"
              description="Se muestra en la vitrina del sorteo de tu tienda. Sin imagen se usa un degradado con tu color."
              onSubido={async () => {
                // Invalidar ambas: `listarSorteos` también proyecta `premioImageUrl` del raffle.
                await Promise.all([
                  utils.panel.getSorteo.invalidate(),
                  utils.panel.listarSorteos.invalidate(),
                ]);
              }}
            />

            <Divider my="md" />
            {/* Bases del sorteo como PDF (admin-bases-pdf F02/D2, ADR-0008): viven en el SORTEO, no
                en Configuración. Subida inmediata sobre el sorteo ya creado; reemplazar = re-subir. */}
            <BasesUploader
              raffleId={sorteo.id}
              urlActual={sorteo.basesPdfUrl}
              onSubido={async () => {
                // Invalidar ambas: `listarSorteos` también proyecta `basesPdfUrl`, y el checklist de
                // publicación depende de esta columna (el gate se recomputa server-side igual).
                await Promise.all([
                  utils.panel.getSorteo.invalidate(),
                  utils.panel.listarSorteos.invalidate(),
                  utils.panel.getEstadoPublicacion.invalidate(),
                ]);
              }}
            />

            <div className="mt-4">
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
            </div>
          </>
        )}
      </PanelCard>

      <PanelCard mt="md">
        <div>
          <Text fw={600}>Participantes</Text>
          <Text size="sm" c="dimmed">
            Quienes están dentro del sorteo y cuántos tickets tienen
          </Text>
        </div>
        <Table.ScrollContainer minWidth={360}>
          <Table verticalSpacing="sm" mt="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Cliente</Table.Th>
                <Table.Th className="text-right">Tickets</Table.Th>
                <Table.Th className="text-right">Última participación</Table.Th>
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
                    <Table.Td c="dimmed">{p.email}</Table.Td>
                    <Table.Td className="text-right tabular-nums" c="dimmed">
                      {num(p.tickets)}
                    </Table.Td>
                    <Table.Td className="whitespace-nowrap text-right" c="dimmed">
                      {fechaHora(p.ultimaInscripcion)}
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </PanelCard>
    </>
  );
}

/** Historial de sorteos CERRADOS con su ganador (F01/D12). */
function HistorialSorteos({ cerrados }: { cerrados: SorteoDeLista[] }) {
  if (cerrados.length === 0) return null;
  return (
    <PanelCard mt="md">
      <Group gap="sm">
        <IconHistory className="size-5" stroke={1.75} color="var(--mantine-color-dimmed)" />
        <div>
          <Text fw={600}>Historial</Text>
          <Text size="sm" c="dimmed">
            Tus sorteos anteriores y quién ganó
          </Text>
        </div>
      </Group>
      <Table.ScrollContainer minWidth={480}>
        <Table verticalSpacing="sm" mt="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Sorteo</Table.Th>
              <Table.Th className="hidden sm:table-cell">Cierre</Table.Th>
              <Table.Th className="text-right">Participaciones</Table.Th>
              <Table.Th>Ganador</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cerrados.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {s.nombre}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {s.premio}
                  </Text>
                </Table.Td>
                <Table.Td className="hidden whitespace-nowrap sm:table-cell" c="dimmed">
                  {s.ejecutadoAt ? fechaHora(s.ejecutadoAt) : fecha(s.fechaFin)}
                </Table.Td>
                <Table.Td className="text-right tabular-nums" c="dimmed">
                  {num(s.totalParticipaciones)}
                </Table.Td>
                <Table.Td>
                  {s.ganadorEmail ? (
                    <Group gap={6} wrap="nowrap">
                      <IconTrophy
                        className="size-4 shrink-0"
                        stroke={1.75}
                        color="var(--mantine-color-premio-6)"
                      />
                      <Text size="sm">{s.ganadorEmail}</Text>
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Sin ganador
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </PanelCard>
  );
}

export default function SorteoPage() {
  const sorteoQuery = api.panel.getSorteo.useQuery(undefined, { retry: false });
  const listaQuery = api.panel.listarSorteos.useQuery(undefined, { retry: false });

  const sorteo = sorteoQuery.data?.sorteo ?? null;
  const hayActivo = sorteo?.estado === "ACTIVO";
  const lista = listaQuery.data?.sorteos ?? [];
  const cerrados = lista.filter((s) => s.ejecutadoAt != null);
  // Al no haber ACTIVO, todos los raffles listados son pasados: fuente del arrastre.
  const pasados = lista.filter((s) => s.estado !== "ACTIVO");

  const cargando = sorteoQuery.isLoading || listaQuery.isLoading;
  const error = sorteoQuery.isError || listaQuery.isError;

  return (
    <AdminLayout
      title="Sorteo"
      description="Crea y administra el sorteo de tu tienda, sus participantes y el ganador."
    >
      {cargando ? (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Skeleton height={104} radius="lg" />
            <Skeleton height={104} radius="lg" />
            <Skeleton height={104} radius="lg" />
          </SimpleGrid>
          <Skeleton height={220} radius="lg" />
        </Stack>
      ) : error ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <Text size="sm" c="red">
            No pudimos cargar el sorteo.
          </Text>
          <Button
            variant="default"
            mt="md"
            onClick={() => {
              void sorteoQuery.refetch();
              void listaQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          {hayActivo && sorteo ? (
            <PanelSorteoActivo sorteo={sorteo} />
          ) : (
            <FormularioCrearSorteo pasados={pasados} />
          )}
          <HistorialSorteos cerrados={cerrados} />
        </>
      )}
    </AdminLayout>
  );
}
