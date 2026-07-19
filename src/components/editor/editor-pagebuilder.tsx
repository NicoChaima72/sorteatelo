import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
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
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelEdicion } from "~/components/editor/panel-edicion";
import { PanelHistorial } from "~/components/editor/panel-historial";
import { PanelSecciones } from "~/components/editor/panel-secciones";
import { PanelTema } from "~/components/editor/panel-tema";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { api } from "~/utils/api";

/**
 * Editor visual del page builder (catálogo-v2 F09/F10, ADR-0016). Superficie, NO dominio (I-I): CERO
 * regla de negocio acá — toda mutación pasa por `api.pagebuilder.mutar` (que delega en
 * `aplicarMutacionPagina`, el MISMO use case del MCP) con el lock optimista (`expectedVersion`, I10), y
 * toda autorización la resolvió `getPropsEditor` server-side (D6). Tras cada mutación exitosa el iframe
 * de preview se RECARGA (v1 sin postMessage, D7). Un `CONFLICT` (otro editó) ⇒ recarga el borrador.
 */
export function EditorPageBuilder({
  slug,
  previewToken,
}: {
  slug: string;
  previewToken: string | null;
}) {
  const [version, setVersion] = useState<number | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // fuerza el reload del iframe
  const [seleccion, setSeleccion] = useState<string | null>(null); // id de la sección seleccionada
  const [panelExtra, setPanelExtra] = useState<"tema" | "historial" | null>(null);
  const [viewport, setViewport] = useState<"escritorio" | "movil">("escritorio");
  const [confirmPublicar, setConfirmPublicar] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  /** Scroll del iframe (same-origin) al nodo seleccionado — el SeccionWrapper emite el id DOM (D7). */
  const irASeccion = useCallback((id: string) => {
    setSeleccion(id);
    const doc = iframeRef.current?.contentWindow?.document;
    doc?.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const documento = borrador.data?.documento ?? null;
  const publicado = borrador.data?.publicado ?? false;
  const previewSrc = previewToken ? `/?preview=${encodeURIComponent(previewToken)}` : "/";
  const seccionSel = documento?.secciones.find((s) => s.id === seleccion) ?? null;

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
          <SegmentedControl
            size="xs"
            aria-label="Tamaño de la vista previa"
            value={viewport}
            onChange={(v) => setViewport(v as "escritorio" | "movil")}
            data={[
              { value: "escritorio", label: <IconDeviceDesktop className="size-4" role="img" aria-label="Escritorio" /> },
              { value: "movil", label: <IconDeviceMobile className="size-4" role="img" aria-label="Móvil" /> },
            ]}
          />
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

      {/* ── Cuerpo: panel + preview ─────────────────────────────────── */}
      <Box style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box
          w={400}
          style={{ borderRight: "1px solid var(--mantine-color-default-border)", flex: "0 0 auto", minHeight: 0 }}
        >
          <ScrollArea h="100%" type="scroll">
            {borrador.isLoading ? (
              <Group justify="center" p="xl"><Loader /></Group>
            ) : borrador.isError ? (
              <Text p="md" c="red" size="sm">No pudimos cargar tu página. Recarga la ventana.</Text>
            ) : panelExtra === "tema" && documento ? (
              <PanelTema
                tema={documento.root.props as Record<string, unknown>}
                onVolver={() => setPanelExtra(null)}
                onAplicar={aplicar}
              />
            ) : panelExtra === "historial" ? (
              <PanelHistorial
                onVolver={() => setPanelExtra(null)}
                onRevertido={() => {
                  setPanelExtra(null);
                  recargarPreview();
                  void utils.pagebuilder.getBorrador.invalidate();
                }}
              />
            ) : seccionSel ? (
              <PanelEdicion
                slug={slug}
                nodo={seccionSel}
                onVolver={() => setSeleccion(null)}
                onAplicar={aplicar}
              />
            ) : (
              documento && (
                <PanelSecciones
                  documento={documento}
                  seleccion={seleccion}
                  onSeleccionar={irASeccion}
                  onAplicar={aplicar}
                  onEditarTema={() => setPanelExtra("tema")}
                  onVerHistorial={() => setPanelExtra("historial")}
                />
              )
            )}
          </ScrollArea>
        </Box>

        <Box style={{ flex: 1, minWidth: 0, background: "var(--mantine-color-gray-1)", display: "flex", justifyContent: "center", overflow: "auto" }}>
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
        </Box>
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
