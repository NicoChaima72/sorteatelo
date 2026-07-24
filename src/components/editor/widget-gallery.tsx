import { Box, Button, Skeleton, Text, UnstyledButton } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CarritoProvider } from "~/components/storefront/carrito";
import { PreviewMuestraProvider } from "~/components/storefront/preview-muestra";
import { RenderSeccion } from "~/components/storefront/render-pagina";
import { SeccionNodeSchema, type SeccionNode } from "~/lib/pagebuilder/schema";
import {
  CATEGORIAS_WIDGET,
  CATEGORIAS_WIDGET_LABEL,
  TIPOS_SECCION,
  WIDGET_META,
  WIDGET_REGISTRY,
  type CategoriaWidgetUI,
  type WidgetTipo,
} from "~/lib/pagebuilder/widgets";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Catálogo VISUAL de widgets (catálogo-v2 F11, patrón WidgetGallery de la UI v2 de grillos-ai).
 * Reemplaza el modal de "agregar una sección" (que solo mostraba título + descripción) por PREVIEWS
 * REALES: cada ítem renderiza el componente REAL del widget con sus `defaultProps` + el branding del
 * tenant, escalado a 0.5 y recortado (nuestra degradación elegante hace que se vea bien sin assets). Los
 * widgets server-dependientes (contador/meta/vitrina/ganadores) usan DATOS DE MUESTRA vía
 * `PreviewMuestraProvider` — cero llamada a los use cases (I-I). Tabs de categoría (de `WIDGET_META`).
 *
 * Perf: cada preview se monta DIFERIDO (IntersectionObserver) ⇒ no se renderizan 25+ a la vez. Cada
 * preview va en un ErrorBoundary ⇒ un widget que falle no rompe la galería. `pointer-events:none` en la
 * miniatura (no es interactiva). Chrome de plataforma (tokens Mantine), sin libs nuevas.
 */

const ALTO_PREVIEW = 148;

/** Tabs de categoría (la meta-tab "todos" primero, luego las 5 categorías del enum). */
const TABS: (CategoriaWidgetUI | "todos")[] = ["todos", ...CATEGORIAS_WIDGET];

export function WidgetGallery({
  slug,
  branding,
  enUso,
  onAgregar,
}: {
  slug: string;
  branding: TenantBranding;
  /** Tipos de sección ya presentes en el borrador (para el hint "En uso"). */
  enUso: Set<WidgetTipo>;
  onAgregar: (tipo: WidgetTipo) => void;
}) {
  const [tab, setTab] = useState<CategoriaWidgetUI | "todos">("todos");
  const tipos = TIPOS_SECCION.filter(
    (t) => tab === "todos" || WIDGET_META[t].categoria === tab,
  );

  return (
    // Un solo par de providers para TODAS las previews: carrito (lo pide `catalogo`) + muestra de sorteo.
    <PreviewMuestraProvider>
      <CarritoProvider slug={slug}>
        <Box>
          <Tabs tab={tab} onTab={setTab} />
          <Box p="sm">
            {tipos.map((tipo) => (
              <ItemGaleria
                key={tipo}
                tipo={tipo}
                branding={branding}
                usado={enUso.has(tipo)}
                onAgregar={() => onAgregar(tipo)}
              />
            ))}
          </Box>
        </Box>
      </CarritoProvider>
    </PreviewMuestraProvider>
  );
}

/** Tabs de categoría tipo pills con scroll horizontal + fade a la derecha (coherente con el shell). */
function Tabs({
  tab,
  onTab,
}: {
  tab: CategoriaWidgetUI | "todos";
  onTab: (t: CategoriaWidgetUI | "todos") => void;
}) {
  return (
    <Box style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--mantine-color-body)" }} p="sm" pb="xs">
      <Box style={{ position: "relative" }}>
        <Box
          style={{
            display: "flex",
            gap: 4,
            overflowX: "auto",
            scrollbarWidth: "none",
            padding: 3,
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
          }}
        >
          {TABS.map((t) => {
            const activo = t === tab;
            return (
              <UnstyledButton
                key={t}
                onClick={() => onTab(t)}
                style={{
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  borderRadius: "var(--mantine-radius-sm)",
                  padding: "4px 12px",
                  fontSize: "var(--mantine-font-size-xs)",
                  fontWeight: 600,
                  color: activo ? "var(--mantine-primary-color-contrast)" : "var(--mantine-color-dimmed)",
                  background: activo ? "var(--mantine-primary-color-filled)" : "transparent",
                }}
              >
                {CATEGORIAS_WIDGET_LABEL[t]}
              </UnstyledButton>
            );
          })}
        </Box>
        {/* Fade a la derecha para insinuar el scroll horizontal. */}
        <Box
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            right: 3,
            width: 24,
            borderRadius: "0 var(--mantine-radius-md) var(--mantine-radius-md) 0",
            background: "linear-gradient(90deg, transparent, var(--mantine-color-body))",
            pointerEvents: "none",
          }}
        />
      </Box>
    </Box>
  );
}

/** Una tarjeta del catálogo: preview real (diferida) + pie con título + botón Agregar. */
function ItemGaleria({
  tipo,
  branding,
  usado,
  onAgregar,
}: {
  tipo: WidgetTipo;
  branding: TenantBranding;
  usado: boolean;
  onAgregar: () => void;
}) {
  const meta = WIDGET_META[tipo];
  return (
    <Box
      mb="sm"
      style={{
        overflow: "hidden",
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-md)",
      }}
    >
      <MontarAlVisible alto={ALTO_PREVIEW}>
        <PreviewBoundary fallback={<PreviewFallback titulo={meta.titulo} />}>
          <WidgetPreview tipo={tipo} branding={branding} />
        </PreviewBoundary>
      </MontarAlVisible>

      <Box
        p="xs"
        style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--mantine-color-default-border)" }}
      >
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={600} truncate>
            {meta.titulo}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {usado ? "En uso · puedes agregar otra" : meta.descripcion}
          </Text>
        </Box>
        <Button size="xs" leftSection={<IconPlus className="size-3.5" />} onClick={onAgregar}>
          Agregar
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Preview FIEL: renderiza el widget REAL escalado a 0.5 dentro de un contenedor de alto fijo con
 * overflow oculto (no un dibujito). `width:200%` (=1/0.5) compensa el scale para que ocupe el ancho.
 * `pointer-events:none`: la miniatura no es interactiva. El nodo se arma con los `defaultProps` del
 * registro parseados (mismo dato que "agregar"); el branding aporta la degradación tematizada.
 */
function WidgetPreview({ tipo, branding }: { tipo: WidgetTipo; branding: TenantBranding }) {
  const nodo = useMemo<SeccionNode>(
    () =>
      SeccionNodeSchema.parse({
        id: `preview-${tipo}`,
        tipo,
        v: WIDGET_REGISTRY[tipo].v,
        props: WIDGET_REGISTRY[tipo].defaultProps,
      }),
    [tipo],
  );

  return (
    <Box style={{ height: ALTO_PREVIEW, overflow: "hidden", pointerEvents: "none", background: "var(--mantine-color-body)" }}>
      <Box style={{ transform: "scale(0.5)", transformOrigin: "top left", width: "200%" }}>
        <RenderSeccion seccion={nodo} branding={branding} divisorColor="transparent" />
      </Box>
    </Box>
  );
}

/** Placeholder cuando una preview aún no entró al viewport (perf) o cuando falla (ErrorBoundary). */
function PreviewFallback({ titulo }: { titulo: string }) {
  return (
    <Box
      style={{ height: ALTO_PREVIEW, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--mantine-color-gray-0)" }}
    >
      <Text size="sm" c="dimmed" fw={600}>
        {titulo}
      </Text>
    </Box>
  );
}

/** Monta `children` solo cuando el contenedor entra (o casi) al viewport — no renderiza 25+ previews. */
function MontarAlVisible({ alto, children }: { alto: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return <div ref={ref}>{visible ? children : <Skeleton height={alto} radius={0} />}</div>;
}

/** ErrorBoundary por preview: un widget que falle en el árbol del editor muestra su título, no rompe todo. */
class PreviewBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
