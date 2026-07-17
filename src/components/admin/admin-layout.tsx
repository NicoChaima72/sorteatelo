import {
  AppShell,
  Badge,
  Burger,
  Button,
  Divider,
  Group,
  NavLink,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconBook,
  IconBooks,
  IconLayoutDashboard,
  IconLogout2,
  IconSettings,
  IconShoppingBag,
  IconShoppingCart,
  IconTicket,
} from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import { type ComponentType, type ReactNode } from "react";

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

function NavbarContent({
  pathname,
  onNavigate,
  tiendaNombre,
  esOperador,
}: {
  pathname: string;
  onNavigate: () => void;
  tiendaNombre: string | null;
  esOperador: boolean;
}) {
  return (
    <Stack gap={0} h="100%">
      <Group h={64} px="md" gap="sm" wrap="nowrap">
        <ThemeIcon size={36} radius="md">
          <IconBooks className="size-5" stroke={1.75} />
        </ThemeIcon>
        <div className="min-w-0">
          <Text size="sm" fw={600} truncate>
            {tiendaNombre ?? "Panel de la tienda"}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            Administración
          </Text>
        </div>
      </Group>

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
      </div>

      <Divider />

      <Stack gap="xs" p="sm">
        {esOperador && (
          <Badge
            variant="outline"
            color="gray"
            fullWidth
            styles={{ label: { fontWeight: 400, textTransform: "none" } }}
          >
            Operador de plataforma
          </Badge>
        )}
        <Button
          variant="subtle"
          color="gray"
          justify="flex-start"
          leftSection={<IconLogout2 className="size-4" />}
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          Cerrar sesión
        </Button>
      </Stack>
    </Stack>
  );
}

/** Empty state cuando la cuenta no tiene una Tienda asignada (D2/fail-closed). */
function SinTienda() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <ThemeIcon size={48} radius="xl" variant="light" color="gray">
        <IconShoppingBag className="size-6" stroke={1.75} />
      </ThemeIcon>
      <Text mt="md" size="lg" fw={600}>
        Tu cuenta no tiene una tienda asignada
      </Text>
      <Text mt={6} size="sm" c="dimmed" className="max-w-sm">
        Iniciaste sesión correctamente, pero todavía no administras ninguna
        tienda. Pídele al equipo que te asigne acceso a tu tienda para empezar a
        operar.
      </Text>
      <Button
        mt="xl"
        variant="default"
        leftSection={<IconLogout2 className="size-4" />}
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        Cerrar sesión
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
  const { pathname } = useRouter();
  const [opened, { toggle, close }] = useDisclosure(false);
  const acceso = api.panel.getAccesoActual.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  const tiendaNombre = acceso.data?.tenants[0]?.nombre ?? null;
  const esOperador = acceso.data?.esOperador ?? false;
  const sinTienda =
    acceso.data !== undefined && acceso.data.tenants.length === 0;

  return (
    <>
      <Head>
        <title>{`${title} · ${tiendaNombre ?? "Panel"}`}</title>
        <meta name="description" content="Panel de administración de la tienda" />
      </Head>

      <AppShell
        header={{ height: 64 }}
        navbar={{
          width: 256,
          breakpoint: "lg",
          collapsed: { mobile: !opened },
        }}
        padding={{ base: "md", lg: "xl" }}
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
            <div className="min-w-0">
              <Text component="h1" size="lg" fw={600} lh={1.2} truncate>
                {title}
              </Text>
              {description && (
                <Text size="sm" c="dimmed" truncate>
                  {description}
                </Text>
              )}
            </div>
            {!sinTienda && (
              <Group ml="auto" gap="sm" wrap="nowrap">
                {actions}
              </Group>
            )}
          </Group>
        </AppShell.Header>

        <AppShell.Navbar>
          <NavbarContent
            pathname={pathname}
            onNavigate={close}
            tiendaNombre={tiendaNombre}
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
              <SinTienda />
            ) : (
              children
            )}
          </div>
        </AppShell.Main>
      </AppShell>
    </>
  );
}
