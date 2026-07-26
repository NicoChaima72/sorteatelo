import { Badge, Button, Divider, Group, Skeleton, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconPlugConnected,
  IconPlugConnectedX,
  IconSparkles,
} from "@tabler/icons-react";

import { EmptyState } from "~/components/admin/empty-state";
import { SettingCard } from "~/components/admin/setting-card";
import { fechaHora } from "~/lib/formato";
import { api, type RouterOutputs } from "~/utils/api";

type Conexion = RouterOutputs["mcp"]["listarConexiones"][number];

/**
 * Sección «Conexiones IA» de Configuración (F09, ADR-0025): las [[Conexión MCP]]es del Organizador
 * logueado, con su último uso y el botón para cortarlas.
 *
 * Es la **contraparte de la pantalla de consentimiento**: si en el consent se otorga el acceso, acá
 * se retira. Sin esta pantalla, autorizar sería irreversible desde el producto (habría que esperar a
 * que el refresh caduque a los 30 días), y un consent sin salida es un consentimiento de mentira.
 *
 * Dos decisiones de forma que vienen del server (`listarConexionesDeUsuario`):
 * - La unidad es la **Conexión** (par usuario+cliente), no el token: un cliente conectado renueva su
 *   access token cada hora, así que una lista de tokens sería ilegible en una semana.
 * - Las conexiones revocadas o vencidas **no desaparecen**: quedan como historial de que ese cliente
 *   estuvo conectado, en gris y sin botón.
 *
 * Es la única card de Configuración que NO es de la Tienda sino de la PERSONA: la conexión cruza sus
 * tiendas (con un token se configura una y se crea otra). Vive acá porque es donde la va a buscar.
 */
export function ConexionesIaCard() {
  const utils = api.useUtils();
  const conexiones = api.mcp.listarConexiones.useQuery(undefined, {
    retry: false,
  });

  const revocar = api.mcp.revocarConexion.useMutation({
    onSuccess: async () => {
      await utils.mcp.listarConexiones.invalidate();
      notifications.show({
        message: "Acceso revocado. La app tendrá que pedir permiso de nuevo.",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const confirmarRevocar = (conexion: Conexion) => {
    modals.openConfirmModal({
      title: "Revocar el acceso",
      children: (
        <Text size="sm">
          <Text span fw={600}>
            {conexion.nombre}
          </Text>{" "}
          dejará de poder ver y cambiar tus tiendas. Lo que ya hizo no se
          deshace. Para volver a conectarse tendrá que pedirte permiso otra vez.
        </Text>
      ),
      labels: { confirm: "Revocar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => revocar.mutate({ clientId: conexion.clientId }),
    });
  };

  return (
    <SettingCard
      icon={IconSparkles}
      title="Conexiones IA"
      description="Las apps de inteligencia artificial a las que le diste permiso para operar tu cuenta. Puedes cortarles el acceso cuando quieras."
    >
      {conexiones.isLoading && (
        <Stack gap="sm">
          {/* 56 ≈ la altura real de una fila (nombre + badge arriba, fechas abajo): un skeleton más
              bajo produce un salto al llegar la data. */}
          <Skeleton height={56} radius="sm" />
          <Skeleton height={56} radius="sm" />
        </Stack>
      )}

      {conexiones.data?.length === 0 && (
        <EmptyState
          icon={IconPlugConnected}
          title="Aún no has conectado ninguna app"
          description="Cuando autorices una app de IA para que te ayude a manejar tu tienda, aparecerá acá."
        />
      )}

      {/* No se traga el error: sin esto, una consulta fallida se vería idéntica a "no tengo ninguna
          conexión" — y en esta pantalla esa confusión significa creer que nadie tiene acceso. La
          FORMA es la estándar del panel (rojo + "Reintentar" con refetch, frontend-conventions §
          Data fetching); lo propio de acá es solo el copy, que nombra el riesgo de confundirlo con
          el estado vacío. El `align="center" py="lg"` es el de los otros tres SettingCard con
          estado de error (campos-checkout, checklist-publicacion, activar-plan-modal). */}
      {conexiones.error && (
        <Stack align="center" py="lg" gap="sm">
          <Text size="sm" c="red">
            No pudimos cargar tus conexiones. Esto no significa que nadie tenga acceso: no lo
            sabemos hasta poder consultarlo.
          </Text>
          <Button
            variant="default"
            size="xs"
            onClick={() => void conexiones.refetch()}
          >
            Reintentar
          </Button>
        </Stack>
      )}

      {conexiones.data && conexiones.data.length > 0 && (
        <Stack gap={0}>
          {conexiones.data.map((conexion, i) => (
            <div key={conexion.clientId}>
              {i > 0 && <Divider my="xs" />}
              <Group justify="space-between" wrap="nowrap" gap="sm" py={4}>
                <div className="min-w-0">
                  <Group gap="xs" wrap="nowrap">
                    {/* El nombre lo elige la app al registrarse ⇒ dato NO confiable: se trunca para
                        que uno larguísimo no rompa la card (React ya lo escapa). */}
                    <Text size="sm" fw={500} className="truncate">
                      {conexion.nombre}
                    </Text>
                    <Badge
                      variant="light"
                      color={conexion.activa ? "exito" : "gray"}
                      radius="sm"
                      // `shrink-0`: mismo bug que el botón «Revocar» — con un `clientName` largo
                      // (texto que elige quien registra el cliente por DCR) el Badge cedía ancho y
                      // se recortaba a «Con acc…». Medido: clientWidth 55 vs scrollWidth 62.
                      className="shrink-0"
                      styles={{ label: { fontWeight: 500, textTransform: "none" } }}
                    >
                      {conexion.activa ? "Con acceso" : "Sin acceso"}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Conectada el {fechaHora(conexion.conectadaEl)}
                    {conexion.ultimoUso
                      ? ` · La usó por última vez el ${fechaHora(conexion.ultimoUso)}`
                      : " · Todavía no la usó"}
                  </Text>
                </div>
                {conexion.activa && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    // `shrink-0`: sin esto el botón cede ancho cuando la línea de fechas envuelve a
                    // dos líneas, y su label —que es `nowrap` + `overflow:hidden`— se recorta a
                    // "Revoca". Medido: clientWidth 35 vs scrollWidth 46 en la columna de 477px.
                    className="shrink-0"
                    leftSection={<IconPlugConnectedX className="size-4" />}
                    onClick={() => confirmarRevocar(conexion)}
                    loading={
                      revocar.isPending &&
                      revocar.variables?.clientId === conexion.clientId
                    }
                  >
                    Revocar
                  </Button>
                )}
              </Group>
            </div>
          ))}
        </Stack>
      )}
    </SettingCard>
  );
}
