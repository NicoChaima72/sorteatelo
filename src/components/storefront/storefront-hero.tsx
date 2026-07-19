import {
  Badge,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBolt,
  IconShieldCheck,
  IconSparkles,
  IconTicket,
} from "@tabler/icons-react";

import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema, type HeroProps } from "~/lib/pagebuilder/widgets";
import { gradienteTematico, type TenantBranding } from "~/styles/tenantTheme";

/**
 * Hero del page builder (widget `hero` v2, catálogo-v2 F05; base F05/ADR-0016, plantilla-rica F04,
 * design.md §5.1 pto 2). Las props vienen del Documento; el `branding` aporta los FALLBACKS resueltos
 * server-side (NO se copian al documento, I2/I11). La `variante` decide el layout: `split` (v1: texto
 * izquierda + visual derecha — DEFAULT que conserva el look), `centrado` (texto centrado sin visual),
 * `imagen_fondo` (imagen full-bleed con overlay + texto encima) y `minimal` (titular + CTA compacto).
 * CTA principal con pulso CSS (F03) + `ctaSecundario` opcional. Cero hex inline (§9): imagen ausente ⇒
 * gradiente temático.
 */

/** Badges de confianza — copy FIJO de plataforma (design.md §5.1 pto 2). */
const BADGES_CONFIANZA = [
  { icon: IconShieldCheck, texto: "Compra segura" },
  { icon: IconBolt, texto: "Entrega al instante" },
  { icon: IconTicket, texto: "Tu ticket al toque" },
] as const;

function anclaHref(ancla: string): string {
  return ancla === "sorteo" ? "#sorteo" : "#catalogo";
}

export function StorefrontHero({
  nodo,
  branding,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "hero" }>;
  branding: TenantBranding;
  divisorColor?: string;
}) {
  const props = nodo.props;

  if (props.variante === "imagen_fondo") {
    return <HeroImagenFondo nodo={nodo} branding={branding} divisorColor={divisorColor} />;
  }
  if (props.variante === "split") {
    return <HeroSplit nodo={nodo} branding={branding} divisorColor={divisorColor} />;
  }
  // centrado | minimal
  return (
    <HeroCentrado
      nodo={nodo}
      branding={branding}
      divisorColor={divisorColor}
      minimal={props.variante === "minimal"}
    />
  );
}

// ── Piezas compartidas ─────────────────────────────────────────────────────────

function EyebrowSorteo({ mostrar }: { mostrar: boolean }) {
  const sorteo = useSorteoActivo();
  if (!sorteo.data || !mostrar) return null;
  return (
    <Badge
      variant="light"
      size="lg"
      radius="sm"
      leftSection={<IconSparkles className="size-3.5" stroke={2} />}
      styles={{ root: { width: "fit-content" }, label: { textTransform: "none" } }}
    >
      Sorteo abierto
    </Badge>
  );
}

function Ctas({ props, oscuro }: { props: HeroProps; oscuro?: boolean }) {
  const ctaTexto = props.ctaTexto ?? "Ver el catálogo";
  return (
    <Group gap="sm">
      <Button
        component="a"
        href={anclaHref(props.ctaAncla)}
        size="md"
        radius="md"
        variant={oscuro ? "white" : "filled"}
        className="animar-pulso-cta"
      >
        {ctaTexto}
      </Button>
      {props.ctaSecundario && (
        <Button
          component="a"
          href={anclaHref(props.ctaSecundario.ancla)}
          size="md"
          radius="md"
          variant={oscuro ? "outline" : "default"}
          c={oscuro ? "white" : undefined}
          styles={oscuro ? { root: { borderColor: "var(--mantine-color-white)" } } : undefined}
        >
          {props.ctaSecundario.texto}
        </Button>
      )}
    </Group>
  );
}

function TrustBadges() {
  return (
    <Group gap="lg" mt="xs" wrap="wrap">
      {BADGES_CONFIANZA.map(({ icon: Icon, texto }) => (
        <Group key={texto} gap={6} wrap="nowrap">
          <Icon className="size-4" stroke={1.75} color="var(--mantine-primary-color-filled)" />
          <Text size="sm" c="dimmed">
            {texto}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

/**
 * Imagen de hero del documento, o un gradiente temático si no hay (degradación elegante §5.2). Con
 * `imagenUrl` presente usa `<ImagenConFallback>` ⇒ una URL colgada (asset borrado, D11) degrada al
 * gradiente tematizado + ícono, NUNCA un `<img>` roto (I-G). Sin URL ⇒ el gradiente directo.
 */
function HeroVisual({
  imagenUrl,
  alt,
  colorPrimario,
}: {
  imagenUrl: string | null;
  alt: string;
  colorPrimario: string | null;
}) {
  const base = {
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: "var(--mantine-radius-lg)",
  } as const;
  if (imagenUrl) {
    return (
      <ImagenConFallback
        src={imagenUrl}
        alt={alt}
        colorPrimario={colorPrimario}
        style={{ ...base, objectFit: "cover", display: "block" }}
      />
    );
  }
  return <Box aria-hidden style={{ ...base, background: gradienteTematico(colorPrimario) }} />;
}

// ── Variantes ───────────────────────────────────────────────────────────────

/** `split` (v1): texto izquierda + visual derecha. Idéntico al hero previo a catálogo-v2 (I-H). */
function HeroSplit({
  nodo,
  branding,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "hero" }>;
  branding: TenantBranding;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const titulo = props.titulo ?? branding.nombre;
  const subtitulo = props.subtitulo ?? branding.descripcion;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "xl", md: 48 }} style={{ alignItems: "center" }}>
        <Stack gap="lg">
          <EyebrowSorteo mostrar={props.mostrarBadgeSorteo} />
          <Title order={1} fz={{ base: 32, sm: 44 }} lh={1.1} fw={800}>
            {titulo}
          </Title>
          {subtitulo && (
            <Text size="lg" c="dimmed" maw={520}>
              {subtitulo}
            </Text>
          )}
          <Ctas props={props} />
          <TrustBadges />
        </Stack>
        <HeroVisual imagenUrl={props.imagenUrl ?? null} alt={branding.nombre} colorPrimario={branding.colorPrimario} />
      </SimpleGrid>
    </SeccionWrapper>
  );
}

/** `centrado` (texto centrado sin visual) / `minimal` (compacto: sin eyebrow, subtítulo ni badges). */
function HeroCentrado({
  nodo,
  branding,
  divisorColor,
  minimal,
}: {
  nodo: Extract<SeccionNode, { tipo: "hero" }>;
  branding: TenantBranding;
  divisorColor?: string;
  minimal: boolean;
}) {
  const props = nodo.props;
  const titulo = props.titulo ?? branding.nombre;
  const subtitulo = props.subtitulo ?? branding.descripcion;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg" align="center" ta="center" maw={720} mx="auto">
        {!minimal && <EyebrowSorteo mostrar={props.mostrarBadgeSorteo} />}
        <Title order={1} fz={{ base: minimal ? 28 : 34, sm: minimal ? 40 : 48 }} lh={1.1} fw={800}>
          {titulo}
        </Title>
        {subtitulo && (
          <Text size="lg" c="dimmed" maw={560}>
            {subtitulo}
          </Text>
        )}
        <Ctas props={props} />
        {!minimal && <TrustBadges />}
      </Stack>
    </SeccionWrapper>
  );
}

/** `imagen_fondo`: imagen full-bleed con overlay `tinta` (opacidad = `overlayOscuridad`) + texto claro. */
function HeroImagenFondo({
  nodo,
  branding,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "hero" }>;
  branding: TenantBranding;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const titulo = props.titulo ?? branding.nombre;
  const subtitulo = props.subtitulo ?? branding.descripcion;
  // El fondo lo maneja el widget: imagen con overlay (contraste garantizado, texto claro emparejado) o
  // gradiente de marca sin imagen (degradación, I-G). `nodo.estilo` explícito gana.
  const estilo =
    nodo.estilo ??
    EstiloSeccionSchema.parse({
      fondo: props.imagenUrl
        ? { tipo: "imagen", url: props.imagenUrl, overlay: "tinta", opacidadOverlay: props.overlayOscuridad }
        : { tipo: "gradiente", preset: "marca_vivo" },
      padY: "xl",
    });
  return (
    <SeccionWrapper id={nodo.id} estilo={estilo} divisorColor={divisorColor}>
      <Stack gap="lg" align="center" ta="center" maw={760} mx="auto" style={{ paddingBlock: 24 }}>
        <EyebrowSorteo mostrar={props.mostrarBadgeSorteo} />
        <Title order={1} fz={{ base: 34, sm: 52 }} lh={1.1} fw={800} c="inherit">
          {titulo}
        </Title>
        {subtitulo && (
          <Text fz={{ base: "md", sm: "lg" }} c="inherit" opacity={0.92} maw={620}>
            {subtitulo}
          </Text>
        )}
        <Ctas props={props} oscuro />
      </Stack>
    </SeccionWrapper>
  );
}
