import {
  Anchor,
  AspectRatio,
  Badge,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconBolt,
  IconShieldCheck,
  IconSparkles,
  IconTicket,
} from "@tabler/icons-react";

import { iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { MarcoHolo } from "~/components/storefront/marco-holo";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { TituloHero } from "~/components/storefront/titulo-hero";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import {
  EstiloSeccionSchema,
  type HeroProps,
  type HeroVisual,
} from "~/lib/pagebuilder/widgets";
import { gradienteTematico, type TenantBranding } from "~/styles/tenantTheme";

/**
 * Hero del page builder (widget `hero` v2, catálogo-v2 F05; base F05/ADR-0016, plantilla-rica F04,
 * design.md §5.1 pto 2). Las props vienen del Documento; el `branding` aporta los FALLBACKS resueltos
 * server-side (NO se copian al documento, I2/I11). La `variante` decide el layout: `split` (v1: texto
 * izquierda + visual derecha — DEFAULT que conserva el look), `centrado` (texto centrado sin visual),
 * `imagen_fondo` (imagen full-bleed con overlay + texto encima) y `minimal` (titular + CTA compacto).
 * CTA principal con pulso CSS + `ctaSecundario` opcional (botón o enlace, F03/D6). Cero hex inline
 * (§9): imagen ausente ⇒ gradiente temático.
 *
 * Puente builder-tanda-1 F03/D5/D6 (todo aditivo/opcional, un hero v2 sin estos campos no cambia): el
 * título pasa por `<TituloHero>` (acento seguro por substring + efectos SSR-visibles); `destacado`
 * pinta la cifra "$3.000 + nota"; `mostrarConfianza` togglea los trust badges; `ctaSecundarioEstilo`
 * elige botón|enlace. Nada de esto es HTML del tenant (I3): match por texto plano, estilo por token.
 */

/** Badges de confianza — copy FIJO de plataforma (design.md §5.1 pto 2). */
const BADGES_CONFIANZA = [
  { icon: IconShieldCheck, texto: "Compra segura" },
  { icon: IconBolt, texto: "Entrega al instante" },
  { icon: IconTicket, texto: "Tu ticket al toque" },
] as const;

// Cada valor de `CTA_ANCLAS` (catalogo/sorteo/como-funciona/autora/bases/preguntas, F05/D8) resuelve
// directo a su target de scroll `#<ancla>` emitido por `render-pagina` (nav.ts). Enum cerrado ⇒ nunca
// URL libre (I-A).
function anclaHref(ancla: string): string {
  return `#${ancla}`;
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

/**
 * Color del eyebrow por `eyebrowEstilo` (Tanda 2 F04/D4). `marca` (default) = token del primario
 * (comportamiento actual). `acento` = token de la escala acento con FALLBACK a marca (I-T2, degrada sin
 * acento). `texto` = color de texto heredado (sin color explícito). Cero hex (I-A).
 */
function colorEyebrow(estilo: HeroProps["eyebrowEstilo"]): string | undefined {
  switch (estilo) {
    case "acento":
      return "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";
    case "texto":
      return undefined; // hereda el color de texto del shell (dimmed lo aporta el <Text c>)
    case "marca":
    default:
      return "var(--mantine-primary-color-filled)";
  }
}

/**
 * Eyebrow de texto (F13/fidelidad; color por token en Tanda 2 F04): kicker pequeño en MAYÚSCULAS con
 * letter-spacing. El color sale de `eyebrowEstilo` (marca/acento/texto) — cero hex, tokens del tenant
 * (I-A). Texto plano (schema, nunca HTML del tenant, I3). El mockup lo usa como firma de autoría.
 */
function EyebrowTexto({ texto, estilo }: { texto: string; estilo: HeroProps["eyebrowEstilo"] }) {
  const color = colorEyebrow(estilo);
  return (
    <Text
      fw={700}
      size="sm"
      tt="uppercase"
      c={color ? undefined : "dimmed"}
      style={{ letterSpacing: "0.12em", ...(color ? { color } : {}) }}
    >
      {texto}
    </Text>
  );
}

/**
 * Kicker del hero: si el documento trae `eyebrow` explícito, gana (texto por token de `eyebrowEstilo`);
 * si no, cae al badge "Sorteo abierto" server-side (comportamiento previo, no-op sin eyebrow — I-H).
 */
function HeroEyebrow({ props }: { props: HeroProps }) {
  if (props.eyebrow) return <EyebrowTexto texto={props.eyebrow} estilo={props.eyebrowEstilo} />;
  return <EyebrowSorteo mostrar={props.mostrarBadgeSorteo} />;
}

function Ctas({ props, oscuro }: { props: HeroProps; oscuro?: boolean }) {
  const ctaTexto = props.ctaTexto ?? "Ver el catálogo";
  return (
    <Group gap="sm" align="center">
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
      {props.ctaSecundario &&
        (props.ctaSecundarioEstilo === "enlace" ? (
          // Estilo enlace (F03/D6): texto con subrayado + flecha, sin caja de botón.
          <Anchor
            component="a"
            href={anclaHref(props.ctaSecundario.ancla)}
            fw={600}
            underline="always"
            c={oscuro ? "white" : undefined}
          >
            <Group gap={4} wrap="nowrap" component="span">
              {props.ctaSecundario.texto}
              <IconArrowRight className="size-4" stroke={2} />
            </Group>
          </Anchor>
        ) : (
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
        ))}
    </Group>
  );
}

/**
 * Cifra/etiqueta destacada del hero (el "$3.000 + nota", F03/D6). Texto plano con límite (schema); la
 * cifra usa el token del PRIMARIO del tenant (F13 — el precio es un momento de marca; antes usaba el
 * token de acento, que con una paleta invertida —acento oscuro sobre fondo oscuro— quedaba de bajo
 * contraste) y `tabular-nums` (design.md §5, cifras monetarias alineadas). Cero hex inline (I-A).
 */
function Destacado({
  destacado,
  oscuro,
}: {
  destacado: NonNullable<HeroProps["destacado"]>;
  oscuro?: boolean;
}) {
  return (
    <Group gap="sm" align="baseline" wrap="nowrap">
      <Text
        span
        fw={800}
        fz={{ base: 28, sm: 34 }}
        c={oscuro ? "white" : undefined}
        style={{
          fontVariantNumeric: "tabular-nums",
          ...(oscuro ? {} : { color: "var(--mantine-primary-color-filled)" }),
        }}
      >
        {destacado.texto}
      </Text>
      {destacado.nota && (
        <Text span size="sm" c={oscuro ? "gray.3" : "dimmed"} maw={260} style={{ lineHeight: 1.3 }}>
          {destacado.nota}
        </Text>
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

/**
 * Tarjeta-placeholder del hero (Tanda 2 F02/D2): la HOLOCARD del mockup `tienda-libro` SIN imagen —
 * ícono (Tabler, enum, cero emoji libre — D2) + título + subtítulo dentro de un fondo tematizado. Ratio
 * 3:4 (tipo portada). Cero hex (I-A): el fondo es `gradienteTematico`, el texto blanco emparejado.
 */
function TarjetaVisual({
  visual,
  colorPrimario,
}: {
  visual: Extract<HeroVisual, { tipo: "tarjeta" }>;
  colorPrimario: string | null;
}) {
  const Icono = visual.icono ? iconoBeneficio(visual.icono) : null;
  return (
    <AspectRatio ratio={3 / 4}>
      <Box
        style={{
          background: gradienteTematico(colorPrimario),
          borderRadius: "var(--mantine-radius-lg)",
          padding: "var(--mantine-spacing-xl)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: "var(--mantine-spacing-md)",
          color: "var(--mantine-color-white)",
        }}
      >
        {Icono && (
          <ThemeIcon variant="white" size={64} radius="xl">
            <Icono className="size-8" stroke={1.5} />
          </ThemeIcon>
        )}
        <Text fw={800} fz={{ base: 24, sm: 30 }} lh={1.15} c="white">
          {visual.titulo}
        </Text>
        {visual.subtitulo && (
          <Text fz="sm" c="white" opacity={0.85}>
            {visual.subtitulo}
          </Text>
        )}
      </Box>
    </AspectRatio>
  );
}

/**
 * Visual configurable del hero split (Tanda 2 F02/D2). `imagen` = imagen (con `holo` opcional);
 * `tarjeta` = holocard-placeholder. `holo` reusa `MarcoHolo` (borde iridiscente + tilt, SSR/reduced-
 * motion-safe). Cero hex (I-A). Es la columna derecha del split; sin `visual` el hero cae al
 * `<HeroVisual>` de siempre (no-op, I-H) — este componente solo se monta cuando `visual` está presente.
 */
function HeroVisualConfigurable({
  visual,
  colorPrimario,
  alt,
}: {
  visual: HeroVisual;
  colorPrimario: string | null;
  alt: string;
}) {
  const cuerpo =
    visual.tipo === "imagen" ? (
      <ImagenConFallback
        src={visual.url}
        alt={alt}
        colorPrimario={colorPrimario}
        style={{
          width: "100%",
          aspectRatio: "3 / 4",
          objectFit: "cover",
          display: "block",
          borderRadius: "var(--mantine-radius-lg)",
        }}
      />
    ) : (
      <TarjetaVisual visual={visual} colorPrimario={colorPrimario} />
    );

  return visual.holo ? <MarcoHolo>{cuerpo}</MarcoHolo> : cuerpo;
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
          <HeroEyebrow props={props} />
          <Title order={1} fz={{ base: 32, sm: 44 }} lh={1.1} fw={800}>
            <TituloHero titulo={titulo} acento={props.tituloAcento} efecto={props.efectoTitulo} />
          </Title>
          {subtitulo && (
            <Text size="lg" c="dimmed" maw={520}>
              {subtitulo}
            </Text>
          )}
          {props.destacado && <Destacado destacado={props.destacado} />}
          <Ctas props={props} />
          {props.mostrarConfianza && <TrustBadges />}
        </Stack>
        {/* Columna derecha (Tanda 2 F02/D2): `visual` configurable (imagen/holocard con holo opcional)
            gana; sin `visual` cae al `<HeroVisual>` de siempre (imagenUrl/gradiente — no-op, I-H). */}
        {props.visual ? (
          <HeroVisualConfigurable
            visual={props.visual}
            colorPrimario={branding.colorPrimario}
            alt={branding.nombre}
          />
        ) : (
          <HeroVisual imagenUrl={props.imagenUrl ?? null} alt={branding.nombre} colorPrimario={branding.colorPrimario} />
        )}
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
        {!minimal && <HeroEyebrow props={props} />}
        <Title order={1} fz={{ base: minimal ? 28 : 34, sm: minimal ? 40 : 48 }} lh={1.1} fw={800}>
          <TituloHero titulo={titulo} acento={props.tituloAcento} efecto={props.efectoTitulo} />
        </Title>
        {subtitulo && (
          <Text size="lg" c="dimmed" maw={560}>
            {subtitulo}
          </Text>
        )}
        {props.destacado && <Destacado destacado={props.destacado} />}
        <Ctas props={props} />
        {!minimal && props.mostrarConfianza && <TrustBadges />}
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
        <HeroEyebrow props={props} />
        <Title order={1} fz={{ base: 34, sm: 52 }} lh={1.1} fw={800} c="inherit">
          <TituloHero titulo={titulo} acento={props.tituloAcento} efecto={props.efectoTitulo} />
        </Title>
        {subtitulo && (
          <Text fz={{ base: "md", sm: "lg" }} c="inherit" opacity={0.92} maw={620}>
            {subtitulo}
          </Text>
        )}
        {props.destacado && <Destacado destacado={props.destacado} oscuro />}
        <Ctas props={props} oscuro />
      </Stack>
    </SeccionWrapper>
  );
}
