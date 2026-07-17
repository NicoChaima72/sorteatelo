import {
  IconAlertTriangle,
  IconBook,
  IconBooks,
  IconLayoutDashboard,
  IconLogout2,
  IconMenu2,
  IconSettings,
  IconShoppingBag,
  IconShoppingCart,
  IconTicket,
  IconX,
} from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import { type ComponentType, type ReactNode, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
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

function Sidebar({
  pathname,
  open,
  onClose,
  tiendaNombre,
  esOperador,
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
  tiendaNombre: string | null;
  esOperador: boolean;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <IconBooks className="size-5" stroke={1.75} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {tiendaNombre ?? "Panel de la tienda"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            Administración
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Cerrar menú"
        >
          <IconX className="size-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" stroke={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t p-3">
        {esOperador && (
          <Badge
            variant="outline"
            className="mb-2 w-full justify-center gap-1.5 font-normal text-muted-foreground"
          >
            Operador de plataforma
          </Badge>
        )}
        <button
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconLogout2 className="size-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

/** Empty state cuando la cuenta no tiene una Tienda asignada (D2/fail-closed). */
function SinTienda() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <IconShoppingBag className="size-6" stroke={1.75} />
      </div>
      <h2 className="mt-4 text-lg font-semibold">
        Tu cuenta no tiene una tienda asignada
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Iniciaste sesión correctamente, pero todavía no administras ninguna
        tienda. Pídele al equipo que te asigne acceso a tu tienda para empezar a
        operar.
      </p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        <IconLogout2 className="size-4" />
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
        className="size-8 text-destructive"
        stroke={1.75}
      />
      <p className="mt-3 max-w-sm text-sm text-destructive">
        No pudimos cargar tu panel. Revisa tu conexión e inténtalo de nuevo.
      </p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
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
  const [open, setOpen] = useState(false);
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

      {/* App shell: alto fijo de viewport; el scroll vive solo en <main>. */}
      <div className="admin flex h-screen overflow-hidden bg-muted/30 text-foreground">
        <Sidebar
          pathname={pathname}
          open={open}
          onClose={() => setOpen(false)}
          tiendaNombre={tiendaNombre}
          esOperador={esOperador}
        />

        {open && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-8">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
              aria-label="Abrir menú"
            >
              <IconMenu2 className="size-5" />
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">
                {title}
              </h1>
              {description && (
                <p className="truncate text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>

            {!sinTienda && (
              <div className="ml-auto flex items-center gap-3">{actions}</div>
            )}
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-6xl">
              {acceso.isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : acceso.isError ? (
                <ErrorAcceso onRetry={() => void acceso.refetch()} />
              ) : sinTienda ? (
                <SinTienda />
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
