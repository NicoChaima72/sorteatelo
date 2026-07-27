import {
  Alert,
  Anchor,
  Button,
  Card,
  Container,
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
import {
  type GetServerSideProps,
  type InferGetServerSidePropsType,
} from "next";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { CamposCheckout } from "~/components/storefront/campos-checkout";
import {
  erroresDeCampos,
  respuestasParaEnviar,
  valoresInicialesDeCampos,
  type ValoresCheckout,
} from "~/components/storefront/respuestas-checkout";
import { StepperCantidad } from "~/components/storefront/stepper-cantidad";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { clp } from "~/lib/formato";
import { type CampoDelCheckout } from "~/server/domain/camposCheckout/camposActivos";
import {
  getPropsCheckout,
  type PropsCheckout,
} from "~/server/storefront/getStorefrontProps";
import { estiloHeredadoDeTema } from "~/styles/estiloSeccion";
import { api } from "~/utils/api";

/**
 * Checkout del storefront (F04). Página EXCLUSIVA del Comprador (fuera de storefront ⇒ notFound).
 * Muestra el resumen del carrito y pide el CORREO (identidad del comprador, ADR-0004 — sin cuenta),
 * lo confirma antes de pagar (mitigación del riesgo de correo mal tipeado, ADR-0004), y dispara
 * `iniciarCheckout` → redirect a Flow. El `tenantId` y la URL de retorno se resuelven SERVER-SIDE
 * (I1/D6); el cliente NO manda montos ni tenantId. I4: solo muestra precios por ítem con `clp`, no
 * suma un total en el cliente — el total lo calcula el server y lo muestra Flow.
 *
 * Los datos ADICIONALES que pide la Tienda (Campos de checkout, F04) llegan también por SSR: el
 * form los renderiza bajo el correo, en el orden que fijó el Organizador. Tienda sin campos ⇒ este
 * checkout es el de siempre (I9).
 */
export const getServerSideProps: GetServerSideProps<PropsCheckout> = async (
  ctx,
) => getPropsCheckout(ctx);

export default function CheckoutPage({
  tenantBranding,
  temaPagina,
  chrome,
  navItems,
  campos,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Tema MÍNIMO heredado de la Tienda (tema-paginas F02): el fondo de página. El radio, el par
  // tipográfico y el modo claro/oscuro los aplica `_app` desde el mismo `temaPagina`. Con la Tienda en
  // tema default esto es `undefined`/`undefined` ⇒ el shell sale sin `style=`, byte-idéntico a antes (I6).
  // El chrome + navItems (follow-up del navbar) hacen que el header sea el MISMO que el de la home.
  const { estiloShell, colorPagina } = estiloHeredadoDeTema(temaPagina);

  return (
    <StorefrontLayout
      branding={tenantBranding}
      estiloShell={estiloShell}
      colorPagina={colorPagina}
      chrome={chrome}
      navItems={navItems}
    >
      <Container size="lg" py="xl" px={{ base: "md", lg: "xl" }}>
        <ResumenYPago campos={campos} />
      </Container>
    </StorefrontLayout>
  );
}

function ResumenYPago({ campos }: { campos: CampoDelCheckout[] }) {
  const { items, quitar, vaciar, cantidad } = useCarrito();

  const form = useForm<ValoresCheckout>({
    initialValues: { email: "", respuestas: valoresInicialesDeCampos(campos) },
    // `validate` como FUNCIÓN (no como objeto por campo) porque las claves de `respuestas` son
    // dinámicas: las define el Organizador, no este archivo. Lo de los campos sale del espejo puro
    // (`erroresDeCampos`); la verdad la pone el server en su `$tx` (I3).
    validate: (valores) => {
      const errores: Record<string, string | null> = {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email.trim())
          ? null
          : "Ingresa un correo válido.",
      };
      for (const [clave, mensaje] of Object.entries(
        erroresDeCampos(campos, valores.respuestas),
      )) {
        errores[`respuestas.${clave}`] = mensaje;
      }
      return errores;
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

  // Las respuestas viajan como lista `{clave, valor}` y NADA más (F05): ni el tipo, ni la etiqueta,
  // ni qué era obligatorio. Todo eso lo relee el server de la definición vigente dentro de su `$tx`
  // y es ahí donde se decide qué se guarda (I3). Este form es el espejo, no la verdad.
  const submit = form.onSubmit((valores) =>
    iniciar.mutate({
      email: valores.email.trim(),
      // El `packOptionId` viaja tal cual salió del selector (F07): es un ID, no un precio. El
      // server lo valida contra las opciones ACTIVAS de ese producto y relee el monto de la fila
      // vigente — si la opción se apagó o cambió mientras el carrito dormía, manda la DB (I4).
      items: items.map((i) => ({
        productId: i.id,
        cantidad: i.cantidad,
        ...(i.packOptionId ? { packOptionId: i.packOptionId } : {}),
      })),
      respuestas: respuestasParaEnviar(valores.respuestas),
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
              <div className="min-w-0">
                <Text size="sm" truncate>
                  {item.titulo}
                </Text>
                <Text size="xs" c="dimmed" className="tabular-nums">
                  {/*
                    En un sobre la "unidad" es UN PACK, así que "c/u" solo sería honesto diciendo
                    de qué pack se trata: el Comprador tiene que poder verificar en el resumen que
                    va a pagar el pack de 4 y no el de 1.
                  */}
                  {clp(item.precio)}{" "}
                  {item.unidadesPorPack
                    ? `por pack de ${item.unidadesPorPack}`
                    : "c/u"}
                </Text>
              </div>
              <Group gap="xs" wrap="nowrap">
                <StepperCantidad id={item.id} size="sm" />
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
            pagar (según las cantidades elegidas) se calcula de forma segura y
            lo confirmas en el siguiente paso.
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

          {/*
            Los campos de la Tienda van DESPUÉS del correo, siempre (I2): el correo es la identidad
            del Comprador y la vía de entrega del PDF, así que encabeza el form pase lo que pase.
          */}
          <CamposCheckout campos={campos} form={form} />

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
