import { Anchor, Box, Container, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Head from "next/head";
import Link from "next/link";
import { type ReactNode } from "react";

import { CarritoProvider } from "~/components/storefront/carrito";
import {
  BotonCarrito,
  CarritoDrawer,
} from "~/components/storefront/carrito-ui";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Shell del storefront del Comprador (F01), mobile-first REAL — el público es mayoritariamente
 * mobile (design.md §4). La marca visible es la de la TIENDA (logo/nombre/color del Organizador)
 * sobre el theme base de plataforma tematizado en `_app` (ADR-0011). La marca de la PLATAFORMA
 * sigue PENDIENTE: acá NO se inventa (I9) — el footer lleva una nota neutral sin nombre de marca.
 *
 * Envuelve todo en el `CarritoProvider` namespaced por slug (F04/D5) y monta el botón + drawer del
 * carrito: cualquier página del storefront (catálogo, detalle, checkout) hereda el carrito y su UI.
 */
export function StorefrontLayout({
  branding,
  children,
}: {
  branding: TenantBranding;
  children: ReactNode;
}) {
  const [drawerAbierto, drawer] = useDisclosure(false);

  return (
    <CarritoProvider slug={branding.slug}>
      <Head>
        <title>{branding.nombre}</title>
        <meta
          name="description"
          content={branding.descripcion ?? branding.nombre}
        />
      </Head>

      <div className="flex min-h-screen flex-col">
        <Box
          component="header"
          pos="sticky"
          top={0}
          bg="var(--mantine-color-body)"
          style={{
            zIndex: 100,
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Container size="md" py="sm" px={{ base: "md", lg: "xl" }}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Anchor
                component={Link}
                href="/"
                underline="never"
                c="inherit"
                className="min-w-0"
              >
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={branding.logoUrl}
                    alt={branding.nombre}
                    style={{ height: 36, width: "auto", display: "block" }}
                  />
                ) : (
                  <Text fw={700} fz="lg" truncate>
                    {branding.nombre}
                  </Text>
                )}
              </Anchor>
              <BotonCarrito onOpen={drawer.open} />
            </Group>
          </Container>
        </Box>

        <Box component="main" className="flex-1">
          <Container size="md" py="xl" px={{ base: "md", lg: "xl" }}>
            {children}
          </Container>
        </Box>

        <Box
          component="footer"
          mt="xl"
          style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
        >
          <Container size="md" py="lg" px={{ base: "md", lg: "xl" }}>
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                {branding.nombre}
              </Text>
              <Text size="xs" c="dimmed">
                Esta tienda es operada de forma independiente por su responsable,
                que responde por los productos y las promociones que ofrece.
              </Text>
            </Stack>
          </Container>
        </Box>
      </div>

      <CarritoDrawer opened={drawerAbierto} onClose={drawer.close} />
    </CarritoProvider>
  );
}
