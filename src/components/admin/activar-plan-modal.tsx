import {
  Alert,
  Button,
  Divider,
  Group,
  List,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCreditCard,
  IconInfoCircle,
  IconLock,
} from "@tabler/icons-react";

import { clp } from "~/lib/formato";
import { api } from "~/utils/api";

/**
 * Modal del paso «Activa tu plan» del checklist de publicación (F03/D12, ADR-0026).
 *
 * El precio SALE DEL SERVER (`getEstadoPlan.montoQueCorresponde`, I4): esta pantalla solo lo imprime
 * con `clp()`. No hay ningún input de plan ni de monto — a propósito. El código de cupón es lo único
 * que el Organizador escribe, y se valida server-side (un código inválido nunca llega a Flow).
 *
 * Al confirmar, el server crea el customer de Flow, reserva el canje y devuelve la URL de registro
 * de tarjeta: el navegador se va a Flow y vuelve a `/admin/plan/retorno`, donde el registro se
 * confirma SERVER-SIDE (I3) y nace la suscripción.
 */
export function ActivarPlanModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const plan = api.panel.getEstadoPlan.useQuery(undefined, {
    enabled: opened,
    retry: false,
  });

  const form = useForm({ initialValues: { codigo: "" } });

  const iniciar = api.panel.iniciarRegistroTarjeta.useMutation({
    onSuccess: ({ redirectUrl }) => {
      // Se sale del SPA a propósito: el registro de tarjeta ocurre en el dominio de Flow.
      window.location.assign(redirectUrl);
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const enviar = form.onSubmit(({ codigo }) =>
    iniciar.mutate({ codigo: codigo.trim() || undefined }),
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Activa tu plan" size="md">
      {plan.isLoading ? (
        <Stack gap="sm">
          <Skeleton height={72} />
          <Skeleton height={36} />
          <Skeleton height={36} width="60%" />
        </Stack>
      ) : plan.isError || !plan.data ? (
        <Stack align="center" py="lg" gap="sm">
          <Text size="sm" c="red">
            No pudimos cargar el precio de tu plan.
          </Text>
          <Button variant="default" size="xs" onClick={() => void plan.refetch()}>
            Reintentar
          </Button>
        </Stack>
      ) : (
        <form onSubmit={enviar}>
          <Stack gap="md">
            {/* Inset borderless (gramática del panel §4): el precio es el dato protagonista. */}
            <Paper
              radius="md"
              p="md"
              bg="var(--mantine-color-default-hover)"
            >
              <Group justify="space-between" align="baseline" wrap="nowrap">
                <Text size="sm" c="dimmed">
                  {plan.data.esTiendaAdicional
                    ? "Tienda adicional"
                    : "Plan de tu tienda"}
                </Text>
                <Text fw={700} size="xl" className="tabular-nums">
                  {clp(plan.data.montoQueCorresponde)}
                  <Text span size="sm" fw={500} c="dimmed">
                    {" "}
                    /mes
                  </Text>
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                IVA incluido. Sin comisión por venta.
              </Text>
            </Paper>

            {plan.data.esTiendaAdicional && (
              // `gray`, no `exito`: design.md §2 reserva el teal para «cumplido» (orden pagada,
              // tienda publicada). Esto es un aviso informativo, y el precedente de los avisos
              // informativos del panel es `crear-tienda.tsx`.
              <Alert
                variant="light"
                color="gray"
                icon={<IconInfoCircle className="size-4" />}
              >
                <Text size="sm">
                  Es tu segunda tienda en adelante: va a mitad de precio.
                </Text>
              </Alert>
            )}

            <List size="sm" spacing={4} c="dimmed">
              <List.Item>El plan corre desde que publicas, no antes.</List.Item>
              <List.Item>Se renueva cada mes con tu tarjeta.</List.Item>
              <List.Item>Puedes cancelarlo cuando quieras.</List.Item>
            </List>

            <Divider />

            <TextInput
              label="¿Tienes un código? (opcional)"
              placeholder="Por ejemplo, ARMY2026"
              autoComplete="off"
              {...form.getInputProps("codigo")}
            />

            <Group gap={6} wrap="nowrap">
              <IconLock
                className="size-3.5 shrink-0"
                stroke={1.75}
                color="var(--mantine-color-dimmed)"
              />
              <Text size="xs" c="dimmed">
                Tu tarjeta la guarda Flow, no Sortéatelo.
              </Text>
            </Group>

            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={iniciar.isPending}
                leftSection={<IconCreditCard className="size-4" />}
              >
                Continuar
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
