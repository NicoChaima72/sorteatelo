import { Button, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconMailCheck } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import {
  getPropsPaginaComprador,
  type PropsStorefront,
} from "~/server/storefront/getStorefrontProps";

/**
 * Retorno del checkout de Flow (F04/D6), con la marca de la Tienda. Página EXCLUSIVA del
 * Comprador (fuera de storefront ⇒ notFound). Es a donde Flow devuelve el navegador tras el pago.
 *
 * I6/ADR-0001: el redirect del navegador NO es prueba de pago ni marca la orden. La confirmación
 * real es server-side en el webhook (`/api/webhooks/flow`) contra `payment/getStatus`, y la entrega
 * llega por correo (DownloadGrant, ADR-0002/0010). Esta página SOLO informa — no linkea el PDF (I7).
 */
export const getServerSideProps: GetServerSideProps<PropsStorefront> = async (
  ctx,
) => getPropsPaginaComprador(ctx);

export default function RetornoPage({
  tenantBranding,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <StorefrontLayout branding={tenantBranding}>
      <Stack align="center" py="xl" gap="md" maw={480} mx="auto">
        <ThemeIcon size={56} radius="xl" variant="light">
          <IconMailCheck className="size-7" stroke={1.75} />
        </ThemeIcon>
        <Title order={1} fz="xl" ta="center">
          ¡Gracias por tu compra!
        </Title>
        <Text c="dimmed" ta="center">
          Estamos confirmando tu pago. Apenas quede confirmado, te llega un
          correo con el enlace para descargar tu producto. Si no lo ves en unos
          minutos, revisa tu carpeta de spam.
        </Text>
        <Button component={Link} href="/" variant="default" mt="sm">
          Volver a la tienda
        </Button>
      </Stack>
    </StorefrontLayout>
  );
}
