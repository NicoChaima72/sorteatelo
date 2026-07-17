import {
  IconCreditCard,
  IconPalette,
  IconTicket,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { fechaHora } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

function SettingCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: IconCmp;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-[18px] text-muted-foreground" stroke={1.75} />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const textareaCls =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Card de credenciales Flow: WRITE-ONLY (nunca precarga secretos; solo muestra el estado). */
function CredencialFlowCard() {
  const utils = api.useUtils();
  const estado = api.panel.getEstadoCredencialFlow.useQuery(undefined, {
    retry: false,
  });

  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [sandbox, setSandbox] = useState("sandbox");

  const guardar = api.panel.guardarCredencialFlow.useMutation({
    onSuccess: async () => {
      setApiKey("");
      setSecretKey("");
      await utils.panel.getEstadoCredencialFlow.invalidate();
    },
  });

  const puedeGuardar = apiKey.trim() !== "" && secretKey.trim() !== "";

  return (
    <SettingCard
      icon={IconCreditCard}
      title="Pagos (Flow)"
      description="Conecta tu cuenta de Flow para cobrar. Tus claves se guardan cifradas y nunca se muestran."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Estado</span>
          {estado.isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : estado.isError ? (
            <button
              onClick={() => void estado.refetch()}
              className="text-xs text-destructive underline-offset-2 hover:underline"
            >
              Error al cargar · Reintentar
            </button>
          ) : estado.data?.configurada ? (
            <span className="flex items-center gap-2">
              <Badge variant="secondary">Configurada</Badge>
              <span className="text-xs text-muted-foreground">
                {estado.data.sandbox ? "sandbox" : "producción"}
                {estado.data.updatedAt
                  ? ` · ${fechaHora(estado.data.updatedAt)}`
                  : ""}
              </span>
            </span>
          ) : (
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              No conectada
            </Badge>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="apiKey">API Key</Label>
          <Input
            id="apiKey"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="••••••••••••"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="secretKey">Secret Key</Label>
          <Input
            id="secretKey"
            type="password"
            autoComplete="off"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="••••••••••••"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ambiente">Ambiente</Label>
          <Select value={sandbox} onValueChange={setSandbox}>
            <SelectTrigger id="ambiente" className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (pruebas)</SelectItem>
              <SelectItem value="produccion">Producción</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {guardar.error && (
          <p role="alert" className="text-sm text-destructive">
            {guardar.error.message}
          </p>
        )}

        <Button
          onClick={() =>
            guardar.mutate({
              apiKey,
              secretKey,
              sandbox: sandbox === "sandbox",
            })
          }
          disabled={!puedeGuardar || guardar.isPending}
        >
          {guardar.isPending ? "Guardando…" : "Guardar credenciales"}
        </Button>
      </div>
    </SettingCard>
  );
}

/** Card de config de tienda: descripción, logo, color, bases del sorteo (texto). */
function ConfiguracionTiendaCard() {
  const utils = api.useUtils();
  const config = api.panel.getConfiguracionTienda.useQuery(undefined, {
    retry: false,
  });

  const [descripcion, setDescripcion] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [colorPrimario, setColorPrimario] = useState("");
  const [basesSorteo, setBasesSorteo] = useState("");

  // Rehidratar el form cuando llegan los datos.
  useEffect(() => {
    if (!config.data) return;
    setDescripcion(config.data.descripcion ?? "");
    setLogoUrl(config.data.logoUrl ?? "");
    setColorPrimario(config.data.colorPrimario ?? "");
    setBasesSorteo(config.data.basesSorteo ?? "");
  }, [config.data]);

  const guardar = api.panel.guardarConfiguracionTienda.useMutation({
    onSuccess: async () => {
      await utils.panel.getConfiguracionTienda.invalidate();
    },
  });

  if (config.isLoading) {
    return (
      <SettingCard
        icon={IconPalette}
        title="Tu tienda"
        description="La descripción, el logo y el color de tu tienda."
      >
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </SettingCard>
    );
  }

  // Error: NO renderizar el form editable (evita que un fetch fallido muestre campos en
  // blanco y que "Guardar" pise la config real —incluidas las bases— con strings vacíos).
  if (config.isError || !config.data) {
    return (
      <SettingCard
        icon={IconPalette}
        title="Tu tienda"
        description="La descripción, el logo y el color de tu tienda."
      >
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-sm text-destructive">
            No pudimos cargar la configuración de tu tienda.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void config.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </SettingCard>
    );
  }

  return (
    <SettingCard
      icon={IconPalette}
      title="Tu tienda"
      description="La descripción, el logo y el color de tu tienda. El diseño real llega más adelante."
    >
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="descripcion">Descripción</Label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Una línea que describa tu tienda."
            className={`${textareaCls} min-h-[72px]`}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="logoUrl">Logo (URL)</Label>
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="colorPrimario">Color de marca (hex)</Label>
            <Input
              id="colorPrimario"
              value={colorPrimario}
              onChange={(e) => setColorPrimario(e.target.value)}
              placeholder="#4f46e5"
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="mb-2 flex items-center gap-2">
            <IconTicket
              className="size-[18px] text-muted-foreground"
              stroke={1.75}
            />
            <Label htmlFor="basesSorteo" className="text-sm font-medium">
              Bases del sorteo
            </Label>
          </div>
          <textarea
            id="basesSorteo"
            value={basesSorteo}
            onChange={(e) => setBasesSorteo(e.target.value)}
            placeholder="Escribe aquí las bases legales del sorteo. Tú eres responsable de su contenido."
            className={`${textareaCls} min-h-[140px]`}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            El texto de las bases. La responsabilidad legal del sorteo es tuya.
          </p>
        </div>

        {guardar.error && (
          <p role="alert" className="text-sm text-destructive">
            {guardar.error.message}
          </p>
        )}
        {guardar.isSuccess && !guardar.isPending && (
          <p className="text-sm text-muted-foreground">Cambios guardados.</p>
        )}

        <Button
          onClick={() =>
            guardar.mutate({ descripcion, logoUrl, colorPrimario, basesSorteo })
          }
          disabled={guardar.isPending}
        >
          {guardar.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </SettingCard>
  );
}

export default function ConfiguracionPage() {
  return (
    <AdminLayout
      title="Configuración"
      description="Los ajustes de tu tienda: pagos, marca y bases del sorteo."
    >
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CredencialFlowCard />
        <ConfiguracionTiendaCard />
      </div>
    </AdminLayout>
  );
}
