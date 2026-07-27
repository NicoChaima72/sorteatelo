import { ActionIcon, Anchor, Box, Container, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconMail,
  IconTicket,
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
import { LucesAmbiente } from "~/components/storefront/luces-ambiente";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { hrefMenuItem, type Chrome, type FondoHeader } from "~/lib/pagebuilder/chrome";
import { type NavItem } from "~/lib/pagebuilder/nav";
import { type CapaDeLuces } from "~/styles/estiloSeccion";
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
 * Header sticky (con blur sutil) = logo/nombre + nav de anclas (desktop) + verificador de tickets +
 * carrito. Footer = redes (ocultables), contacto, enlaces a bases y al verificador, y atribución
 * neutral. Envuelve todo en el `CarritoProvider` namespaced por slug (ADR-0004).
 *
 * Los enlaces PINNED (`verificador-tickets` F04/D8, ADR-0008) los pone la PLATAFORMA alrededor de lo
 * configurable: no salen del chrome del Organizador y no hay input suyo que los quite.
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
  capaLuces,
  children,
}: {
  branding: TenantBranding;
  /** Fondo del shell derivado del TemaPagina (catálogo-v2 F02); ausente ⇒ fondo por defecto. */
  estiloShell?: CSSProperties;
  /**
   * Luces de ambiente ANIMADAS del shell (focos-animados F01), ya resueltas por `lucesDelShell`.
   * Ausente/`null` ⇒ ni capa ni `isolation` ⇒ el shell sale byte-idéntico al de hoy (I1). Las páginas
   * de PLATAFORMA nunca la pasan: su tema heredado fuerza `ambiente:"ninguno"` (I7).
   */
  capaLuces?: CapaDeLuces | null;
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

  // Contenedor de la capa de luces (F01/D3). Dos propiedades, cada una haciendo un trabajo distinto:
  // `position: relative` le da a la capa (`position:absolute; inset:0`) un bloque contenedor —sin esto
  // se mediría contra el viewport y no contra la tienda—, y `isolation: isolate` convierte al shell en
  // contexto de apilamiento, que es lo que deja al `z-index:-1` de la capa meterse ENTRE el fondo del
  // shell y su contenido en vez de irse detrás de todo. Se aplican SOLO si hay capa ⇒ una tienda sin
  // luces no recibe ni una propiedad CSS de más (I1).
  const estiloConLuces: CSSProperties | undefined = capaLuces
    ? { ...estiloShell, position: "relative", isolation: "isolate" }
    : estiloShell;

  // Núcleo del shell (banner + cinta + header + main + footer), común a ambos layouts.
  const nucleo = (
    <>
      {capaLuces && <LucesAmbiente capa={capaLuces} />}
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
              ...estiloConLuces,
              boxShadow:
                "0 0 60px -20px color-mix(in srgb, var(--mantine-color-black) 22%, transparent)",
            }}
          >
            {nucleo}
          </Box>
        </div>
      ) : (
        <div className="flex min-h-screen flex-col" style={estiloConLuces}>
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
            <LinkVerificarTickets />
            {/* Acción de sesión (F09c): junto al carrito, chrome neutro, post-hidratación (I5). */}
            <AccesoSesion slug={branding.slug} />
            <BotonCarrito onOpen={onAbrirCarrito} />
          </Group>
        </Group>
      </Container>
    </Box>
  );
}

/**
 * Enlace PINNED al verificador público de tickets (`verificador-tickets` F04/D8, ADR-0024).
 *
 * Pinned **por construcción** (patrón I-U2 del chrome): la plataforma lo renderiza alrededor de lo
 * configurable y no existe input del Organizador que lo quite — más fuerte que un flag. Va SIEMPRE,
 * haya o no sorteo activo: el header es puro y sin DB, y `/verificar` resuelve sola el caso vacío
 * con un mensaje honesto. Ocupa el espacio que dejó el estado anónimo de `AccesoSesion` al ocultarse
 * (usuario 2026-07-27), que es justo lo que se había pre-conversado.
 *
 * Chrome NEUTRO de plataforma (`c="dimmed"`), igual que su vecino `AccesoSesion`: no usa el color de
 * marca del tenant. Texto solo en ≥sm y `aria-label` siempre — a 320 px el header ya carga logo +
 * carrito, y una etiqueta más ahí adentro empujaría al nombre de la tienda fuera de la pantalla
 * (misma regla que ya aplica `AccesoSesion`: cuando conviven un texto que identifica y un control
 * que actúa, el que sobrevive al ancho es el texto que identifica).
 *
 * `component={Link}` y no un `<a>` pelado porque es **navegación interna del mismo subdominio**, y
 * por el mismo criterio lo usa la copia del footer: es el MISMO destino en dos superficies, así que
 * no puede navegar distinto según por dónde se entre. (El vecino `AccesoSesion` usa `<a>` pelado,
 * pero sus destinos son el APEX o una ruta con guard que quiere recarga completa; y el enlace a
 * Bases del footer se deja como está a propósito — tocarlo excede el alcance de esta feature.)
 */
function LinkVerificarTickets() {
  return (
    <Anchor
      component={Link}
      href="/verificar"
      c="dimmed"
      underline="never"
      aria-label="Verificar tickets"
      className="shrink-0"
    >
      <Group gap={6} wrap="nowrap">
        <IconTicket className="size-4" stroke={1.75} />
        <Text size="sm" fw={500} visibleFrom="sm">
          Verificar tickets
        </Text>
      </Group>
    </Anchor>
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
  // Chrome footer (Tanda 3 F06/D10): `texto` editorial + `links` de menú. La atribución neutral y los
  // enlaces a Bases y Verificar (abajo) son PINNED (I-U2/ADR-0008): se renderizan SIEMPRE, no salen del chrome.
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
                  ni al ancla `#sorteo`. INCONDICIONAL y server-rendered: es el enlace LEGAL de la
                  tienda y tiene que existir en el primer paint y sin JS — `/bases` resuelve sola el
                  estado vacío (D5: «no hay un sorteo activo»), así que no hay nada que gatear. (Antes
                  colgaba de `useSorteoActivo()`, una query de CLIENTE: aparecía recién post-hidratación.)
                  Es navegación interna: sin `target="_blank"`. */}
              <Anchor component={Link} href="/bases" c="dimmed" size="sm">
                Bases del sorteo
              </Anchor>
              {/* Verificador de tickets (F04/D8): PINNED e incondicional, igual que Bases. `/verificar`
                  también tiene algo honesto que decir sin sorteo activo, y es la respuesta a «¿me llegó
                  mi número?», que es justo la pregunta de quien no encuentra su correo. Sin
                  `target="_blank"`, y con el MISMO `component={Link}` que su gemelo del header: un solo
                  destino no puede navegar de dos maneras según desde qué parte de la página se lo toque. */}
              <Anchor component={Link} href="/verificar" c="dimmed" size="sm">
                Verificar tickets
              </Anchor>
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
