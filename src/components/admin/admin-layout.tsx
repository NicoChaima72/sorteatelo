import {
  ActionIcon,
  AppShell,
  Avatar,
  Button,
  ColorSwatch,
  Divider,
  Group,
  Kbd,
  Menu,
  NavLink,
  Paper,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";
import {
  Spotlight,
  spotlight,
  type SpotlightActionData,
} from "@mantine/spotlight";
import {
  IconAlertTriangle,
  IconBook,
  IconChevronDown,
  IconExternalLink,
  IconLayoutDashboard,
  IconLogout2,
  IconMenu2,
  IconSearch,
  IconSettings,
  IconShoppingCart,
  IconTicket,
} from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import {
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";

import { CrearTienda } from "~/components/admin/crear-tienda";
import { PageHeader } from "~/components/admin/page-header";
import { abrirEditor, abrirTienda } from "~/components/admin/url-tienda";
import { Wordmark } from "~/components/marca/wordmark";
import { hrefApex, hrefSubdominio } from "~/lib/urlApex";
import { APP_CONFIG } from "~/config/app";
import { api, type RouterOutputs } from "~/utils/api";

type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

interface NavItem {
  label: string;
  /** Ruta interna del panel. Ignorado cuando el item es una ACCIÓN (`onSelect`). */
  href: string;
  icon: IconCmp;
  /**
   * Acción en vez de navegación interna (admin-bases-pdf F06/D7): el ítem «Editor de la tienda» abre
   * `<slug>.<apex>/editor` en otra pestaña — otra zona de la app ⇒ no se navega con `next/link`.
   * Con `onSelect` el rail renderiza un botón en vez de un `Link`. (Desde ADR-0022 el panel también
   * vive en el subdominio, pero la salida sigue siendo navegación dura: el editor no comparte el
   * router del panel.)
   */
  onSelect?: () => void;
}

/**
 * Una Tienda tal como la devuelve `getAccesoActual`. Se DERIVA del router (no se redeclara a mano):
 * si el server cambia el shape, el compilador avisa acá (frontend-conventions § Tipos).
 */
type TiendaAcceso =
  RouterOutputs["panel"]["getAccesoActual"]["tenants"][number];

const NAV: NavItem[] = [
  { label: "Resumen", href: "/admin", icon: IconLayoutDashboard },
  { label: "Productos", href: "/admin/productos", icon: IconBook },
  { label: "Ventas", href: "/admin/ventas", icon: IconShoppingCart },
  { label: "Sorteo", href: "/admin/sorteo", icon: IconTicket },
  { label: "Configuración", href: "/admin/configuracion", icon: IconSettings },
];

/** Navegación operativa (arriba en el rail) vs. utilidades ancladas al pie (ajustes). */
const NAV_PRINCIPAL = NAV.filter((i) => i.href !== "/admin/configuracion");
const NAV_CONFIG = NAV.filter((i) => i.href === "/admin/configuracion");

/** Breakpoint `lg` (75em) del theme, para saber si el rail está en modo desktop (no drawer). */
const LG_QUERY = "(min-width: 75em)";
/** Persistencia del rail colapsado/expandido entre navegaciones (D3). */
const RAIL_KEY = "sorteatelo:rail-colapsado";

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/** Iniciales para el fallback del Avatar (sin imagen de la sesión). */
function iniciales(nombre?: string | null, email?: string | null): string {
  const base = (nombre ?? "").trim() || (email ?? "").trim();
  if (!base) return "?";
  const partes = base.split(/\s+/);
  if (partes.length >= 2 && partes[0] && partes[1]) {
    return (partes[0][0]! + partes[1][0]!).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

/**
 * Item de navegación del rail tinta (D6). Sobre fondo oscuro el NavLink se re-estila por CSS vars:
 * activo = pill cobalto `filled` con texto blanco; inactivo = texto `gray-4` + hover `dark-6`.
 * Colapsado (icon-only, solo desktop): oculta el body/label y CENTRA el ícono (el body en `display:none`
 * deja al `section` solo, y `justify-content:center` lo centra de verdad), con Tooltip del nombre.
 */
function RailNavLink({
  item,
  active,
  iconOnly,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  iconOnly: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  // Item esbelto estilo Grillos v2 (analizado del código real): NO pill sólido. Activo = tinte
  // SUAVE del cobalto (`sorteatelo-light`, dark-scheme-aware) + **barra de acento de 3px** al
  // borde del rail; inactivo = texto gris tenue; icono fino 17/1.7; texto 13px. `variant="subtle"`
  // (no `filled`) para que Mantine dé el hover suave sin el bloque pesado.
  const propsVisuales = {
    label: iconOnly ? undefined : item.label,
    "aria-label": iconOnly ? item.label : undefined,
    leftSection: <Icon className="size-[17px]" stroke={1.7} />,
    active,
    variant: "subtle" as const,
    color: "sorteatelo",
    styles: {
      root: {
        borderRadius: 8,
        padding: iconOnly ? "8px 0" : "7px 10px",
        justifyContent: iconOnly ? "center" : undefined,
        background: active ? "var(--mantine-color-sorteatelo-light)" : undefined,
        color: active
          ? "var(--mantine-color-white)"
          : "var(--mantine-color-gray-4)",
      },
      // Colapsado: sin body ⇒ el section (ícono) queda solo y se centra con el justify del root.
      body: iconOnly ? { display: "none" } : undefined,
      section: iconOnly ? { marginInlineEnd: 0 } : undefined,
      label: { fontSize: 13, fontWeight: active ? 600 : 400 },
    },
  };

  const nav = (
    <div className="relative mb-0.5">
      {active && (
        <span
          aria-hidden
          className="absolute left-[-8px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r"
          style={{ background: "var(--mantine-color-sorteatelo-4)" }}
        />
      )}
      {/* Un item es LINK (ruta del panel) o ACCIÓN (abre otro host). Se renderizan en dos ramas
          explícitas en vez de spreadear la unión de props: el `component` polimórfico de Mantine no
          estrecha bien un spread condicional. Los props visuales son los MISMOS objetos. */}
      {item.onSelect ? (
        <NavLink
          component="button"
          type="button"
          onClick={() => {
            item.onSelect?.();
            onNavigate();
          }}
          {...propsVisuales}
        />
      ) : (
        <NavLink
          component={Link}
          href={item.href}
          onClick={onNavigate}
          {...propsVisuales}
        />
      )}
    </div>
  );
  return iconOnly ? (
    <Tooltip label={item.label} position="right" withArrow offset={8}>
      {nav}
    </Tooltip>
  ) : (
    nav
  );
}

/**
 * Chrome «Oscuro + calmo» del rail (D6, design.md §4). Con `layout="alt"` el rail ocupa TODA la
 * altura (llega hasta arriba) y el header queda solo sobre el contenido. El rail corona con el
 * wordmark de PLATAFORMA (invertido). El chip de tienda y el toggle colapsar viven en el header.
 * Colapsable: al colapsar, wordmark → isotipo y NavLinks → icon-only centrados con Tooltip.
 */
function NavbarContent({
  pathname,
  onNavigate,
  iconOnly,
  tiendaSlug,
}: {
  pathname: string;
  onNavigate: () => void;
  iconOnly: boolean;
  /** Slug de la Tienda activa; `null` mientras carga o si el usuario no administra ninguna. */
  tiendaSlug: string | null;
}) {
  return (
    <div
      className="flex h-full flex-col"
      data-mantine-color-scheme="dark"
      style={
        {
          color: "var(--mantine-color-gray-4)",
          "--nl-bg": "var(--mantine-color-sorteatelo-filled)",
          "--nl-color": "var(--mantine-color-white)",
          "--nl-hover": "var(--mantine-color-sorteatelo-7)",
        } as CSSProperties
      }
    >
      <div
        className={
          iconOnly
            ? "flex flex-col items-center px-2 pb-3 pt-4"
            : "px-4 pb-3 pt-4"
        }
      >
        {iconOnly ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/favicon.svg"
            alt=""
            aria-hidden
            width={28}
            height={28}
            style={{ display: "block" }}
          />
        ) : (
          // Isologo limpio sobre la tinta: isotipo (que ya carga el color de marca) + nombre en
          // BLANCO PLANO en la display. Sin el resaltado «éa» (pensado para fondos claros, se
          // invisibiliza sobre tinta) ni el pincelazo-sticker. Nombre desde APP_CONFIG (I8).
          <Group gap={10} wrap="nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.svg"
              alt=""
              aria-hidden
              width={26}
              height={26}
              style={{ display: "block", flexShrink: 0 }}
            />
            <Text
              component="span"
              fw={800}
              c="white"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {APP_CONFIG.name}
            </Text>
          </Group>
        )}
      </div>

      <Divider color="dark.5" />

      {/* Navegación principal (operativa): arriba, ocupa el alto disponible. */}
      <div className="flex-1 overflow-y-auto p-2">
        {NAV_PRINCIPAL.map((item) => (
          <RailNavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            iconOnly={iconOnly}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Utilidades ancladas abajo (editor / ajustes), separadas por un divisor — jerarquía tipo
          Grillos (Canales/Equipo/Ajustes al pie). */}
      <div className="p-2">
        <Divider color="dark.5" mb={6} />
        {/* Puente al EDITOR de la tienda (admin-bases-pdf F06/D7, opción D): hasta ahora el panel no
            enlazaba al editor por ningún lado. Es una ACCIÓN, no una ruta del panel: el editor vive
            en el subdominio de la Tienda. Sin tienda (o mientras carga) no se muestra. */}
        {tiendaSlug && (
          <RailNavLink
            item={{
              label: "Editor de la tienda",
              href: "#",
              // `IconExternalLink` como en «Ver mi tienda»: los dos abren OTRO host en pestaña nueva,
              // así que comparten la señal visual de salida (consistencia interna del rail).
              icon: IconExternalLink,
              onSelect: () => abrirEditor(tiendaSlug, tiendaSlug),
            }}
            active={false}
            iconOnly={iconOnly}
            onNavigate={onNavigate}
          />
        )}
        {NAV_CONFIG.map((item) => (
          <RailNavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            iconOnly={iconOnly}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Selector de tienda en el HEADER (D6 revisado; funcional desde admin-multi-tienda F05/D4).
 *
 * Muestra la tienda ACTIVA —la del subdominio donde corre el panel, no `tiendas[0]`— con su swatch
 * de `colorPrimario` (único color-desde-dato del admin, §2/§9 de design.md). Con una sola membresía
 * y sin otra tienda a la que ir, es un chip estático; si hay más, es un `Menu` de navegación REAL:
 * cada ítem es un `<a href>` absoluto al `/admin` de esa tienda (D4: siempre el dashboard, no la
 * ruta actual). Cambiar de tienda es cambiar de HOST ⇒ navegación dura, jamás `next/link`.
 *
 * El href se calcula solo tras montar (`window.location`); hasta entonces el ítem no navega.
 */
function TiendaSwitcher({
  tiendas,
  activa,
}: {
  tiendas: TiendaAcceso[];
  activa: TiendaAcceso;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Las OTRAS tiendas del usuario (a la activa ya se está adentro).
  const otras = tiendas.filter((t) => t.slug !== activa.slug);

  const contenido = (
    <Group gap={8} wrap="nowrap">
      <ColorSwatch
        color={activa.colorPrimario ?? "var(--mantine-color-gray-4)"}
        size={12}
        withShadow={false}
      />
      <Text size="sm" fw={500} truncate maw={160}>
        {activa.nombre}
      </Text>
      {otras.length > 0 && (
        <IconChevronDown className="size-3.5 opacity-60" stroke={2} />
      )}
    </Group>
  );

  const chip = (
    <Paper
      radius="sm"
      px={10}
      py={6}
      bg="var(--mantine-color-gray-1)"
      withBorder={false}
    >
      {contenido}
    </Paper>
  );

  if (otras.length === 0) return chip;

  return (
    <Menu position="bottom-start" width={240} withArrow shadow="md">
      <Menu.Target>
        <UnstyledButton aria-label="Cambiar de tienda">{chip}</UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Cambiar de tienda</Menu.Label>
        {tiendas.map((t) => {
          const esActiva = t.slug === activa.slug;
          return (
            <Menu.Item
              key={t.slug}
              // Navegación CROSS-HOST: `component="a"` con href absoluto. La activa no lleva
              // href (ya estás ahí) y queda marcada.
              component={esActiva || !montado ? "button" : "a"}
              href={
                esActiva || !montado
                  ? undefined
                  : hrefSubdominio({
                      slug: t.slug,
                      slugActual: activa.slug,
                      path: "/admin",
                    })
              }
              disabled={esActiva}
              leftSection={
                <ColorSwatch
                  color={t.colorPrimario ?? "var(--mantine-color-gray-4)"}
                  size={12}
                  withShadow={false}
                />
              }
              rightSection={
                esActiva ? (
                  <Text size="xs" c="dimmed">
                    Actual
                  </Text>
                ) : undefined
              }
            >
              {t.nombre}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Menú de cuenta del header (D6): avatar de la sesión, nombre/email y cerrar sesión. */
function MenuCuenta({
  slugActual,
}: {
  /** Tienda del host, para volver al login DEL APEX al cerrar sesión. `null` en el apex. */
  slugActual: string | null;
}) {
  const { data: session } = useSession();
  const user = session?.user;

  // Cerrar sesión desde el subdominio devuelve al login del APEX, que es donde se entra
  // (ADR-0019: el OAuth dance vive ahí). En el apex, la ruta relativa ya es la correcta.
  const cerrarSesion = () =>
    void signOut({
      callbackUrl: slugActual
        ? hrefApex({ path: "/login", slug: slugActual })
        : "/login",
    });

  return (
    <Menu position="bottom-end" width={248} withArrow shadow="md">
      <Menu.Target>
        <UnstyledButton aria-label="Menú de cuenta">
          <Avatar
            src={user?.image ?? undefined}
            radius="xl"
            size={34}
            color="sorteatelo"
          >
            {iniciales(user?.name, user?.email)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <div className="px-3 py-2">
          <Text size="sm" fw={600} truncate>
            {user?.name ?? "Mi cuenta"}
          </Text>
          {user?.email && (
            <Text size="xs" c="dimmed" truncate>
              {user.email}
            </Text>
          )}
        </div>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLogout2 className="size-4" />}
          onClick={cerrarSesion}
        >
          Cerrar sesión
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** Error de carga del acceso (data-fetching-conventions: error + reintentar). */
function ErrorAcceso({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <IconAlertTriangle
        className="size-8"
        stroke={1.75}
        color="var(--mantine-color-red-6)"
      />
      <Text mt="sm" size="sm" c="red" className="max-w-sm">
        No pudimos cargar tu panel. Revisa tu conexión e inténtalo de nuevo.
      </Text>
      <Button mt="md" variant="default" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

interface AdminLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminLayout({
  title,
  description,
  actions,
  children,
}: AdminLayoutProps) {
  const router = useRouter();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [colapsado, setColapsado] = useLocalStorage<boolean>({
    key: RAIL_KEY,
    defaultValue: false,
  });
  const esDesktop = useMediaQuery(LG_QUERY, false);
  const reducir = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const iconOnly = colapsado && !!esDesktop;

  const acceso = api.panel.getAccesoActual.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  const tiendas: TiendaAcceso[] = acceso.data?.tenants ?? [];
  // La tienda ACTIVA es la del SUBDOMINIO (ADR-0022), no `tenants[0]`: es la que el server opera,
  // así que es la que el chrome debe mostrar y a la que apuntan "Ver mi tienda" y el editor.
  const tiendaActiva: TiendaAcceso | null = acceso.data?.tiendaActiva ?? null;
  const tiendaSlug = tiendaActiva?.slug ?? null;
  // "Sin tienda" = la puerta del apex (alta de Tienda). Dentro del subdominio de una tienda que se
  // administra SIEMPRE hay tienda activa (el guard de la página ya rebotó a quien no es miembro,
  // D11), así que el panel se renderiza.
  const sinTienda =
    acceso.data !== undefined &&
    acceso.data.tenants.length === 0 &&
    tiendaActiva === null;

  // El botón hamburguesa del header: en desktop colapsa/expande el rail; en móvil abre/cierra el Drawer.
  const onHamburguesa = () =>
    esDesktop ? setColapsado((c) => !c) : toggle();

  // Acciones del Spotlight (Cmd/Ctrl+K, F07): navegación del panel + "Ver mi tienda".
  const spotlightActions: SpotlightActionData[] = [
    ...NAV.map((item) => {
      const Icon = item.icon;
      return {
        id: item.href,
        label: item.label,
        leftSection: <Icon className="size-[18px]" stroke={1.75} />,
        onClick: () => void router.push(item.href),
      };
    }),
    ...(tiendaSlug
      ? [
          {
            id: "ver-tienda",
            label: "Ver mi tienda",
            description: "Abre tu tienda en una pestaña nueva",
            leftSection: (
              <IconExternalLink className="size-[18px]" stroke={1.75} />
            ),
            onClick: () => abrirTienda(tiendaSlug, tiendaSlug),
          },
          {
            id: "editor-tienda",
            label: "Editor de la tienda",
            description: "Edita el contenido de tu tienda (hero, textos, secciones)",
            leftSection: <IconExternalLink className="size-[18px]" stroke={1.75} />,
            onClick: () => abrirEditor(tiendaSlug, tiendaSlug),
          },
        ]
      : []),
  ];

  return (
    <>
      <Head>
        <title>{`${title} · ${APP_CONFIG.name}`}</title>
        <meta name="description" content={APP_CONFIG.tagline} />
      </Head>

      {/* El panel NO tiene modo oscuro (decisión del usuario): se fuerza `light` en TODO el subtree
          del admin, sin tocar `_app.tsx` (el storefront conserva su dark per-tenant). El rail vuelve a
          `dark` localmente para su superficie tinta. */}
      <div data-mantine-color-scheme="light">
      <AppShell
        // `layout="alt"`: el rail ocupa toda la altura (llega hasta arriba); el header queda solo
        // sobre el contenido, a la derecha del rail.
        layout="alt"
        header={{ height: 64 }}
        navbar={{
          width: iconOnly ? 68 : 232,
          breakpoint: "lg",
          collapsed: { mobile: !opened },
        }}
        padding={{ base: "md", lg: "xl" }}
        withBorder={false}
        transitionDuration={reducir ? 0 : 200}
        transitionTimingFunction="ease"
        styles={{
          main: {
            backgroundColor: "var(--mantine-color-gray-0)",
          },
          navbar: {
            backgroundColor: "var(--mantine-color-black)",
            border: "none",
            transition: reducir
              ? "none"
              : "width 200ms ease, transform 200ms ease",
          },
        }}
      >
        <AppShell.Header>
          <Group h="100%" px={{ base: "md", lg: "xl" }} gap="sm" wrap="nowrap">
            {/* Hamburguesa: colapsa el rail (desktop) o abre el Drawer (móvil). */}
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={onHamburguesa}
              aria-label={
                esDesktop
                  ? colapsado
                    ? "Expandir menú"
                    : "Colapsar menú"
                  : opened
                    ? "Cerrar menú"
                    : "Abrir menú"
              }
            >
              <IconMenu2 className="size-5" stroke={1.75} />
            </ActionIcon>

            {/* En móvil el rail es un Drawer colapsado: la marca se muestra acá. */}
            <Group hiddenFrom="lg" gap={0} wrap="nowrap">
              <Wordmark size={18} />
            </Group>

            {tiendaActiva && (
              <Group visibleFrom="sm">
                <TiendaSwitcher tiendas={tiendas} activa={tiendaActiva} />
              </Group>
            )}

            <Group ml="auto" gap="sm" wrap="nowrap">
              <Button
                variant="default"
                size="xs"
                onClick={spotlight.open}
                leftSection={<IconSearch className="size-3.5" />}
                rightSection={<Kbd size="xs">⌘K</Kbd>}
                visibleFrom="sm"
              >
                Buscar
              </Button>
              <ActionIcon
                variant="default"
                onClick={spotlight.open}
                hiddenFrom="sm"
                aria-label="Buscar en el panel"
              >
                <IconSearch className="size-4" />
              </ActionIcon>
              {tiendaSlug && (
                <>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconExternalLink className="size-3.5" />}
                    onClick={() => abrirTienda(tiendaSlug, tiendaSlug)}
                    visibleFrom="sm"
                  >
                    Ver mi tienda
                  </Button>
                  <ActionIcon
                    variant="light"
                    onClick={() => abrirTienda(tiendaSlug, tiendaSlug)}
                    hiddenFrom="sm"
                    aria-label="Ver mi tienda"
                  >
                    <IconExternalLink className="size-4" />
                  </ActionIcon>
                </>
              )}
              <MenuCuenta slugActual={tiendaSlug} />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar>
          <NavbarContent
            pathname={router.pathname}
            onNavigate={close}
            iconOnly={iconOnly}
            tiendaSlug={tiendaSlug}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          {/* Contenido full-width: sin el cap `max-w-6xl` del chrome anterior (§4). */}
          <div className="w-full">
            {acceso.isLoading ? (
              <Stack gap="md">
                <Skeleton height={32} width={192} />
                <Skeleton height={160} />
              </Stack>
            ) : acceso.isError ? (
              <ErrorAcceso onRetry={() => void acceso.refetch()} />
            ) : sinTienda ? (
              <CrearTienda />
            ) : (
              <>
                <PageHeader
                  title={title}
                  description={description}
                  actions={actions}
                />
                {children}
              </>
            )}
          </div>
        </AppShell.Main>
      </AppShell>
      </div>

      <Spotlight
        actions={spotlightActions}
        shortcut="mod + K"
        nothingFound="No encontramos esa sección"
        highlightQuery
        searchProps={{
          leftSection: <IconSearch className="size-4" stroke={1.75} />,
          placeholder: "Buscar en el panel…",
        }}
      />
    </>
  );
}
