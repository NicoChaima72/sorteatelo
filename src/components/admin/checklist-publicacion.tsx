import {
  Alert,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconCircleDashed,
  IconExternalLink,
  IconRosetteDiscountCheck,
} from "@tabler/icons-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { EstadoTiendaBadge } from "~/components/admin/estado-tienda-badge";
import { abrirTienda } from "~/components/admin/url-tienda";
import { api } from "~/utils/api";

/**
 * Checklist de publicación + publicar/despublicar (F08/F03, D4/D5, ADR-0008). El estado sale de
 * `getEstadoPublicacion` (única fuente de verdad server-side); el botón Publicar se habilita solo
 * con `puedePublicar` — pero el gate REAL lo recomputa `publicarTienda` en el server (I2), esto es
 * solo la guía visual. Cada requisito pendiente enlaza a la página del panel donde se resuelve.
 */

interface ItemChecklist {
  cumplido: boolean;
  titulo: string;
  descripcion: string;
  accion: ReactNode;
}

/** Fila de un requisito del checklist: ícono de estado + texto + acción (link o botón). */
function FilaRequisito({ item }: { item: ItemChecklist }) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      align="flex-start"
      gap="sm"
      py="xs"
    >
      <Group wrap="nowrap" align="flex-start" gap="sm">
        <ThemeIcon
          variant="light"
          color={item.cumplido ? "exito" : "gray"}
          radius="xl"
          size="md"
        >
          {item.cumplido ? (
            <IconCircleCheck className="size-[18px]" stroke={1.75} />
          ) : (
            <IconCircleDashed className="size-[18px]" stroke={1.75} />
          )}
        </ThemeIcon>
        <div>
          <Text size="sm" fw={500}>
            {item.titulo}
          </Text>
          <Text size="xs" c="dimmed">
            {item.descripcion}
          </Text>
        </div>
      </Group>
      {!item.cumplido && <div className="shrink-0">{item.accion}</div>}
    </Group>
  );
}

/** Modal que muestra el ToS versionado y permite aceptarlo (F02). */
function TosModal({
  opened,
  onClose,
  onAceptado,
}: {
  opened: boolean;
  onClose: () => void;
  onAceptado: () => Promise<void>;
}) {
  const tos = api.panel.getTos.useQuery(undefined, {
    enabled: opened,
    retry: false,
  });

  const aceptar = api.panel.aceptarTos.useMutation({
    onSuccess: async () => {
      await onAceptado();
      notifications.show({
        message: "Aceptaste los Términos de Servicio.",
        color: "green",
      });
      onClose();
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Términos de Servicio"
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {tos.isLoading ? (
          <Stack gap="xs">
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} width="70%" />
          </Stack>
        ) : tos.isError || !tos.data ? (
          <Stack align="center" py="lg" gap="sm">
            <Text size="sm" c="red">
              No pudimos cargar los Términos.
            </Text>
            <Button variant="default" size="xs" onClick={() => void tos.refetch()}>
              Reintentar
            </Button>
          </Stack>
        ) : (
          <>
            <Text
              size="sm"
              c="dimmed"
              className="whitespace-pre-wrap"
              component="div"
            >
              {tos.data.texto}
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                loading={aceptar.isPending}
                onClick={() => aceptar.mutate()}
                leftSection={<IconRosetteDiscountCheck className="size-4" />}
              >
                Acepto los Términos
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

export function ChecklistPublicacion() {
  const utils = api.useUtils();
  const [tosOpen, tosHandlers] = useDisclosure(false);
  const estado = api.panel.getEstadoPublicacion.useQuery(undefined, {
    retry: false,
  });

  const invalidar = async () => {
    await Promise.all([
      utils.panel.getEstadoPublicacion.invalidate(),
      utils.panel.getConfiguracionTienda.invalidate(),
      utils.panel.getAccesoActual.invalidate(),
    ]);
  };

  const publicar = api.panel.publicarTienda.useMutation({
    onSuccess: async () => {
      await invalidar();
      notifications.show({
        message: "¡Tu tienda está publicada!",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const despublicar = api.panel.despublicarTienda.useMutation({
    onSuccess: async () => {
      await invalidar();
      notifications.show({
        message: "Tu tienda dejó de estar publicada.",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const confirmarDespublicar = () =>
    modals.openConfirmModal({
      title: "Despublicar tu tienda",
      children: (
        <Text size="sm">
          Tu tienda dejará de estar disponible en su dirección pública y no podrá
          vender hasta que la vuelvas a publicar. Podrás volver a publicarla
          cuando quieras.
        </Text>
      ),
      labels: { confirm: "Despublicar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => despublicar.mutate(),
    });

  // Abrir el storefront en su subdominio (helper compartido con el chrome del admin, D6).
  const verTienda = () => {
    if (estado.data) abrirTienda(estado.data.slug);
  };

  if (estado.isLoading) {
    return (
      <Card withBorder padding="lg" radius="md">
        <Skeleton height={24} width={220} mb="md" />
        <Stack gap="sm">
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </Stack>
      </Card>
    );
  }

  if (estado.isError || !estado.data) {
    return (
      <Card withBorder padding="lg" radius="md">
        <Stack align="center" py="md" gap="sm">
          <Text size="sm" c="red">
            No pudimos cargar el estado de publicación de tu tienda.
          </Text>
          <Button variant="default" size="xs" onClick={() => void estado.refetch()}>
            Reintentar
          </Button>
        </Stack>
      </Card>
    );
  }

  const { estado: estadoTienda, requisitos, puedePublicar } = estado.data;

  // Tienda publicada: banner + ver storefront + despublicar.
  if (estadoTienda === "PUBLICADA") {
    return (
      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Group wrap="nowrap" gap="sm" align="flex-start">
            <ThemeIcon variant="light" color="exito" radius="xl" size="lg">
              <IconCircleCheck className="size-5" stroke={1.75} />
            </ThemeIcon>
            <div>
              <Text fw={600}>Tu tienda está publicada</Text>
              <Text size="sm" c="dimmed">
                Está disponible en su dirección pública y puede vender.
              </Text>
            </div>
          </Group>
          <EstadoTiendaBadge estado="PUBLICADA" />
        </Group>
        <Group mt="md" gap="sm">
          <Button
            variant="default"
            leftSection={<IconExternalLink className="size-4" />}
            onClick={verTienda}
          >
            Ver mi tienda
          </Button>
          <Button
            variant="subtle"
            color="red"
            loading={despublicar.isPending}
            onClick={confirmarDespublicar}
          >
            Despublicar
          </Button>
        </Group>
      </Card>
    );
  }

  // Tienda suspendida por el Operador: sin acciones de publicación.
  if (estadoTienda === "SUSPENDIDA") {
    return (
      <Alert
        variant="light"
        color="red"
        icon={<IconAlertTriangle className="size-5" />}
        title="Tu tienda está suspendida"
      >
        <Text size="sm">
          Un Operador de la plataforma suspendió tu tienda. Contáctalo para
          reactivarla.
        </Text>
      </Alert>
    );
  }

  // ALTA / CONFIGURACION: checklist de pasos pendientes hacia la publicación.
  const items: ItemChecklist[] = [
    {
      cumplido: requisitos.tos.cumplido,
      titulo: "Acepta los Términos de Servicio",
      descripcion: "Necesario para publicar (define tu responsabilidad).",
      accion: (
        <Button size="xs" variant="light" onClick={tosHandlers.open}>
          Leer y aceptar
        </Button>
      ),
    },
    {
      cumplido: requisitos.flow.cumplido,
      titulo: "Conecta tu cuenta de Flow",
      descripcion: "Para cobrar en tu tienda con tu propia cuenta.",
      accion: (
        <Button
          size="xs"
          variant="light"
          component={Link}
          href="/admin/configuracion"
          rightSection={<IconArrowRight className="size-3.5" />}
        >
          Configurar
        </Button>
      ),
    },
    {
      cumplido: requisitos.producto.cumplido,
      titulo: "Publica al menos un producto",
      descripcion: "Un producto activo con su PDF subido.",
      accion: (
        <Button
          size="xs"
          variant="light"
          component={Link}
          href="/admin/productos"
          rightSection={<IconArrowRight className="size-3.5" />}
        >
          Ir a productos
        </Button>
      ),
    },
  ];

  // El requisito de bases solo se muestra si hay un sorteo activo (ADR-0008).
  if (requisitos.bases.aplica) {
    items.push({
      cumplido: requisitos.bases.cumplido,
      titulo: "Carga las bases de tu sorteo",
      descripcion: "Tu sorteo está activo: sus bases son obligatorias.",
      accion: (
        <Button
          size="xs"
          variant="light"
          component={Link}
          href="/admin/configuracion"
          rightSection={<IconArrowRight className="size-3.5" />}
        >
          Cargar bases
        </Button>
      ),
    });
  }

  return (
    <>
      <Card withBorder padding="lg" radius="md">
        <div>
          <Text fw={600}>Publica tu tienda</Text>
          <Text size="sm" c="dimmed">
            Completa estos pasos para que tu tienda quede disponible y pueda
            vender.
          </Text>
        </div>

        <Stack gap={0} mt="md">
          {items.map((item, i) => (
            <div key={item.titulo}>
              {i > 0 && <Divider />}
              <FilaRequisito item={item} />
            </div>
          ))}
        </Stack>

        <Group mt="lg" justify="flex-end">
          <Button
            disabled={!puedePublicar}
            loading={publicar.isPending}
            onClick={() => publicar.mutate()}
            leftSection={<IconRosetteDiscountCheck className="size-4" />}
          >
            Publicar mi tienda
          </Button>
        </Group>
        {!puedePublicar && (
          <Text size="xs" c="dimmed" ta="right" mt={4}>
            Completa los pasos pendientes para poder publicar.
          </Text>
        )}
      </Card>

      <TosModal
        opened={tosOpen}
        onClose={tosHandlers.close}
        onAceptado={invalidar}
      />
    </>
  );
}
