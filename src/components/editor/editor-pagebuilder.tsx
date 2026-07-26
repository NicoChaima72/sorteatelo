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
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCheck,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { PanelAsistente } from "~/components/editor/panel-asistente";
import { PanelChrome } from "~/components/editor/panel-chrome";
import { PanelDock, type DockPanel } from "~/components/editor/panel-dock";
import { PanelEdicion } from "~/components/editor/panel-edicion";
import { PanelHistorial } from "~/components/editor/panel-historial";
import { PanelPaginas } from "~/components/editor/panel-paginas";
import { PanelSecciones } from "~/components/editor/panel-secciones";
import { PanelTema } from "~/components/editor/panel-tema";
import { WidgetGallery } from "~/components/editor/widget-gallery";
import { validarMensajeInline } from "~/components/storefront/use-inline-edit";
import { TIPO_PATCH } from "~/components/storefront/use-preview-patch";
import {
  crearStack,
  deshacer,
  registrar,
  rehacer,
  type StackSnapshots,
} from "~/lib/pagebuilder/historial-edicion";
import { WIDGET_META, type WidgetTipo } from "~/lib/pagebuilder/widgets";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";
import { type PageDocument } from "~/lib/pagebuilder/schema";
import { type TenantBranding } from "~/styles/tenantTheme";
import { api } from "~/utils/api";

/**
 * Mutaciones que RECARGAN el iframe en vez de patchear en vivo (F09/D13): cambian el chrome/provider a
 * nivel de página (modo oscuro, tipografía) o reemplazan el documento entero ⇒ el patch por postMessage
 * (que solo re-renderiza el árbol del documento) no basta. El resto patchea en vivo (scroll intacto).
 */
const MUTACIONES_QUE_RECARGAN = new Set<MutacionPagina["accion"]>([
  "set_theme",
  "set_page_theme",
  "apply_page",
]);

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

type DockKey = "paginas" | "secciones" | "agregar" | "editar" | "tema" | "chrome" | "historial" | "asistente";

const RAIL: Record<DockKey, string> = {
  paginas: "Páginas",
  secciones: "Secciones",
  agregar: "Agregar",
  editar: "Editar",
  tema: "Tema",
  chrome: "Chrome",
  historial: "Historial",
  asistente: "Asistente",
};

const ANCHO_INICIAL: Record<DockKey, number> = {
  paginas: 300,
  secciones: 320,
  agregar: 380,
  editar: 400,
  tema: 340,
  chrome: 360,
  historial: 340,
  asistente: 380,
};

export function EditorPageBuilder({
  slug,
  previewToken,
  branding,
}: {
  slug: string;
  previewToken: string | null;
  branding: {
    colorPrimario: string | null;
    colorAcento: string | null;
    nombre: string;
    descripcion: string | null;
  };
}) {
  const router = useRouter();
  // Página en edición (Tanda 3 F05): sale de `?pagina=<slug>` (fuente única, deep-linkeable). Sin query ⇒
  // `home`. El switcher hace `router.replace` shallow ⇒ cambia el slug sin reload de la página del editor.
  const paginaSlug =
    typeof router.query.pagina === "string" && router.query.pagina.length > 0
      ? router.query.pagina
      : "home";
  const [version, setVersion] = useState<number | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // fuerza el reload del iframe
  const [seleccion, setSeleccion] = useState<string | null>(null); // id de la sección seleccionada
  const [viewport, setViewport] = useState<"escritorio" | "movil">("escritorio");
  const [confirmPublicar, setConfirmPublicar] = useState(false);
  const [guardadoFlash, setGuardadoFlash] = useState(false); // "Guardado" tras un auto-save (F10)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const guardadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (guardadoTimer.current) clearTimeout(guardadoTimer.current); }, []);

  // ── Undo/redo (F13/D20): snapshot-stack LOCAL (memoria; se pierde al recargar — MVP). Publicar/rollback
  // NUNCA participan. `docActualRef` = último documento aplicado; `docAntesRef` = el previo a la mutación en
  // curso (para empujarlo al stack en onSuccess); `navRef` = stack pendiente cuando la mutación EN CURSO es
  // un undo/redo (apply_page de un snapshot) ⇒ en onSuccess NO se registra (es navegación, no edición).
  const stackRef = useRef<StackSnapshots<PageDocument>>(crearStack<PageDocument>());
  const docActualRef = useRef<PageDocument | null>(null);
  const docAntesRef = useRef<PageDocument | null>(null);
  const navRef = useRef<StackSnapshots<PageDocument> | null>(null);
  const [puedeUndo, setPuedeUndo] = useState(false);
  const [puedeRedo, setPuedeRedo] = useState(false);
  const sincronizarBotones = useCallback(() => {
    setPuedeUndo(stackRef.current.pasado.length > 0);
    setPuedeRedo(stackRef.current.futuro.length > 0);
  }, []);

  // ── Estado del dock (F11) ────────────────────────────────────────────
  const [abiertos, setAbiertos] = useState<Record<DockKey, boolean>>({
    paginas: false,
    secciones: true,
    agregar: false,
    editar: false,
    tema: false,
    chrome: false,
    historial: false,
    asistente: false,
  });
  const [anchos, setAnchos] = useState<Record<DockKey, number>>(ANCHO_INICIAL);
  const abrir = useCallback((k: DockKey) => setAbiertos((s) => ({ ...s, [k]: true })), []);
  const colapsar = useCallback((k: DockKey) => setAbiertos((s) => ({ ...s, [k]: false })), []);

  const borrador = api.pagebuilder.getBorrador.useQuery({ slug: paginaSlug }, { retry: false });
  // ¿Está configurado el asistente de IA (F14)? Sin API key ⇒ el panel no se ofrece (fail-soft, D21).
  const asistenteDisp = api.pagebuilder.asistenteDisponible.useQuery(undefined, { retry: false });
  const utils = api.useUtils();

  useEffect(() => {
    if (borrador.data) {
      setVersion(borrador.data.version);
      // Sincroniza el documento actual del stack de undo (F13) con el borrador persistido (fuente de verdad
      // tras invalidate/refetch). Sin esto un undo tras un refetch usaría un doc stale.
      docActualRef.current = borrador.data.documento;
    }
  }, [borrador.data]);

  const recargarPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  // Al cambiar de página (F05): resetea el lock (el version del nuevo borrador llega con su refetch) y
  // recarga la preview sobre la página nueva. El getBorrador ya refetchea solo (su input incluye el slug).
  // El stack de undo (F13) también se reinicia — es por página (no cruza páginas).
  useEffect(() => {
    setVersion(null);
    setSeleccion(null);
    stackRef.current = crearStack<PageDocument>();
    docActualRef.current = null;
    docAntesRef.current = null;
    navRef.current = null;
    sincronizarBotones();
    recargarPreview();
  }, [paginaSlug, recargarPreview, sincronizarBotones]);

  /** Cambia la página en edición (switcher del panel Páginas): actualiza `?pagina=` shallow. */
  const cambiarPagina = useCallback(
    (slug: string) => {
      void router.replace(
        { pathname: "/editor", query: slug === "home" ? {} : { pagina: slug } },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  /** Patch en vivo del preview (F09/D13): envía el documento nuevo al iframe (same-origin), que lo
   *  re-valida con Zod y re-renderiza sin reload. Si el iframe aún no cargó, el patch se pierde y la
   *  invalidación posterior mantiene el editor coherente (el usuario ve el estado en el próximo render). */
  const patchearPreview = useCallback((documento: PageDocument) => {
    iframeRef.current?.contentWindow?.postMessage(
      { tipo: TIPO_PATCH, documento },
      window.location.origin, // targetOrigin = el propio (el iframe es same-origin, I-T5)
    );
  }, []);

  const mutar = api.pagebuilder.mutar.useMutation({
    onSuccess: (res, variables) => {
      setVersion(res.version);
      const esNavegacion = navRef.current !== null;
      if (esNavegacion) {
        // Undo/redo (F13/D20): adopta el stack pendiente y NO registra (es navegación, no edición nueva).
        // Patch en vivo aunque sea `apply_page` (el snapshot es un doc que el editor ya renderizó).
        stackRef.current = navRef.current!;
        navRef.current = null;
        patchearPreview(res.documento);
      } else {
        // Edición normal: empuja el estado PREVIO al stack de undo (si lo había).
        if (docAntesRef.current) {
          stackRef.current = registrar(stackRef.current, docAntesRef.current);
        }
        // Patch en vivo salvo las mutaciones que exigen reload (tema/apply_page, D13).
        if (MUTACIONES_QUE_RECARGAN.has(variables.mutacion.accion)) recargarPreview();
        else patchearPreview(res.documento);
      }
      docActualRef.current = res.documento;
      docAntesRef.current = null;
      sincronizarBotones();
      // Indicador de auto-guardado (F10/D14): "Guardado" por ~1.6s tras cada mutación exitosa.
      setGuardadoFlash(true);
      if (guardadoTimer.current) clearTimeout(guardadoTimer.current);
      guardadoTimer.current = setTimeout(() => setGuardadoFlash(false), 1600);
      void utils.pagebuilder.getBorrador.invalidate();
    },
    onError: (e) => {
      navRef.current = null; // un undo/redo fallido no debe dejar el stack a medio navegar
      docAntesRef.current = null;
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

  /** Aplica una mutación con el expectedVersion actual (lock optimista). Deshabilitado si no hay version.
   *  Captura el documento PREVIO (docAntesRef) para el stack de undo (F13). */
  const aplicar = useCallback(
    (mutacion: MutacionPagina) => {
      if (version === null) return;
      docAntesRef.current = docActualRef.current;
      mutar.mutate({ mutacion, expectedVersion: version, slug: paginaSlug });
    },
    [version, mutar, paginaSlug],
  );

  /** Deshace la última edición: aplica el snapshot previo del stack vía `apply_page` (re-valida, I3). */
  const deshacerEdicion = useCallback(() => {
    if (version === null || docActualRef.current === null || mutar.isPending) return;
    const r = deshacer(stackRef.current, docActualRef.current);
    if (!r) return;
    navRef.current = r.stack;
    mutar.mutate({
      mutacion: { accion: "apply_page", documento: r.snapshot },
      expectedVersion: version,
      slug: paginaSlug,
    });
  }, [version, mutar, paginaSlug]);

  /** Rehace la última edición deshecha (espejo de `deshacerEdicion`). */
  const rehacerEdicion = useCallback(() => {
    if (version === null || docActualRef.current === null || mutar.isPending) return;
    const r = rehacer(stackRef.current, docActualRef.current);
    if (!r) return;
    navRef.current = r.stack;
    mutar.mutate({
      mutacion: { accion: "apply_page", documento: r.snapshot },
      expectedVersion: version,
      slug: paginaSlug,
    });
  }, [version, mutar, paginaSlug]);

  /** Agregar una sección desde la galería (add_section con los defaultProps del registro). */
  const agregarSeccion = useCallback(
    (tipo: WidgetTipo) => aplicar({ accion: "add_section", tipo }),
    [aplicar],
  );

  // Segundo color de marca (builder-tanda-1 F01/D2): vive en `Tenant.colorAcento`, FUERA del documento.
  // Al cambiarlo el theme cambia (CSS vars --mantine-color-acento-*) ⇒ hay que RECARGAR la preview (no
  // se puede patchear en vivo por postMessage, que solo re-renderiza el documento — D13).
  const acento = api.pagebuilder.setColorAcento.useMutation({
    onSuccess: () => {
      recargarPreview();
      notifications.show({
        color: "teal",
        title: "Color de acento aplicado",
        message: "Actualizamos tu vista previa.",
      });
    },
    onError: (e) =>
      notifications.show({ color: "red", title: "No se pudo aplicar el acento", message: e.message }),
  });

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

  /**
   * El asistente de IA (F14) ya aplicó sus mutaciones al borrador server-side; acá se sincroniza el editor:
   * empuja el doc PREVIO al undo-stack (F13 — un undo revierte todo el turno del asistente), avanza
   * version/docActual, patchea el preview en vivo e invalida el borrador. Publicar sigue humano (I-U6).
   */
  const aplicarDesdeAsistente = useCallback(
    (documento: PageDocument, version: number) => {
      if (docActualRef.current) stackRef.current = registrar(stackRef.current, docActualRef.current);
      docActualRef.current = documento;
      setVersion(version);
      sincronizarBotones();
      patchearPreview(documento);
      void utils.pagebuilder.getBorrador.invalidate();
    },
    [patchearPreview, sincronizarBotones, utils],
  );

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

  // Edición inline (F12/D19): el runtime del preview (en el iframe) postMessage-a el cambio de un campo
  // plano; el editor lo RE-VALIDA (origin + shape + campo permitido, jamás confía) y lo aplica por la
  // mutación normal `update_section_props` (el server revalida el documento entero, I3). El editor y el
  // iframe son same-origin ⇒ el mensaje llega a `window` de este componente.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const inline = validarMensajeInline({ origin: e.origin, data: e.data }, window.location.origin);
      if (inline) {
        aplicar({
          accion: "update_section_props",
          id: inline.nodoId,
          props: { [inline.campo]: inline.valor.length > 0 ? inline.valor : undefined },
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [aplicar]);

  // Atajos de teclado (F13/D20): Ctrl/Cmd+Z deshace, Ctrl/Cmd+Shift+Z (o Ctrl+Y) rehace, Ctrl/Cmd+D
  // duplica la sección seleccionada. Se IGNORAN cuando el foco está en un campo editable (input/textarea/
  // contenteditable) para no pisar el undo NATIVO del texto que el usuario está escribiendo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        deshacerEdicion();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        rehacerEdicion();
      } else if (k === "d" && seleccion) {
        e.preventDefault();
        aplicar({ accion: "duplicate_section", id: seleccion });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deshacerEdicion, rehacerEdicion, aplicar, seleccion]);

  const documento = borrador.data?.documento ?? null;
  const publicado = borrador.data?.publicado ?? false;
  // Preview de la página en edición (F05): home ⇒ `/`, otra página ⇒ `/<slug>`. Con token ⇒ sirve el borrador.
  const rutaPagina = paginaSlug === "home" ? "/" : `/${paginaSlug}`;
  const previewSrc = previewToken
    ? `${rutaPagina}?preview=${encodeURIComponent(previewToken)}`
    : rutaPagina;
  const seccionSel = documento?.secciones.find((s) => s.id === seleccion) ?? null;

  // TenantBranding para las previews de la galería (subconjunto público + fallbacks nulos).
  const brandingPreview: TenantBranding = {
    nombre: branding.nombre,
    slug,
    descripcion: branding.descripcion,
    logoUrl: null,
    colorPrimario: branding.colorPrimario,
    colorAcento: branding.colorAcento,
    instagramUrl: null,
    tiktokUrl: null,
    whatsappUrl: null,
    contactoEmail: null,
  };
  const enUso = new Set<WidgetTipo>(documento?.secciones.map((s) => s.tipo) ?? []);

  // ── Descriptores de los paneles del dock (orden fijo) ────────────────
  const cuerpo: Record<DockKey, ReactNode> = {
    paginas: <PanelPaginas slugActual={paginaSlug} onSwitch={cambiarPagina} />,
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
      // `key` por id de sección (F10): al cambiar de sección el panel se RE-MONTA ⇒ estado local fresco.
      // Con auto-save esto es crítico — evita que el estado de la sección anterior se auto-guarde en la nueva.
      <PanelEdicion
        key={seccionSel.id}
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
        colorAcento={branding.colorAcento}
        onColorAcento={(hex) => acento.mutate({ colorAcento: hex })}
        aplicandoAcento={acento.isPending}
        onVolver={() => colapsar("tema")}
        onAplicar={aplicar}
      />
    ) : null,
    chrome: (
      <PanelChrome
        onGuardado={() => {
          recargarPreview();
          void utils.pagebuilder.getChrome.invalidate();
        }}
      />
    ),
    historial: (
      <PanelHistorial
        slug={paginaSlug}
        onVolver={() => colapsar("historial")}
        onRevertido={() => {
          colapsar("historial");
          recargarPreview();
          void utils.pagebuilder.getBorrador.invalidate();
        }}
      />
    ),
    asistente: (
      <PanelAsistente slug={paginaSlug} seleccionId={seleccion} onAplicado={aplicarDesdeAsistente} />
    ),
  };

  const titulo: Record<DockKey, string> = {
    paginas: "Páginas",
    secciones: paginaSlug === "home" ? "Secciones" : `Secciones · /${paginaSlug}`,
    agregar: "Agregar sección",
    editar: seccionSel ? WIDGET_META[seccionSel.tipo].titulo : "Editar",
    tema: "Tema de la página",
    chrome: "Chrome (header/footer)",
    historial: "Historial",
    asistente: "Asistente",
  };

  // El "asistente" solo entra al dock si está configurado (F14/D21): sin API key ⇒ no se ofrece el panel.
  const ordenBase: DockKey[] = ["paginas", "secciones", "agregar", "editar", "tema", "chrome", "historial"];
  const orden: DockKey[] = asistenteDisp.data?.disponible
    ? [...ordenBase, "asistente"]
    : ordenBase;
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
          {/* Indicador de auto-guardado (F10/D14): Guardando… mientras la mutación viaja, Guardado al
              confirmar. Reemplaza los botones "Guardar" de los paneles. */}
          {mutar.isPending || borrador.isFetching ? (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">Guardando…</Text>
            </Group>
          ) : guardadoFlash ? (
            <Group gap={6} wrap="nowrap">
              <IconCheck className="size-3.5" style={{ color: "var(--mantine-color-teal-6)" }} />
              <Text size="xs" c="dimmed">Guardado</Text>
            </Group>
          ) : null}
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Tooltip label="Deshacer (Ctrl+Z)">
            <ActionIcon
              variant="default"
              aria-label="Deshacer"
              disabled={!puedeUndo}
              onClick={deshacerEdicion}
            >
              <IconArrowBackUp className="size-4" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Rehacer (Ctrl+Shift+Z)">
            <ActionIcon
              variant="default"
              aria-label="Rehacer"
              disabled={!puedeRedo}
              onClick={rehacerEdicion}
            >
              <IconArrowForwardUp className="size-4" />
            </ActionIcon>
          </Tooltip>
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
              onClick={() => publicar.mutate({ expectedVersion: version ?? undefined, slug: paginaSlug })}
            >
              Publicar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
