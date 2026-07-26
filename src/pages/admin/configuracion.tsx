import {
  Badge,
  Button,
  ColorInput,
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
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconCreditCard,
  IconMail,
  IconPalette,
  IconPhoto,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { useEffect } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { AssetUploader } from "~/components/admin/asset-uploader";
import { CamposCheckoutCard } from "~/components/admin/campos-checkout";
import { ConexionesIaCard } from "~/components/admin/conexiones-ia";
import { SettingCard } from "~/components/admin/setting-card";
import { SWATCHES_MARCA } from "~/lib/coloresMarca";
import { fechaHora } from "~/lib/formato";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  // Matriz de acceso del panel scopeado por subdominio (ADR-0022): redirige al login del apex,
  // al storefront o a la primera tienda, o responde 404 neutral, según host + sesión + membresía.
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
  return { props: {} };
};

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
          <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
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

/**
 * Descripción de la card «Tu tienda», en UNA constante: los tres estados (loading / error / éxito)
 * deben decir lo MISMO. Antes divergían y el copy honesto sobre dónde se edita el hero solo aparecía
 * en el estado feliz (admin-bases-pdf F06).
 */
const DESCRIPCION_TU_TIENDA =
  "La marca base de tu tienda: logo, colores, el prefijo de tus números, redes y contacto. El contenido de la portada (hero, textos, avisos) se edita en el editor.";

/**
 * Normaliza lo tipeado hacia la forma canónica del prefijo de ticket (F08/D12): MAYÚSCULAS y solo
 * alfanuméricos. NO decide validez —eso es del server, `guardarConfiguracionTiendaInput`, cuyo
 * mensaje de error se muestra tal cual— sino que impide tipear lo imposible, exactamente como
 * `normalizarSlug` en `crear-tienda.tsx`. Reimplementar el regex de validación acá sería la
 * definición paralela que las conventions prohíben.
 *
 * El caso concreto que evita: alguien escribe `army-` esperando que el guion sea parte del prefijo
 * y se entera recién al guardar. Acá el guion no llega a aparecer, que es la forma más corta de
 * decir «el guion lo ponemos nosotros».
 */
function normalizarPrefijoTicket(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

interface ConfigTiendaForm {
  descripcion: string;
  colorPrimario: string;
  colorAcento: string;
  prefijoTicket: string;
  instagramUrl: string;
  tiktokUrl: string;
  whatsappUrl: string;
  contactoEmail: string;
}

/** Card de config de tienda: descripción, marca (logo/hero/color) y redes/contacto. Las BASES del
 *  sorteo ya NO viven acá (admin-bases-pdf F03/D2/D3): son el PDF del Sorteo, en `/admin/sorteo`. */
function ConfiguracionTiendaCard() {
  const utils = api.useUtils();
  const config = api.panel.getConfiguracionTienda.useQuery(undefined, {
    retry: false,
  });

  const form = useForm<ConfigTiendaForm>({
    initialValues: {
      descripcion: "",
      colorPrimario: "",
      colorAcento: "",
      prefijoTicket: "",
      instagramUrl: "",
      tiktokUrl: "",
      whatsappUrl: "",
      contactoEmail: "",
    },
  });

  // Rehidratar el form cuando llegan los datos. Los assets (logo/hero) NO son campos del form:
  // los sube el AssetUploader (presigned PUT + confirmación, D4/I6).
  useEffect(() => {
    if (!config.data) return;
    form.setValues({
      descripcion: config.data.descripcion ?? "",
      colorPrimario: config.data.colorPrimario ?? "",
      colorAcento: config.data.colorAcento ?? "",
      prefijoTicket: config.data.prefijoTicket ?? "",
      instagramUrl: config.data.instagramUrl ?? "",
      tiktokUrl: config.data.tiktokUrl ?? "",
      whatsappUrl: config.data.whatsappUrl ?? "",
      contactoEmail: config.data.contactoEmail ?? "",
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
        description={DESCRIPCION_TU_TIENDA}
      >
        <Stack gap="sm">
          <Skeleton height={80} />
          <Skeleton height={36} />
        </Stack>
      </SettingCard>
    );
  }

  // Error: NO renderizar el form editable (evita que un fetch fallido muestre campos en
  // blanco y que "Guardar" pise la config real con strings vacíos).
  if (config.isError || !config.data) {
    return (
      <SettingCard
        icon={IconPalette}
        title="Tu tienda"
        description={DESCRIPCION_TU_TIENDA}
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

  const invalidarConfig = () => utils.panel.getConfiguracionTienda.invalidate();

  return (
    <SettingCard
      icon={IconPalette}
      title="Tu tienda"
      description={DESCRIPCION_TU_TIENDA}
    >
      <Stack gap="md">
        {/* Assets de marca — se suben al instante (independiente del botón Guardar). */}
        <div
          className="pb-4"
          style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
        >
          <Group gap="xs" mb="xs">
            <IconPhoto className="size-[18px]" stroke={1.75} />
            <Text size="sm" fw={500}>
              Logo de la tienda
            </Text>
          </Group>
          <Stack gap="md">
            <AssetUploader
              destino={{ destino: "logo" }}
              urlActual={config.data.logoUrl}
              label="Logo de la tienda"
              description="Aparece en el encabezado. Si no subes uno, se muestra el nombre de tu tienda."
              onSubido={invalidarConfig}
            />
          </Stack>
        </div>

        <form onSubmit={form.onSubmit((valores) => guardar.mutate(valores))}>
          <Stack gap="md">
            <Textarea
              label="Descripción"
              placeholder="Una línea que describa tu tienda."
              minRows={2}
              autosize
              {...form.getInputProps("descripcion")}
            />
            {/*
              Los DOS colores de marca, juntos y gemelos (admin-bases-pdf F06/D7/D12): cierra la
              deuda de builder-tanda-1, donde el primario vivía acá y el acento SOLO en el editor.
              Ambos son columnas del Tenant que el storefront lee por request ⇒ guardar es aplicar,
              sin publicar nada. Mismo control que el panel de Tema del editor (ColorInput + la
              paleta compartida): el mismo campo no puede verse distinto según por dónde se entre.
            */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <ColorInput
                label="Color de marca"
                description="El color principal de tu tienda."
                placeholder="#4f46e5"
                format="hex"
                swatches={[...SWATCHES_MARCA]}
                {...form.getInputProps("colorPrimario")}
              />
              <ColorInput
                label="Color de acento"
                description="Un 2º color para fondos, títulos y detalles."
                placeholder="Sin acento (usa el color de marca)"
                format="hex"
                swatches={[...SWATCHES_MARCA]}
                {...form.getInputProps("colorAcento")}
              />
            </SimpleGrid>

            {/*
              Prefijo de los Números del sorteo (F08/D12). Va acá, junto al logo y los colores,
              porque es identidad de la TIENDA y no de un sorteo puntual: la misma marca acompaña a
              todos los sorteos que monte.

              Queda a lo ancho de la card como sus hermanos de texto (Descripción, redes) y NO con
              un `max-w`: en Mantine el `className` cae sobre el `Input.Wrapper` entero, así que
              acotarlo angostaría también la `description` —que acá es de tres frases— y la partiría
              en una columna de seis líneas al lado de campos full-width.

              `maxLength` + la normalización al tipear espejan el schema Zod (el guion NO se
              escribe: lo pone el formateador). Es el mismo patrón del slug en `crear-tienda.tsx`:
              el campo impide tipear lo imposible y el SERVER sigue siendo la autoridad. La última
              frase de la descripción existe porque el prefijo es PRESENTACIÓN (I12): cambiarlo
              re-etiqueta también los números ya emitidos, y eso hay que decirlo antes y no
              descubrirlo.
            */}
            <TextInput
              label="Prefijo de los números del sorteo"
              description="Se antepone a los números en tu panel y en los correos: ARMY-1043. Hasta 8 letras o números, sin el guion. Si lo cambias, los números que ya entregaste se muestran con el prefijo nuevo."
              placeholder="Sin prefijo (ej. ARMY)"
              maxLength={8}
              autoComplete="off"
              {...form.getInputProps("prefijoTicket")}
              onChange={(e) =>
                form.setFieldValue(
                  "prefijoTicket",
                  normalizarPrefijoTicket(e.currentTarget.value),
                )
              }
            />

            <div
              className="pt-4"
              style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
            >
              <Group gap="xs" mb="xs">
                <IconBrandInstagram className="size-[18px]" stroke={1.75} />
                <Text size="sm" fw={500}>
                  Redes y contacto
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mb="sm">
                Aparecen en el pie de tu tienda. Cada campo vacío se oculta.
              </Text>
              <Stack gap="md">
                <TextInput
                  label="Instagram"
                  placeholder="https://instagram.com/tu-tienda"
                  leftSection={<IconBrandInstagram className="size-4" />}
                  {...form.getInputProps("instagramUrl")}
                />
                <TextInput
                  label="TikTok"
                  placeholder="https://tiktok.com/@tu-tienda"
                  leftSection={<IconBrandTiktok className="size-4" />}
                  {...form.getInputProps("tiktokUrl")}
                />
                <TextInput
                  label="WhatsApp"
                  placeholder="https://wa.me/56900000000"
                  leftSection={<IconBrandWhatsapp className="size-4" />}
                  {...form.getInputProps("whatsappUrl")}
                />
                <TextInput
                  label="Correo de contacto"
                  placeholder="hola@tu-tienda.cl"
                  leftSection={<IconMail className="size-4" />}
                  {...form.getInputProps("contactoEmail")}
                />
              </Stack>
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
      </Stack>
    </SettingCard>
  );
}

export default function ConfiguracionPage() {
  return (
    <AdminLayout
      title="Configuración"
      description="Los ajustes de tu tienda: pagos, marca y checkout."
    >
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" style={{ alignItems: "start" }}>
        <CredencialFlowCard />
        <ConfiguracionTiendaCard />
        <CamposCheckoutCard />
        {/* Es la única card de esta pantalla que es de la PERSONA y no de la Tienda (una Conexión
            MCP cruza sus tiendas); vive acá porque es donde la va a buscar. */}
        <ConexionesIaCard />
      </SimpleGrid>
    </AdminLayout>
  );
}
