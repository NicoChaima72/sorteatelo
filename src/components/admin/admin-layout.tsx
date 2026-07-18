import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Burger,
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
  ThemeIcon,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  Spotlight,
  spotlight,
  type SpotlightActionData,
} from "@mantine/spotlight";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBook,
  IconBuildingStore,
  IconExternalLink,
  IconLayoutDashboard,
  IconLogout2,
  IconMoon,
  IconSearch,
  IconSettings,
  IconShieldLock,
  IconShoppingCart,
  IconSun,
  IconTicket,
} from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { type ComponentType, type ReactNode } from "react";

import { CrearTienda } from "~/components/admin/crear-tienda";
import { PageHeader } from "~/components/admin/page-header";
import { abrirTienda } from "~/components/admin/url-tienda";
import { Wordmark } from "~/components/marca/wordmark";
import { APP_CONFIG } from "~/config/app";
import { api } from "~/utils/api";

type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

interface NavItem {
  label: string;
  href: string;
  icon: IconCmp;
}

const NAV: NavItem[] = [
  { label: "Resumen", href: "/admin", icon: IconLayoutDashboard },
  { label: "Productos", href: "/admin/productos", icon: IconBook },
  { label: "Ventas", href: "/admin/ventas", icon: IconShoppingCart },
  { label: "Sorteo", href: "/admin/sorteo", icon: IconTicket },
  { label: "Configuración", href: "/admin/configuracion", icon: IconSettings },
];

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
 * Chrome INVERTIDO (D6): el navbar corona con el wordmark de PLATAFORMA (no con la tienda), y la
 * tienda baja a un chip con el swatch de su `colorPrimario` — el único color-desde-dato permitido
 * en el admin (D2/I2). El menú de cuenta y "Cerrar sesión" viven en el header (avatar), no acá.
 */
function NavbarContent({
  pathname,
  onNavigate,
  tiendaNombre,
  tiendaColor,
  esOperador,
}: {
  pathname: string;
  onNavigate: () => void;
  tiendaNombre: string | null;
  tiendaColor: string | null;
  esOperador: boolean;
}) {
  return (
    <Stack gap={0} h="100%">
      <div className="px-4 pb-3 pt-4">
        <Wordmark size={20} />
        {tiendaNombre && (
          <Paper withBorder radius="sm" px={9} py={5} mt="sm">
            <Group gap={8} wrap="nowrap">
              <ColorSwatch
                color={tiendaColor ?? "var(--mantine-color-gray-4)"}
                size={12}
                withShadow={false}
              />
              <Text size="sm" fw={500} truncate>
                {tiendaNombre}
              </Text>
            </Group>
          </Paper>
        )}
      </div>

      <Divider />

      <div className="flex-1 overflow-y-auto p-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              leftSection={<Icon className="size-[18px]" stroke={1.75} />}
              active={isActive(pathname, item.href)}
              onClick={onNavigate}
              variant="light"
            />
          );
        })}
        {/* Sección del Operador de plataforma: solo visible con el rol (F08/F04). */}
        {esOperador && (
          <NavLink
            component={Link}
            href="/admin/operador"
            label="Operador"
            leftSection={<IconShieldLock className="size-[18px]" stroke={1.75} />}
            active={isActive(pathname, "/admin/operador")}
            onClick={onNavigate}
            variant="light"
          />
        )}
      </div>
    </Stack>
  );
}

/** Menú de cuenta del header (D6): avatar de la sesión, nombre/email, rol, dark toggle y salir. */
function MenuCuenta({ esOperador }: { esOperador: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const esOscuro = computedScheme === "dark";

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
          {esOperador && (
            <Badge
              mt={8}
              size="xs"
              variant="light"
              color="sorteatelo"
              leftSection={<IconShieldLock className="size-3" stroke={2} />}
              styles={{ label: { textTransform: "none" } }}
            >
              Operador de plataforma
            </Badge>
          )}
        </div>
        <Menu.Divider />
        <Menu.Item
          leftSection={
            esOscuro ? (
              <IconSun className="size-4" />
            ) : (
              <IconMoon className="size-4" />
            )
          }
          closeMenuOnClick={false}
          onClick={() => setColorScheme(esOscuro ? "light" : "dark")}
        >
          {esOscuro ? "Modo claro" : "Modo oscuro"}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconLogout2 className="size-4" />}
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          Cerrar sesión
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Empty state para un Operador de plataforma SIN Tienda propia (F08): las páginas del
 * Organizador (Resumen/Productos/…) no aplican, pero su superficie es el panel del Operador.
 * Un Organizador nuevo SIN Tienda ve el formulario de alta (`CrearTienda`), no esto.
 */
function SinTiendaOperador() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <ThemeIcon size={48} radius="xl" variant="light" color="gray">
        <IconBuildingStore className="size-6" stroke={1.75} />
      </ThemeIcon>
      <Text mt="md" size="lg" fw={600}>
        No administras una tienda propia
      </Text>
      <Text mt={6} size="sm" c="dimmed" className="max-w-sm">
        Tu cuenta es Operador de plataforma. Supervisa todas las tiendas desde
        el panel del Operador.
      </Text>
      <Button
        component={Link}
        href="/admin/operador"
        mt="xl"
        rightSection={<IconArrowRight className="size-4" />}
      >
        Ir al panel del Operador
      </Button>
    </div>
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
  const acceso = api.panel.getAccesoActual.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  const tienda = acceso.data?.tenants[0] ?? null;
  const tiendaNombre = tienda?.nombre ?? null;
  const tiendaColor = tienda?.colorPrimario ?? null;
  const tiendaSlug = tienda?.slug ?? null;
  const esOperador = acceso.data?.esOperador ?? false;
  const sinTienda =
    acceso.data !== undefined && acceso.data.tenants.length === 0;

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
    ...(esOperador
      ? [
          {
            id: "/admin/operador",
            label: "Operador",
            description: "Supervisión de todas las tiendas",
            leftSection: (
              <IconShieldLock className="size-[18px]" stroke={1.75} />
            ),
            onClick: () => void router.push("/admin/operador"),
          },
        ]
      : []),
    ...(tiendaSlug
      ? [
          {
            id: "ver-tienda",
            label: "Ver mi tienda",
            description: "Abre tu tienda en una pestaña nueva",
            leftSection: (
              <IconExternalLink className="size-[18px]" stroke={1.75} />
            ),
            onClick: () => abrirTienda(tiendaSlug),
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

      <AppShell
        header={{ height: 64 }}
        navbar={{
          width: 256,
          breakpoint: "lg",
          collapsed: { mobile: !opened },
        }}
        padding={{ base: "md", lg: "xl" }}
        styles={{
          main: {
            backgroundColor:
              "light-dark(var(--mantine-color-hundido-1), var(--mantine-color-dark-8))",
          },
        }}
      >
        <AppShell.Header>
          <Group h="100%" px={{ base: "md", lg: "xl" }} gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="lg"
              size="sm"
              aria-label={opened ? "Cerrar menú" : "Abrir menú"}
            />
            {/* En móvil el navbar (y su wordmark) está colapsado: la marca se muestra acá. */}
            <Group hiddenFrom="lg" gap={0} wrap="nowrap">
              <Wordmark size={18} />
            </Group>

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
                    onClick={() => abrirTienda(tiendaSlug)}
                    visibleFrom="sm"
                  >
                    Ver mi tienda
                  </Button>
                  <ActionIcon
                    variant="light"
                    onClick={() => abrirTienda(tiendaSlug)}
                    hiddenFrom="sm"
                    aria-label="Ver mi tienda"
                  >
                    <IconExternalLink className="size-4" />
                  </ActionIcon>
                </>
              )}
              <MenuCuenta esOperador={esOperador} />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar>
          <NavbarContent
            pathname={router.pathname}
            onNavigate={close}
            tiendaNombre={tiendaNombre}
            tiendaColor={tiendaColor}
            esOperador={esOperador}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          <div className="mx-auto w-full max-w-6xl">
            {acceso.isLoading ? (
              <Stack gap="md">
                <Skeleton height={32} width={192} />
                <Skeleton height={160} />
              </Stack>
            ) : acceso.isError ? (
              <ErrorAcceso onRetry={() => void acceso.refetch()} />
            ) : sinTienda ? (
              esOperador ? (
                <SinTiendaOperador />
              ) : (
                <CrearTienda />
              )
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
