import { ActionIcon, Anchor, Box, Container, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconMail,
} from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { type CSSProperties, type ReactNode } from "react";

import { AccesoPlataforma } from "~/components/storefront/acceso-plataforma";
import { BannerEditarTienda } from "~/components/storefront/banner-editar-tienda";
import { CarritoProvider } from "~/components/storefront/carrito";
import {
  BotonCarrito,
  CarritoDrawer,
} from "~/components/storefront/carrito-ui";
import { CountdownChip } from "~/components/storefront/countdown-chip";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Shell del storefront del Comprador (plantilla-rica F04), mobile-first REAL — el público es
 * mayoritariamente mobile (design.md §4/§5.1). La marca visible es la de la TIENDA (logo/nombre/
 * color/redes del Organizador) sobre el theme base de plataforma tematizado en `_app` (ADR-0011).
 * La marca de la PLATAFORMA sigue PENDIENTE: acá NO se inventa (I7) — el footer lleva una
 * atribución NEUTRAL sin nombre de marca de plataforma (D8/design.md §5.1 pto 7).
 *
 * Header sticky (con blur sutil) = logo/nombre + nav de anclas (desktop) + chip de countdown del
 * sorteo (D9) + carrito. Footer = redes (ocultables), contacto, enlace a bases y atribución neutral.
 * Envuelve todo en el `CarritoProvider` namespaced por slug (ADR-0004).
 */
export function StorefrontLayout({
  branding,
  estiloShell,
  children,
}: {
  branding: TenantBranding;
  /** Fondo del shell derivado del TemaPagina (catálogo-v2 F02); ausente ⇒ fondo por defecto. */
  estiloShell?: CSSProperties;
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

      <div className="flex min-h-screen flex-col" style={estiloShell}>
        {/* Banner "Editar mi tienda" (F09): chrome de plataforma, monta post-hidratación (no toca el SSR). */}
        <BannerEditarTienda />
        <Header branding={branding} onAbrirCarrito={drawer.open} />

        <Box component="main" className="flex-1">
          {children}
        </Box>

        <Footer branding={branding} />
      </div>

      <CarritoDrawer opened={drawerAbierto} onClose={drawer.close} />
    </CarritoProvider>
  );
}

function Header({
  branding,
  onAbrirCarrito,
}: {
  branding: TenantBranding;
  onAbrirCarrito: () => void;
}) {
  const sorteo = useSorteoActivo();
  const haySorteo = !!sorteo.data;

  return (
    <Box
      component="header"
      pos="sticky"
      top={0}
      style={{
        zIndex: 100,
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background:
          "color-mix(in srgb, var(--mantine-color-body) 82%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <Container size="lg" py="sm" px={{ base: "md", lg: "xl" }}>
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

          {/* Nav de anclas — solo desktop (mobile-first: en móvil el chrome se aprieta). */}
          <Group gap="lg" visibleFrom="sm" wrap="nowrap">
            <NavAncla href="#catalogo">Catálogo</NavAncla>
            {haySorteo && <NavAncla href="#sorteo">Sorteo</NavAncla>}
            <NavAncla href="#como-funciona">Cómo funciona</NavAncla>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <CountdownChip />
            <BotonCarrito onOpen={onAbrirCarrito} />
          </Group>
        </Group>
      </Container>
    </Box>
  );
}

function NavAncla({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} c="dimmed" fw={500} size="sm" underline="never">
      {children}
    </Anchor>
  );
}

function Footer({ branding }: { branding: TenantBranding }) {
  const sorteo = useSorteoActivo();
  const basesUrl = sorteo.data?.basesUrl ?? null;

  const redes = [
    { url: branding.instagramUrl, icon: IconBrandInstagram, label: "Instagram" },
    { url: branding.tiktokUrl, icon: IconBrandTiktok, label: "TikTok" },
    { url: branding.whatsappUrl, icon: IconBrandWhatsapp, label: "WhatsApp" },
  ].filter((r): r is { url: string; icon: typeof IconBrandInstagram; label: string } =>
    !!r.url,
  );

  return (
    <Box
      component="footer"
      mt="xl"
      style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
    >
      <Container size="lg" py="xl" px={{ base: "md", lg: "xl" }}>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
            <Stack gap={4} className="min-w-0">
              <Text fw={700} fz="lg">
                {branding.nombre}
              </Text>
              {branding.contactoEmail && (
                <Anchor
                  href={`mailto:${branding.contactoEmail}`}
                  c="dimmed"
                  size="sm"
                >
                  <Group gap={6} wrap="nowrap">
                    <IconMail className="size-4" stroke={1.75} />
                    {branding.contactoEmail}
                  </Group>
                </Anchor>
              )}
              {sorteo.data && (
                <Anchor
                  href={basesUrl ?? "#sorteo"}
                  target={basesUrl ? "_blank" : undefined}
                  rel={basesUrl ? "noreferrer" : undefined}
                  c="dimmed"
                  size="sm"
                >
                  Bases del sorteo
                </Anchor>
              )}
            </Stack>

            {redes.length > 0 && (
              <Group gap="xs">
                {redes.map(({ url, icon: Icon, label }) => (
                  <ActionIcon
                    key={label}
                    component="a"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    variant="light"
                    size="lg"
                    radius="xl"
                    aria-label={label}
                  >
                    <Icon className="size-5" stroke={1.75} />
                  </ActionIcon>
                ))}
              </Group>
            )}
          </Group>

          <Group
            justify="space-between"
            align="center"
            gap="md"
            wrap="wrap"
            pt="md"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
          >
            <Text size="xs" c="dimmed" maw={520}>
              Esta tienda es operada de forma independiente por su responsable, que
              responde por los productos y las promociones que ofrece.
            </Text>
            {/* Puerta de entrada al login/panel de plataforma (F09b): chrome neutro, post-hidratación. */}
            <AccesoPlataforma slug={branding.slug} />
          </Group>
        </Stack>
      </Container>
    </Box>
  );
}
