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

import { AccesoSesion } from "~/components/storefront/acceso-sesion";
import { BannerEditarTienda } from "~/components/storefront/banner-editar-tienda";
import { CarritoProvider } from "~/components/storefront/carrito";
import {
  BotonCarrito,
  CarritoDrawer,
} from "~/components/storefront/carrito-ui";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { hrefMenuItem, type Chrome, type FondoHeader } from "~/lib/pagebuilder/chrome";
import { type NavItem } from "~/lib/pagebuilder/nav";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * CSS del fondo del header según el chrome (Tanda 3 F06/D10). `vidrio` (default/null) = el blur
 * translúcido ACTUAL (byte-idéntico, I-U8); `superficie` = sólido del body; `transparente` = sin fondo
 * (overlay sobre hero). Cero hex (I-A). `transparenteSobreHero` fuerza transparente sin borde.
 */
function estiloFondoHeader(
  fondo: FondoHeader,
  transparenteSobreHero: boolean,
  colorPagina?: string,
): CSSProperties {
  if (transparenteSobreHero || fondo === "transparente") {
    return { background: "transparent" };
  }
  if (fondo === "pagina") {
    // El header se FUNDE con el fondo de la página (mismo color) + un borde inferior sutil que lo delinea
    // al hacer scroll — para tiendas con un `fondoPagina` distinto del body (ej. morado). Fallback al body.
    return {
      background: colorPagina ?? "var(--mantine-color-body)",
      borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-white) 10%, transparent)",
    };
  }
  if (fondo === "superficie") {
    return {
      background: "var(--mantine-color-body)",
      borderBottom: "1px solid var(--mantine-color-default-border)",
    };
  }
  // vidrio (default) = el header actual.
  return {
    background: "color-mix(in srgb, var(--mantine-color-body) 82%, transparent)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    borderBottom: "1px solid var(--mantine-color-default-border)",
  };
}

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
  estiloLienzo,
  columnaMaxWidth,
  navItems,
  avisoSobreNav,
  chrome,
  colorPagina,
  children,
}: {
  branding: TenantBranding;
  /** Fondo del shell derivado del TemaPagina (catálogo-v2 F02); ausente ⇒ fondo por defecto. */
  estiloShell?: CSSProperties;
  /** Color SÓLIDO del `fondoPagina` (para el header `fondo:"pagina"` que se funde con el fondo). */
  colorPagina?: string;
  /** Chrome GLOBAL del tenant (Tanda 3 F06/D10); `null`/ausente ⇒ header/footer actuales (byte-idéntico). */
  chrome?: Chrome | null;
  /** Fondo del LIENZO EXTERIOR (Tanda 2 F15): el área fuera de la columna estrecha (un pelo más oscura que
   * la columna). Solo se usa con `columnaMaxWidth` presente (anchoContenido:"estrecho"). */
  estiloLienzo?: CSSProperties;
  /** Ancho máximo (px) de la columna de contenido (Tanda 2 F15). Presente ⇒ el shell centra header+main+
   * footer en una columna de esa medida (editorial); ausente ⇒ ancho completo (comportamiento actual, I-H). */
  columnaMaxWidth?: number | null;
  /** Items del nav derivados del documento (F05/D8); vacío/ausente ⇒ nav hardcodeado actual (I-H). */
  navItems?: NavItem[];
  /** Cinta `aviso_barra` con `posicion:"sobre_nav"` (F13): se pinta ANTES del header, en el tope
   * absoluto (fuera de `<main>`) ⇒ queda SOBRE el nav. Ausente ⇒ nada (el default `bajo_nav` va en main). */
  avisoSobreNav?: ReactNode;
  children: ReactNode;
}) {
  const [drawerAbierto, drawer] = useDisclosure(false);

  // Núcleo del shell (banner + cinta + header + main + footer), común a ambos layouts.
  const nucleo = (
    <>
      {/* Banner "Editar mi tienda" (F09): chrome de plataforma, monta post-hidratación (no toca el SSR). */}
      <BannerEditarTienda slug={branding.slug} />
      {/* Cinta SOBRE el nav (F13): en el tope absoluto, antes del header sticky. Al hacer scroll la cinta
          se va y el header queda pegado a top:0 (el ticker "sobre el nav" del mockup). */}
      {avisoSobreNav}
      <Header branding={branding} navItems={navItems} chrome={chrome} colorPagina={colorPagina} onAbrirCarrito={drawer.open} />

      <Box component="main" className="flex-1">
        {children}
      </Box>

      <Footer branding={branding} chrome={chrome} />
    </>
  );

  return (
    <CarritoProvider slug={branding.slug}>
      <Head>
        <title>{branding.nombre}</title>
        <meta
          name="description"
          content={branding.descripcion ?? branding.nombre}
        />
      </Head>

      {columnaMaxWidth ? (
        // Columna estrecha editorial (Tanda 2 F15): el lienzo exterior (más oscuro) enmarca una columna
        // centrada (marfil) con header+main+footer. La columna lleva `estiloShell` + una sombra suave (la
        // "columna sobre crema" del prototipo). Cero hex: la sombra es un `color-mix` de token (I-A).
        <div className="flex min-h-screen w-full flex-col items-center" style={estiloLienzo}>
          <Box
            w="100%"
            className="flex flex-1 flex-col"
            style={{
              maxWidth: columnaMaxWidth,
              ...estiloShell,
              boxShadow:
                "0 0 60px -20px color-mix(in srgb, var(--mantine-color-black) 22%, transparent)",
            }}
          >
            {nucleo}
          </Box>
        </div>
      ) : (
        <div className="flex min-h-screen flex-col" style={estiloShell}>
          {nucleo}
        </div>
      )}

      <CarritoDrawer opened={drawerAbierto} onClose={drawer.close} />
    </CarritoProvider>
  );
}

function Header({
  branding,
  navItems,
  chrome,
  colorPagina,
  onAbrirCarrito,
}: {
  branding: TenantBranding;
  navItems?: NavItem[];
  chrome?: Chrome | null;
  colorPagina?: string;
  onAbrirCarrito: () => void;
}) {
  const sorteo = useSorteoActivo();
  const haySorteo = !!sorteo.data;
  // Nav derivado del documento (F05/D8) si alguna sección se marcó `nav.incluir`; si NO (array vacío o
  // ausente), el nav cae al hardcodeado actual — byte-idéntico al de antes de F05 (I-H).
  const derivado = navItems && navItems.length > 0;
  // Chrome (Tanda 3 F06/D10): fondo + sticky. Ausente/null ⇒ defaults = header actual (byte-idéntico I-U8).
  // NOTA (REVISABLE): `layout:"centro"` aún no cambia el DOM (centrarlo desalinea los pinned carrito/sesión;
  // pide una grilla de 3 columnas) ⇒ por ahora renderiza como `izquierda`. El schema ya lo soporta.
  const h = chrome?.header;
  const estiloFondo = estiloFondoHeader(h?.fondo ?? "vidrio", h?.transparenteSobreHero ?? false, colorPagina);
  const esFijo = (h?.sticky ?? "fijo") === "fijo";

  return (
    <Box
      component="header"
      pos={esFijo ? "sticky" : "relative"}
      top={esFijo ? 0 : undefined}
      style={{
        zIndex: 100,
        ...estiloFondo,
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

          {/* Nav de anclas — solo desktop (mobile-first: en móvil el chrome se aprieta). Derivado del
              documento (F05/D8) o, sin config, el hardcodeado actual (Catálogo/Sorteo/Cómo funciona). */}
          <Group gap="lg" visibleFrom="sm" wrap="nowrap">
            {derivado ? (
              navItems.map((item) => (
                <NavAncla key={item.href + item.label} href={item.href}>
                  {item.label}
                </NavAncla>
              ))
            ) : (
              <>
                <NavAncla href="#catalogo">Catálogo</NavAncla>
                {haySorteo && <NavAncla href="#sorteo">Sorteo</NavAncla>}
                <NavAncla href="#como-funciona">Cómo funciona</NavAncla>
              </>
            )}
          </Group>

          <Group gap="sm" wrap="nowrap">
            {/* Sin CountdownChip en el header (usuario 2026-07-26): la urgencia vive en la página
                (widget `urgencia_countdown`); el chip duplicaba el mensaje. `aviso_barra` conserva
                el suyo (opt-in del Organizador). */}
            {/* Acción de sesión (F09c): junto al carrito, chrome neutro, post-hidratación (I5). */}
            <AccesoSesion slug={branding.slug} />
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

function Footer({ branding, chrome }: { branding: TenantBranding; chrome?: Chrome | null }) {
  const sorteo = useSorteoActivo();
  // Chrome footer (Tanda 3 F06/D10): `texto` editorial + `links` de menú. La atribución neutral y el
  // enlace a Bases (abajo) son PINNED (I-U2/ADR-0008): se renderizan SIEMPRE, no salen del chrome.
  const chromeLinks = chrome?.footer.links ?? [];
  const chromeTexto = chrome?.footer.texto;

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
              {/* Enlace PINNED a las bases (ADR-0008). Desde admin-bases-pdf F04/D4/D5 apunta SIEMPRE
                  a `/bases` —la página con el PDF del sorteo ACTIVO—, no a la URL externa del raffle
                  ni al ancla `#sorteo`. Es navegación interna: sin `target="_blank"`. */}
              {sorteo.data && (
                <Anchor href="/bases" c="dimmed" size="sm">
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

          {/* Links de menú del chrome (Tanda 3 F06/D10): fila de enlaces configurables. NO son pinned. */}
          {chromeLinks.length > 0 && (
            <Group gap="lg" wrap="wrap">
              {chromeLinks.map((item, i) => (
                <Anchor
                  key={i}
                  href={hrefMenuItem(item.destino)}
                  {...(item.destino.tipo === "url"
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                  c="dimmed"
                  size="sm"
                  underline="hover"
                >
                  {item.etiqueta}
                </Anchor>
              ))}
            </Group>
          )}

          <Group
            justify="space-between"
            align="center"
            gap="md"
            wrap="wrap"
            pt="md"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
          >
            {/* `texto` del chrome (opcional) + la atribución neutral PINNED (I-U2/ADR-0008): la atribución
                se muestra SIEMPRE (el `texto` es un extra ANTES de ella, no la reemplaza). Sin `texto`
                (chrome null) ⇒ la atribución sola, byte-idéntica al footer actual (I-U8). */}
            {chromeTexto ? (
              <div style={{ maxWidth: 520 }}>
                <Text size="sm" mb={4}>
                  {chromeTexto}
                </Text>
                <Text size="xs" c="dimmed">
                  Esta tienda es operada de forma independiente por su responsable, que
                  responde por los productos y las promociones que ofrece.
                </Text>
              </div>
            ) : (
              <Text size="xs" c="dimmed" maw={520}>
                Esta tienda es operada de forma independiente por su responsable, que
                responde por los productos y las promociones que ofrece.
              </Text>
            )}
            {/* La puerta de entrada a login/panel/editor vive AHORA en el header (F09c): el usuario vetó
                el footer-only de F09b. El footer conserva solo la atribución neutral de plataforma. */}
          </Group>
        </Stack>
      </Container>
    </Box>
  );
}
