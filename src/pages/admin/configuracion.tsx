import {
  Badge,
  Button,
  Card,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCreditCard,
  IconPalette,
  IconTicket,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { type ComponentType, type ReactNode, useEffect } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { fechaHora } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

function SettingCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: IconCmp;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group gap="xs" mb={4}>
        <Icon className="size-[18px]" stroke={1.75} />
        <Text fw={600}>{title}</Text>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {description}
      </Text>
      {children}
    </Card>
  );
}

/** Card de credenciales Flow: WRITE-ONLY (nunca precarga secretos; solo muestra el estado). */
function CredencialFlowCard() {
  const utils = api.useUtils();
  const estado = api.panel.getEstadoCredencialFlow.useQuery(undefined, {
    retry: false,
  });

  const form = useForm({
    initialValues: { apiKey: "", secretKey: "", sandbox: "sandbox" },
  });

  const guardar = api.panel.guardarCredencialFlow.useMutation({
    onSuccess: async () => {
      form.setFieldValue("apiKey", "");
      form.setFieldValue("secretKey", "");
      await utils.panel.getEstadoCredencialFlow.invalidate();
      notifications.show({
        message: "Credenciales guardadas.",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const puedeGuardar =
    form.values.apiKey.trim() !== "" && form.values.secretKey.trim() !== "";

  const submit = form.onSubmit((valores) =>
    guardar.mutate({
      apiKey: valores.apiKey,
      secretKey: valores.secretKey,
      sandbox: valores.sandbox === "sandbox",
    }),
  );

  return (
    <SettingCard
      icon={IconCreditCard}
      title="Pagos (Flow)"
      description="Conecta tu cuenta de Flow para cobrar. Tus claves se guardan cifradas y nunca se muestran."
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Paper withBorder p="sm" radius="md">
            <Group justify="space-between" gap="sm">
              <Text size="sm" c="dimmed">
                Estado
              </Text>
              {estado.isLoading ? (
                <Skeleton height={20} width={96} />
              ) : estado.isError ? (
                <Button
                  variant="subtle"
                  color="red"
                  size="compact-xs"
                  onClick={() => void estado.refetch()}
                >
                  Error al cargar · Reintentar
                </Button>
              ) : estado.data?.configurada ? (
                <Group gap="xs">
                  <Badge
                    variant="light"
                    styles={{ label: { textTransform: "none" } }}
                  >
                    Configurada
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {estado.data.sandbox ? "sandbox" : "producción"}
                    {estado.data.updatedAt
                      ? ` · ${fechaHora(estado.data.updatedAt)}`
                      : ""}
                  </Text>
                </Group>
              ) : (
                <Badge
                  variant="outline"
                  color="gray"
                  styles={{ label: { fontWeight: 400, textTransform: "none" } }}
                >
                  No conectada
                </Badge>
              )}
            </Group>
          </Paper>

          <TextInput
            label="API Key"
            type="password"
            autoComplete="off"
            placeholder="••••••••••••"
            {...form.getInputProps("apiKey")}
          />
          <TextInput
            label="Secret Key"
            type="password"
            autoComplete="off"
            placeholder="••••••••••••"
            {...form.getInputProps("secretKey")}
          />
          <Select
            label="Ambiente"
            className="sm:max-w-52"
            allowDeselect={false}
            data={[
              { value: "sandbox", label: "Sandbox (pruebas)" },
              { value: "produccion", label: "Producción" },
            ]}
            {...form.getInputProps("sandbox")}
          />

          <Button
            type="submit"
            loading={guardar.isPending}
            disabled={!puedeGuardar}
            className="self-start"
          >
            Guardar credenciales
          </Button>
        </Stack>
      </form>
    </SettingCard>
  );
}

interface ConfigTiendaForm {
  descripcion: string;
  logoUrl: string;
  colorPrimario: string;
  basesSorteo: string;
}

/** Card de config de tienda: descripción, logo, color, bases del sorteo (texto). */
function ConfiguracionTiendaCard() {
  const utils = api.useUtils();
  const config = api.panel.getConfiguracionTienda.useQuery(undefined, {
    retry: false,
  });

  const form = useForm<ConfigTiendaForm>({
    initialValues: {
      descripcion: "",
      logoUrl: "",
      colorPrimario: "",
      basesSorteo: "",
    },
  });

  // Rehidratar el form cuando llegan los datos.
  useEffect(() => {
    if (!config.data) return;
    form.setValues({
      descripcion: config.data.descripcion ?? "",
      logoUrl: config.data.logoUrl ?? "",
      colorPrimario: config.data.colorPrimario ?? "",
      basesSorteo: config.data.basesSorteo ?? "",
    });
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data]);

  const guardar = api.panel.guardarConfiguracionTienda.useMutation({
    onSuccess: async () => {
      await utils.panel.getConfiguracionTienda.invalidate();
      notifications.show({ message: "Cambios guardados.", color: "green" });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  if (config.isLoading) {
    return (
      <SettingCard
        icon={IconPalette}
        title="Tu tienda"
        description="La descripción, el logo y el color de tu tienda."
      >
        <Stack gap="sm">
          <Skeleton height={80} />
          <Skeleton height={36} />
        </Stack>
      </SettingCard>
    );
  }

  // Error: NO renderizar el form editable (evita que un fetch fallido muestre campos en
  // blanco y que "Guardar" pise la config real —incluidas las bases— con strings vacíos).
  if (config.isError || !config.data) {
    return (
      <SettingCard
        icon={IconPalette}
        title="Tu tienda"
        description="La descripción, el logo y el color de tu tienda."
      >
        <Stack align="center" py="lg" gap="sm">
          <Text size="sm" c="red">
            No pudimos cargar la configuración de tu tienda.
          </Text>
          <Button
            variant="default"
            size="xs"
            onClick={() => void config.refetch()}
          >
            Reintentar
          </Button>
        </Stack>
      </SettingCard>
    );
  }

  return (
    <SettingCard
      icon={IconPalette}
      title="Tu tienda"
      description="La descripción, el logo y el color de tu tienda. El diseño real llega más adelante."
    >
      <form onSubmit={form.onSubmit((valores) => guardar.mutate(valores))}>
        <Stack gap="md">
          <Textarea
            label="Descripción"
            placeholder="Una línea que describa tu tienda."
            minRows={2}
            autosize
            {...form.getInputProps("descripcion")}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Logo (URL)"
              placeholder="https://…"
              {...form.getInputProps("logoUrl")}
            />
            <TextInput
              label="Color de marca (hex)"
              placeholder="#4f46e5"
              {...form.getInputProps("colorPrimario")}
            />
          </SimpleGrid>

          <div
            className="pt-4"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
          >
            <Group gap="xs" mb="xs">
              <IconTicket className="size-[18px]" stroke={1.75} />
              <Text size="sm" fw={500}>
                Bases del sorteo
              </Text>
            </Group>
            <Textarea
              placeholder="Escribe aquí las bases legales del sorteo. Tú eres responsable de su contenido."
              minRows={6}
              autosize
              {...form.getInputProps("basesSorteo")}
            />
            <Text size="xs" c="dimmed" mt={6}>
              El texto de las bases. La responsabilidad legal del sorteo es tuya.
            </Text>
          </div>

          <Button
            type="submit"
            loading={guardar.isPending}
            className="self-start"
          >
            Guardar cambios
          </Button>
        </Stack>
      </form>
    </SettingCard>
  );
}

export default function ConfiguracionPage() {
  return (
    <AdminLayout
      title="Configuración"
      description="Los ajustes de tu tienda: pagos, marca y bases del sorteo."
    >
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" style={{ alignItems: "start" }}>
        <CredencialFlowCard />
        <ConfiguracionTiendaCard />
      </SimpleGrid>
    </AdminLayout>
  );
}
