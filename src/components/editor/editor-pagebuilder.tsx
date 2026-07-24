import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { PanelDock, type DockPanel } from "~/components/editor/panel-dock";
import { PanelEdicion } from "~/components/editor/panel-edicion";
import { PanelHistorial } from "~/components/editor/panel-historial";
import { PanelSecciones } from "~/components/editor/panel-secciones";
import { PanelTema } from "~/components/editor/panel-tema";
import { WidgetGallery } from "~/components/editor/widget-gallery";
import { WIDGET_META, type WidgetTipo } from "~/lib/pagebuilder/widgets";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { type TenantBranding } from "~/styles/tenantTheme";
import { api } from "~/utils/api";

/**
 * Editor visual del page builder (catálogo-v2 F09/F10; DOCK en F11). Superficie, NO dominio (I-I): CERO
 * regla de negocio acá — toda mutación pasa por `api.pagebuilder.mutar` (delega en `aplicarMutacionPagina`,
 * el MISMO use case del MCP) con lock optimista (`expectedVersion`, I10), y toda autorización la resolvió
 * `getPropsEditor` server-side (D6). Tras cada mutación exitosa el iframe de preview se RECARGA (D7).
 *
 * F11: el editor pasa a DOCK (patrón de la UI v2 de grillos-ai). El contenido principal es la preview;
 * a la derecha, paneles hermanos (Secciones/Agregar/Editar/Tema/Historial) como cartas resizables con
 * colapso a rail. El estado del dock (cuáles abiertos + ancho) vive acá.
 */

type DockKey = "secciones" | "agregar" | "editar" | "tema" | "historial";

const RAIL: Record<DockKey, string> = {
  secciones: "Secciones",
  agregar: "Agregar",
  editar: "Editar",
  tema: "Tema",
  historial: "Historial",
};

const ANCHO_INICIAL: Record<DockKey, number> = {
  secciones: 320,
  agregar: 380,
  editar: 400,
  tema: 340,
  historial: 340,
};

export function EditorPageBuilder({
  slug,
  previewToken,
  branding,
}: {
  slug: string;
  previewToken: string | null;
  branding: { colorPrimario: string | null; nombre: string; descripcion: string | null };
}) {
  const [version, setVersion] = useState<number | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // fuerza el reload del iframe
  const [seleccion, setSeleccion] = useState<string | null>(null); // id de la sección seleccionada
  const [viewport, setViewport] = useState<"escritorio" | "movil">("escritorio");
  const [confirmPublicar, setConfirmPublicar] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Estado del dock (F11) ────────────────────────────────────────────
  const [abiertos, setAbiertos] = useState<Record<DockKey, boolean>>({
    secciones: true,
    agregar: false,
    editar: false,
    tema: false,
    historial: false,
  });
  const [anchos, setAnchos] = useState<Record<DockKey, number>>(ANCHO_INICIAL);
  const abrir = useCallback((k: DockKey) => setAbiertos((s) => ({ ...s, [k]: true })), []);
  const colapsar = useCallback((k: DockKey) => setAbiertos((s) => ({ ...s, [k]: false })), []);

  const borrador = api.pagebuilder.getBorrador.useQuery(undefined, { retry: false });
  const utils = api.useUtils();

  useEffect(() => {
    if (borrador.data) setVersion(borrador.data.version);
  }, [borrador.data]);

  const recargarPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  const mutar = api.pagebuilder.mutar.useMutation({
    onSuccess: (res) => {
      setVersion(res.version);
      recargarPreview();
      void utils.pagebuilder.getBorrador.invalidate();
    },
    onError: (e) => {
      if (e.data?.code === "CONFLICT") {
        notifications.show({
          color: "yellow",
          title: "Se editó en otra parte",
          message: "Recargamos tus cambios más recientes.",
        });
        void borrador.refetch();
      } else {
        notifications.show({ color: "red", title: "No se pudo aplicar", message: e.message });
      }
    },
  });

  /** Aplica una mutación con el expectedVersion actual (lock optimista). Deshabilitado si no hay version. */
  const aplicar = useCallback(
    (mutacion: MutacionPagina) => {
      if (version === null) return;
      mutar.mutate({ mutacion, expectedVersion: version });
    },
    [version, mutar],
  );

  /** Agregar una sección desde la galería (add_section con los defaultProps del registro). */
  const agregarSeccion = useCallback(
    (tipo: WidgetTipo) => aplicar({ accion: "add_section", tipo }),
    [aplicar],
  );

  const publicar = api.pagebuilder.publicar.useMutation({
    onSuccess: () => {
      setConfirmPublicar(false);
      notifications.show({ color: "teal", title: "¡Publicado!", message: "Tu tienda ya muestra los cambios." });
      void utils.pagebuilder.getBorrador.invalidate();
    },
    onError: (e) => {
      setConfirmPublicar(false);
      notifications.show({ color: "red", title: "No se pudo publicar", message: e.message });
    },
  });

  /** Scroll del iframe (same-origin) al nodo + abre su panel de edición (D7). */
  const irASeccion = useCallback(
    (id: string) => {
      setSeleccion(id);
      abrir("editar");
      const doc = iframeRef.current?.contentWindow?.document;
      doc?.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [abrir],
  );

  const documento = borrador.data?.documento ?? null;
  const publicado = borrador.data?.publicado ?? false;
  const previewSrc = previewToken ? `/?preview=${encodeURIComponent(previewToken)}` : "/";
  const seccionSel = documento?.secciones.find((s) => s.id === seleccion) ?? null;

  // TenantBranding para las previews de la galería (subconjunto público + fallbacks nulos).
  const brandingPreview: TenantBranding = {
    nombre: branding.nombre,
    slug,
    descripcion: branding.descripcion,
    logoUrl: null,
    colorPrimario: branding.colorPrimario,
    heroTitulo: null,
    heroSubtitulo: null,
    heroImageUrl: null,
    avisoTexto: null,
    instagramUrl: null,
    tiktokUrl: null,
    whatsappUrl: null,
    contactoEmail: null,
  };
  const enUso = new Set<WidgetTipo>(documento?.secciones.map((s) => s.tipo) ?? []);

  // ── Descriptores de los paneles del dock (orden fijo) ────────────────
  const cuerpo: Record<DockKey, ReactNode> = {
    secciones: documento ? (
      <PanelSecciones
        documento={documento}
        seleccion={seleccion}
        onSeleccionar={irASeccion}
        onAplicar={aplicar}
        onAbrirGaleria={() => abrir("agregar")}
      />
    ) : (
      <Loader size="sm" m="md" />
    ),
    agregar: (
      <WidgetGallery slug={slug} branding={brandingPreview} enUso={enUso} onAgregar={agregarSeccion} />
    ),
    editar: seccionSel ? (
      <PanelEdicion
        slug={slug}
        nodo={seccionSel}
        onVolver={() => {
          setSeleccion(null);
          colapsar("editar");
        }}
        onAplicar={aplicar}
      />
    ) : (
      <Text p="md" size="sm" c="dimmed">
        Selecciona una sección de la lista para editar su contenido y estilo.
      </Text>
    ),
    tema: documento ? (
      <PanelTema
        tema={documento.root.props as Record<string, unknown>}
        onVolver={() => colapsar("tema")}
        onAplicar={aplicar}
      />
    ) : null,
    historial: (
      <PanelHistorial
        onVolver={() => colapsar("historial")}
        onRevertido={() => {
          colapsar("historial");
          recargarPreview();
          void utils.pagebuilder.getBorrador.invalidate();
        }}
      />
    ),
  };

  const titulo: Record<DockKey, string> = {
    secciones: "Secciones",
    agregar: "Agregar sección",
    editar: seccionSel ? WIDGET_META[seccionSel.tipo].titulo : "Editar",
    tema: "Tema de la página",
    historial: "Historial",
  };

  const orden: DockKey[] = ["secciones", "agregar", "editar", "tema", "historial"];
  const openDock: DockPanel[] = orden
    .filter((k) => abiertos[k])
    .map((k) => ({ key: k, title: titulo[k], railLabel: RAIL[k], width: anchos[k], render: () => cuerpo[k] }));
  const collapsedDock = orden
    .filter((k) => !abiertos[k])
    .map((k) => ({ key: k, railLabel: RAIL[k] }));

  const dockResize = (key: string, width: number) =>
    setAnchos((w) => ({ ...w, [key as DockKey]: width }));

  return (
    <Box style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Barra superior ─────────────────────────────────────────── */}
      <Group
        h={56}
        px="md"
        justify="space-between"
        wrap="nowrap"
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)", flex: "0 0 auto" }}
      >
        <Group gap="sm" wrap="nowrap">
          <Text fw={700}>Editar mi tienda</Text>
          {borrador.data &&
            (publicado ? (
              <Badge variant="light" color="teal" tt="none">Publicada</Badge>
            ) : (
              <Badge variant="light" color="gray" tt="none">Sin publicar</Badge>
            ))}
          {(mutar.isPending || borrador.isFetching) && <Loader size="xs" />}
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Tooltip label={viewport === "movil" ? "Ver en escritorio" : "Ver en móvil"}>
            <ActionIcon
              variant="default"
              aria-label="Cambiar tamaño de la vista previa"
              onClick={() => setViewport((v) => (v === "movil" ? "escritorio" : "movil"))}
            >
              {viewport === "movil" ? (
                <IconDeviceDesktop className="size-4" />
              ) : (
                <IconDeviceMobile className="size-4" />
              )}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Recargar preview">
            <ActionIcon variant="default" onClick={recargarPreview} aria-label="Recargar preview">
              <IconRefresh className="size-4" />
            </ActionIcon>
          </Tooltip>
          <Button
            component="a"
            href="/"
            target="_blank"
            variant="default"
            size="xs"
            leftSection={<IconExternalLink className="size-3.5" />}
          >
            Ver tienda
          </Button>
          <Button size="xs" onClick={() => setConfirmPublicar(true)} disabled={version === null}>
            Publicar
          </Button>
        </Group>
      </Group>

      {/* ── Cuerpo: preview (principal) + dock a la derecha ─────────── */}
      <Box style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--mantine-color-gray-1)",
            display: "flex",
            justifyContent: "center",
            overflow: "auto",
          }}
        >
          {borrador.isError ? (
            <Text p="md" c="red" size="sm">No pudimos cargar tu página. Recarga la ventana.</Text>
          ) : (
            <iframe
              key={previewKey}
              ref={iframeRef}
              src={previewSrc}
              title="Vista previa de tu tienda"
              style={{
                width: viewport === "movil" ? 390 : "100%",
                maxWidth: viewport === "movil" ? 390 : undefined,
                height: "100%",
                border: "none",
                background: "var(--mantine-color-body)",
                boxShadow: viewport === "movil" ? "var(--mantine-shadow-md)" : undefined,
              }}
            />
          )}
        </Box>

        <PanelDock
          open={openDock}
          collapsed={collapsedDock}
          onResize={dockResize}
          onCollapse={(k) => colapsar(k as DockKey)}
          onExpand={(k) => abrir(k as DockKey)}
        />
      </Box>

      {/* ── Confirmar publicación (acción humana explícita, I6) ──────── */}
      <Modal opened={confirmPublicar} onClose={() => setConfirmPublicar(false)} title="Publicar los cambios" centered>
        <Stack gap="md">
          <Text size="sm">
            Tu tienda mostrará todos los cambios del borrador a quienes la visiten. ¿Publicar ahora?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmPublicar(false)}>Cancelar</Button>
            <Button
              loading={publicar.isPending}
              onClick={() => publicar.mutate({ expectedVersion: version ?? undefined })}
            >
              Publicar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
