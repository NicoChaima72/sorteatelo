import {
  Alert,
  Anchor,
  Button,
  Card,
  Divider,
  Group,
  Modal,
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
  IconCopy,
  IconExternalLink,
  IconRosetteDiscountCheck,
  IconWorld,
} from "@tabler/icons-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { ActivarPlanModal } from "~/components/admin/activar-plan-modal";
import { PanelCard } from "~/components/admin/panel-card";
import { abrirTienda, urlDeTienda } from "~/components/admin/url-tienda";
import { APP_CONFIG } from "~/config/app";
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
  const [planOpen, planHandlers] = useDisclosure(false);
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
    // El panel corre en el subdominio de ESTA tienda (ADR-0022): slug destino = slug actual.
    if (estado.data) abrirTienda(estado.data.slug, estado.data.slug);
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

  // Tienda publicada: tira COMPACTA (sin badge — el estado ya está en el PageHeader) que aprovecha
  // el ancho mostrando el LINK PÚBLICO copiable (lo primero que un Organizador quiere compartir) +
  // acciones a la derecha. Gramática del panel: `PanelCard` sin borde (§4), no `Card withBorder`.
  if (estadoTienda === "PUBLICADA") {
    const url = urlDeTienda(estado.data.slug, estado.data.slug);
    const display = url ? url.replace(/^https?:\/\//, "") : estado.data.slug;
    const copiarLink = async () => {
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        notifications.show({ message: "Link copiado.", color: "green" });
      } catch {
        notifications.show({
          message: "No pudimos copiar el link.",
          color: "red",
        });
      }
    };

    return (
      <PanelCard>
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group wrap="nowrap" gap="sm" align="center" className="min-w-0">
            <ThemeIcon variant="light" color="exito" radius="xl" size="lg">
              <IconCircleCheck className="size-5" stroke={1.75} />
            </ThemeIcon>
            <div className="min-w-0">
              <Text fw={600}>Tu tienda está publicada</Text>
              <Group gap={6} wrap="nowrap" className="min-w-0">
                <IconWorld
                  className="size-3.5 shrink-0"
                  stroke={1.75}
                  color="var(--mantine-color-dimmed)"
                />
                <Text
                  size="sm"
                  c="dimmed"
                  ff="monospace"
                  truncate
                  className="tabular-nums"
                >
                  {display}
                </Text>
              </Group>
            </div>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Button
              variant="light"
              size="xs"
              leftSection={<IconCopy className="size-3.5" />}
              onClick={copiarLink}
            >
              Copiar link
            </Button>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconExternalLink className="size-3.5" />}
              onClick={verTienda}
            >
              Ver mi tienda
            </Button>
            <Button
              variant="subtle"
              size="xs"
              color="red"
              loading={despublicar.isPending}
              onClick={confirmarDespublicar}
            >
              Despublicar
            </Button>
          </Group>
        </Group>
      </PanelCard>
    );
  }

  // Tienda suspendida: sin acciones de publicación.
  if (estadoTienda === "SUSPENDIDA") {
    return (
      <Alert
        variant="light"
        color="red"
        icon={<IconAlertTriangle className="size-5" />}
        title="Tu tienda está suspendida"
      >
        <Text size="sm">
          Mientras esté suspendida no aparece publicada y no puede vender.{" "}
          <Anchor
            size="sm"
            href={`mailto:${APP_CONFIG.soporteEmail}`}
            underline="always"
          >
            Escríbele al soporte de la plataforma
          </Anchor>{" "}
          para reactivarla.
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
      // "con su PDF subido" hasta productos-tipos-digitales F04: el requisito del gate dejó de ser
      // la columna `pdfPath` y pasó a "≥1 archivo entregable" de cualquier tipo de la allowlist. El
      // copy tiene que decir lo que el gate realmente exige, o el checklist manda a subir un PDF a
      // quien vende stickers.
      descripcion: "Un producto activo con su archivo subido.",
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

  // El requisito de bases solo se muestra si hay un sorteo activo (ADR-0008). Desde
  // admin-bases-pdf F03 (D2/D3) las bases son el PDF del SORTEO, así que el ítem manda al Sorteo,
  // no a Configuración (donde el textarea legacy ya no existe).
  if (requisitos.bases.aplica) {
    items.push({
      cumplido: requisitos.bases.cumplido,
      titulo: "Sube las bases de tu sorteo",
      descripcion: "Tu sorteo está activo: su PDF de bases es obligatorio.",
      accion: (
        <Button
          size="xs"
          variant="light"
          component={Link}
          href="/admin/sorteo"
          rightSection={<IconArrowRight className="size-3.5" />}
        >
          Ir al sorteo
        </Button>
      ),
    });
  }

  // Facturación de la plataforma (F03/D12, ADR-0026): ÚLTIMO ítem del checklist a propósito — el
  // compromiso económico se pide recién cuando el resto está listo, y el orden espeja el de
  // `mensajeRequisitoFaltante` en el gate server-side. Una tienda exenta lo ve cumplido con la
  // etiqueta de cortesía, sin pasar nunca por la tarjeta (D8).
  items.push({
    cumplido: requisitos.facturacion.cumplido,
    titulo: requisitos.facturacion.exenta
      ? "Tu plan es de cortesía"
      : "Activa tu plan",
    descripcion: requisitos.facturacion.exenta
      ? "Tu tienda no paga mensualidad."
      : "El plan corre cuando publicas, no antes.",
    accion: (
      <Button size="xs" variant="light" onClick={planHandlers.open}>
        Ver el precio
      </Button>
    ),
  });

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

      <ActivarPlanModal opened={planOpen} onClose={planHandlers.close} />
    </>
  );
}
