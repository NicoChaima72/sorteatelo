import {
  Alert,
  Anchor,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconMail } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { clp } from "~/lib/formato";
import {
  getPropsPaginaComprador,
  type PropsStorefront,
} from "~/server/storefront/getStorefrontProps";
import { api } from "~/utils/api";

/**
 * Checkout del storefront (F04). Página EXCLUSIVA del Comprador (fuera de storefront ⇒ notFound).
 * Muestra el resumen del carrito y pide el CORREO (identidad del comprador, ADR-0004 — sin cuenta),
 * lo confirma antes de pagar (mitigación del riesgo de correo mal tipeado, ADR-0004), y dispara
 * `iniciarCheckout` → redirect a Flow. El `tenantId` y la URL de retorno se resuelven SERVER-SIDE
 * (I1/D6); el cliente NO manda montos ni tenantId. I4: solo muestra precios por ítem con `clp`, no
 * suma un total en el cliente — el total lo calcula el server y lo muestra Flow.
 */
export const getServerSideProps: GetServerSideProps<PropsStorefront> = async (
  ctx,
) => getPropsPaginaComprador(ctx);

export default function CheckoutPage({
  tenantBranding,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <StorefrontLayout branding={tenantBranding}>
      <ResumenYPago />
    </StorefrontLayout>
  );
}

function ResumenYPago() {
  const { items, quitar, vaciar, cantidad } = useCarrito();

  const form = useForm({
    initialValues: { email: "" },
    validate: {
      email: (v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
          ? null
          : "Ingresa un correo válido.",
    },
  });

  const iniciar = api.checkout.iniciarCheckout.useMutation({
    onSuccess: ({ redirectUrl }) => {
      vaciar();
      window.location.href = redirectUrl; // redirect a Flow (con la cuenta del Organizador)
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  if (cantidad === 0) {
    return (
      <Stack align="center" py="xl" gap="sm">
        <Title order={2} fz="lg">
          Tu carrito está vacío
        </Title>
        <Text size="sm" c="dimmed" ta="center">
          Agrega productos para continuar con la compra.
        </Text>
        <Anchor component={Link} href="/" size="sm">
          Ver la tienda
        </Anchor>
      </Stack>
    );
  }

  const submit = form.onSubmit((valores) =>
    iniciar.mutate({
      email: valores.email.trim(),
      productIds: items.map((i) => i.id),
    }),
  );

  return (
    <Stack gap="lg" maw={560}>
      <Title order={1} fz={{ base: 24, sm: 30 }}>
        Finalizar compra
      </Title>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          {items.map((item) => (
            <Group key={item.id} justify="space-between" wrap="nowrap" gap="sm">
              <Text size="sm" className="min-w-0" truncate>
                {item.titulo}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={500} className="tabular-nums">
                  {clp(item.precio)}
                </Text>
                <Anchor
                  size="xs"
                  c="dimmed"
                  onClick={() => quitar(item.id)}
                  component="button"
                  type="button"
                >
                  Quitar
                </Anchor>
              </Group>
            </Group>
          ))}
          <Divider />
          <Text size="xs" c="dimmed">
            {cantidad} {cantidad === 1 ? "producto" : "productos"}. El total a
            pagar se calcula de forma segura y lo confirmas en el siguiente paso.
          </Text>
        </Stack>
      </Card>

      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="Tu correo"
            description="Te enviaremos la descarga a este correo. Revísalo bien: es tu única forma de recibir el producto."
            placeholder="tucorreo@ejemplo.cl"
            leftSection={<IconMail className="size-4" />}
            type="email"
            {...form.getInputProps("email")}
          />

          <Alert variant="light" color="gray" p="sm">
            <Text size="xs">
              Pagas de forma segura en Flow. No creamos una cuenta: tu correo es
              tu identidad para recibir la descarga.
            </Text>
          </Alert>

          <Button type="submit" size="md" loading={iniciar.isPending} fullWidth>
            Ir a pagar
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
