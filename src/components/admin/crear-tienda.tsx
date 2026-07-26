import {
  Alert,
  Button,
  Card,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconBuildingStore } from "@tabler/icons-react";

import { construirUrlSubdominio } from "~/lib/urlApex";
import { api } from "~/utils/api";

/**
 * Alta self-service de Tienda (F08/F01): el formulario que reemplaza al empty state
 * "sin tienda" para un Organizador nuevo. Pide identificador (slug = subdominio) + nombre,
 * y al crear invalida `getAccesoActual` para que el layout re-renderice ya con la Tienda.
 *
 * NO reimplementa la validez del slug (D7/I4): normaliza lo tipeado a una forma amigable
 * (minúsculas, guiones) y deja que el SERVER (esSlugValido + reservados + unicidad de DB)
 * sea la autoridad — su mensaje de error se muestra tal cual. Reimplementar el regex acá
 * sería la definición paralela que el plan prohíbe.
 */

/** Normaliza lo tipeado hacia un slug DNS-amigable, sin decidir validez (eso es del server). */
function normalizarSlug(valor: string): string {
  return valor
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-") // espacios/símbolos ⇒ guion
    .replace(/-+/g, "-") // colapsa guiones repetidos
    .replace(/^-+/, ""); // sin guion inicial (el final se limpia al enviar, no al tipear)
}

interface CrearTiendaForm {
  slug: string;
  nombre: string;
}

export function CrearTienda() {
  const utils = api.useUtils();

  const form = useForm<CrearTiendaForm>({
    initialValues: { slug: "", nombre: "" },
    validate: {
      slug: (v) => (v.trim().length === 0 ? "Elige un identificador" : null),
      nombre: (v) =>
        v.trim().length === 0 ? "El nombre es obligatorio" : null,
    },
  });

  const crear = api.panel.crearTienda.useMutation({
    onSuccess: async (tienda) => {
      await utils.panel.getAccesoActual.invalidate();
      notifications.show({
        message: "¡Tu tienda fue creada! Vamos a configurarla.",
        color: "green",
      });
      // El panel vive en el SUBDOMINIO de la tienda (ADR-0022) y este formulario es lo único que
      // queda en el apex: recién creada la tienda hay que MUDARSE a su dirección, o el panel se
      // quedaría en un host sin tienda (donde todo procedure de contenido es fail-closed).
      // Navegación DURA (cross-host): `next/router` no sirve para cambiar de host.
      window.location.assign(
        construirUrlSubdominio({
          protocol: window.location.protocol,
          // En el apex, el host ACTUAL es el apex: de ahí cuelga el subdominio nuevo.
          apex: window.location.hostname,
          puerto: window.location.port,
          // El slug de la RESPUESTA, no el del input: el server es su autoridad (D7/I4).
          slug: tienda.slug,
          path: "/admin",
        }),
      );
    },
    onError: (error) => {
      // El server es la autoridad del slug (tomado/reservado/formato) y de la regla
      // "una tienda por cuenta". Se muestra su mensaje en el campo y como notificación.
      form.setFieldError("slug", error.message);
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const submit = form.onSubmit((valores) =>
    crear.mutate({
      // se limpia el guion final recién al enviar (tipear "mi-" no debe borrarlo en vivo)
      slug: valores.slug.replace(/-+$/, ""),
      nombre: valores.nombre.trim(),
    }),
  );

  const slugPreview = form.values.slug.replace(/-+$/, "");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-8">
      <Card withBorder radius="md" padding="xl" className="w-full max-w-md">
        <Stack align="center" gap={4} mb="lg">
          <ThemeIcon size={48} radius="xl" variant="light">
            <IconBuildingStore className="size-6" stroke={1.75} />
          </ThemeIcon>
          <Text mt="xs" size="lg" fw={600}>
            Crea tu tienda
          </Text>
          <Text size="sm" c="dimmed" ta="center" className="max-w-sm">
            Elige un identificador y un nombre para empezar. Podrás configurar
            tus productos, pagos y sorteo antes de publicarla.
          </Text>
        </Stack>

        <form onSubmit={submit}>
          <Stack gap="md">
            <div>
              <TextInput
                label="Identificador de la tienda"
                placeholder="mi-tienda"
                description="Solo minúsculas, números y guiones. Será la dirección de tu tienda."
                autoComplete="off"
                {...form.getInputProps("slug")}
                onChange={(e) =>
                  form.setFieldValue("slug", normalizarSlug(e.currentTarget.value))
                }
              />
              {slugPreview && (
                <Text size="xs" c="dimmed" mt={6}>
                  Tu tienda vivirá en{" "}
                  <Text component="span" fw={600}>
                    {slugPreview}
                  </Text>
                  .tudominio
                </Text>
              )}
            </div>

            <TextInput
              label="Nombre de la tienda"
              placeholder="Mi Tienda"
              autoComplete="off"
              {...form.getInputProps("nombre")}
            />

            <Alert
              variant="light"
              color="gray"
              icon={<IconAlertCircle className="size-4" />}
              p="sm"
            >
              <Text size="xs">
                El identificador no se puede cambiar después de crear la tienda.
              </Text>
            </Alert>

            <Button type="submit" loading={crear.isPending} fullWidth>
              Crear mi tienda
            </Button>
          </Stack>
        </form>
      </Card>
    </div>
  );
}
