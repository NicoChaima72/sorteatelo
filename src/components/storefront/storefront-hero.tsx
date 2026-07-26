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
import { type CSSProperties } from "react";
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
import { RunsTexto } from "~/components/storefront/runs-texto";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { TituloHero } from "~/components/storefront/titulo-hero";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { hrefDeAncla } from "~/lib/pagebuilder/nav";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import {
  EstiloSeccionSchema,
  runsDeTexto,
  type HeroProps,
  type HeroVisual,
  type MotivoTarjeta,
  type RichTexto,
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

/**
 * `fz` responsive del título del hero por `tituloTamano` (Tanda 2 F15/fidelidad concert). `normal` ⇒
 * `null` (el caller usa el fz por-variante de siempre, no-op I-H). `grande`/`enorme` escalan a un poster de
 * recital (el "COMPRA EL LIBRO. ANDA A VER A BTS" ENORME con Anton del prototipo). Sin px libre.
 */
function fzTituloHero(
  tamano: HeroProps["tituloTamano"],
): { base: number; sm: number; md?: number } | null {
  switch (tamano) {
    case "grande":
      return { base: 40, sm: 56 };
    case "enorme":
      return { base: 44, sm: 60, md: 72 };
    case "poster":
      // Poster de recital full-width (fidelidad landing_idol): el título GIGANTE de ~96px del mockup
      // (clamp(52px, 8vw, 96px)). Solo para hero `centrado`/`imagen_fondo` — en `split` no cabe.
      return { base: 46, sm: 76, md: 96 };
    default:
      return null; // normal ⇒ el fz por-variante de siempre
  }
}

/**
 * Título del hero como `RichTexto` (Tanda 3 F02/D4): el override `props.titulo` (runs) gana; sin él el
 * render cae al `branding.nombre` envuelto en un run plano (fallback server-side, NO copiado al doc I2).
 */
function tituloHeroRico(props: HeroProps, branding: TenantBranding): RichTexto {
  return props.titulo ?? runsDeTexto(branding.nombre);
}

/** Subtítulo del hero como `RichTexto` o `null` (sin override ni descripción de branding). */
function subtituloHeroRico(props: HeroProps, branding: TenantBranding): RichTexto | null {
  if (props.subtitulo) return props.subtitulo;
  return branding.descripcion ? runsDeTexto(branding.descripcion) : null;
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

/**
 * CTA principal + secundario. Cada valor de `CTA_ANCLAS` (catalogo/sorteo/como-funciona/autora/bases/
 * preguntas, F05/D8) lo resuelve `hrefDeAncla` (nav.ts): target de scroll `#<ancla>` emitido por
 * `render-pagina`, salvo las anclas que son RUTA de plataforma (`bases` ⇒ `/bases`, D14 — el botón
 * «Ver bases del sorteo» abre el PDF legal). Enum cerrado ⇒ nunca URL libre (I-A).
 */
function Ctas({ props, oscuro }: { props: HeroProps; oscuro?: boolean }) {
  const ctaTexto = props.ctaTexto ?? "Ver el catálogo";
  return (
    <Group gap="sm" align="center">
      <Button
        component="a"
        href={hrefDeAncla(props.ctaAncla)}
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
            href={hrefDeAncla(props.ctaSecundario.ancla)}
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
            href={hrefDeAncla(props.ctaSecundario.ancla)}
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
 * Chip-ticket flotante del heroviz `suave` (Tanda 2 F13, `motivo:"tickets"`): un mini-ticket blanco
 * translúcido con la línea troquelada al medio, blur y rotación leve — los 2 tickets del prototipo dreamy.
 * CSS de tokens (cero hex), aria-hidden, sin motion. La posición/rotación llega por `style`.
 */
function TicketFlotante({ style }: { style: CSSProperties }) {
  return (
    <Box
      style={{
        position: "absolute",
        width: 64,
        height: 40,
        borderRadius: 12,
        background: "color-mix(in srgb, var(--mantine-color-white) 88%, transparent)",
        boxShadow: "0 10px 22px color-mix(in srgb, var(--mantine-color-black) 22%, transparent)",
        filter: "blur(0.6px)",
        ...style,
      }}
    >
      <Box
        style={{
          position: "absolute",
          left: "50%",
          top: 6,
          bottom: 6,
          width: 0,
          borderLeft: "1px dashed color-mix(in srgb, var(--mantine-primary-color-4) 85%, transparent)",
        }}
      />
    </Box>
  );
}

/**
 * Chip-estrella flotante del heroviz `suave` (Tanda 2 F13, `motivo:"estrella"`): una chispa de 4 puntas
 * (clip-path) blanca translúcida, blur y rotación leve. CSS de tokens (cero hex), aria-hidden, sin motion.
 */
function EstrellaFlotante({ style, size = 30 }: { style: CSSProperties; size?: number }) {
  return (
    <Box
      style={{
        position: "absolute",
        width: size,
        height: size,
        background: "color-mix(in srgb, var(--mantine-color-white) 82%, transparent)",
        clipPath:
          "polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)",
        filter: "blur(0.6px)",
        ...style,
      }}
    />
  );
}

/**
 * Decoración flotante del heroviz `suave` por `motivo` (Tanda 2 F13): sobre los blur-blobs, agrega 1–2
 * chips curados. `corazon` (default) = sin chips extra (no-op, look F12). `tickets` = 2 mini-tickets.
 * `estrella` = 2 chispas. Todo aria-hidden, CSS estático de tokens (no anima, I-C).
 */
function DecoracionMotivo({ motivo }: { motivo: MotivoTarjeta }) {
  if (motivo === "tickets") {
    return (
      <>
        <TicketFlotante style={{ bottom: "13%", left: "12%", transform: "rotate(-8deg)" }} />
        <TicketFlotante style={{ bottom: "17%", right: "11%", transform: "rotate(7deg)" }} />
      </>
    );
  }
  if (motivo === "estrella") {
    return (
      <>
        <EstrellaFlotante style={{ top: "13%", right: "16%", transform: "rotate(12deg)" }} />
        <EstrellaFlotante style={{ bottom: "18%", left: "13%", transform: "rotate(-10deg)" }} size={22} />
      </>
    );
  }
  return null; // corazon: solo los blur-blobs (no-op)
}

/**
 * Tarjeta-placeholder del hero (Tanda 2 F02/D2): la HOLOCARD del mockup `tienda-libro` SIN imagen —
 * ícono (Tabler, enum, cero emoji libre — D2) + título + subtítulo dentro de un fondo tematizado. Ratio
 * 3:4 (tipo portada). Cero hex (I-A): el fondo es `gradienteTematico`, el texto blanco emparejado.
 *
 * `estilo:"suave"` (Tanda 2 F12): look "glassy" del prototipo dreamy — mismo gradiente + 2-3 blur-blobs
 * decorativos de tokens (círculos difusos de blanco/marca a baja opacidad), CSS puro sin motion. `plano`
 * (default) = el fondo sólido de siempre (no-op, I-H). El `motivo` (F13) suma chips flotantes al `suave`.
 */
function TarjetaVisual({
  visual,
  colorPrimario,
}: {
  visual: Extract<HeroVisual, { tipo: "tarjeta" }>;
  colorPrimario: string | null;
}) {
  const Icono = visual.icono ? iconoBeneficio(visual.icono) : null;
  const suave = visual.estilo === "suave";
  // `cristal` (fidelidad tienda-libro bcac): INTERIOR OSCURO de la holographic idol card — radial
  // dark→negro (tokens de la escala `dark`, cero hex I-A) + scanlines de luz. El interior NO se rellena
  // con el gradiente de marca (eso es el look `plano`/`suave`); acá el color vive en el BORDE holo.
  const cristal = visual.estilo === "cristal";
  // Contenido de la tarjeta (Tanda 2 F16): `emblema` = holocard DECORATIVA (ícono grande arriba + glow
  // inferior + motivo, SIN texto) = el heroviz del prototipo dreamy; `texto` (default) = ícono-círculo +
  // título + subtítulo (no-op I-H). En `emblema` el marco pasa a landscape (4:3, el ancho del heroviz).
  const emblema = visual.contenido === "emblema";
  // Fondo de la holocard (Tanda 2 F15/fidelidad concert): en `suave` es DARK-AWARE por `light-dark` — modo
  // claro = el gradiente pastel de marca (byte-idéntico al de siempre para dreamy, no-op I-H); modo oscuro
  // = un "stage" oscuro (marca-9 → negro) con los blur-blobs blancos como haces de luz (el escenario del
  // recital del prototipo concert, no una tarjeta clara sobre fondo oscuro). `plano` conserva el gradiente
  // tematico sólido. Cero hex (I-A).
  const fondoTarjeta = cristal
    ? "radial-gradient(120% 100% at 30% 0%, var(--mantine-color-dark-6), var(--mantine-color-black) 72%)"
    : suave
      ? "linear-gradient(135deg, light-dark(var(--mantine-primary-color-5), var(--mantine-primary-color-9)), light-dark(var(--mantine-primary-color-8), var(--mantine-color-black)))"
      : gradienteTematico(colorPrimario);
  return (
    <AspectRatio ratio={emblema ? 4 / 3 : 3 / 4}>
      <Box
        style={{
          position: "relative",
          overflow: "hidden",
          background: fondoTarjeta,
          borderRadius: "var(--mantine-radius-lg)",
          padding: "var(--mantine-spacing-xl)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: emblema ? "flex-start" : "center",
          textAlign: "center",
          gap: "var(--mantine-spacing-md)",
          color: "var(--mantine-color-white)",
        }}
      >
        {/* Glow radial inferior (Tanda 2 F16, `emblema`): el brillo blanco que corona los tickets del
            heroviz del prototipo dreamy (radial bottom-center). VA PRIMERO ⇒ los tickets del motivo pintan
            ENCIMA. CSS estático, cero hex, aria-hidden, no anima (I-C). */}
        {emblema && (
          <Box
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(80% 120% at 50% 118%, color-mix(in srgb, var(--mantine-color-white) 55%, transparent), transparent 60%)",
            }}
          />
        )}
        {/* Scanlines de la holographic idol card (`cristal`, fidelidad tienda-libro bcac): líneas de luz
            diagonales muy tenues en overlay — el `repeating-linear-gradient` + mix-blend del mockup. CSS
            estático, cero hex (color-mix de white), aria-hidden, no anima (I-C). */}
        {cristal && (
          <Box
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "repeating-linear-gradient(115deg, color-mix(in srgb, var(--mantine-color-white) 5%, transparent) 0 2px, transparent 2px 6px)",
              mixBlendMode: "overlay",
            }}
          />
        )}
        {/* Blur-blobs decorativos (glassy) — solo en `suave`. CSS estático, cero hex, no anima (I-C). El
            `motivo` (F13) suma 1–2 chips flotantes (tickets/estrellas) sobre los blobs. */}
        {suave && (
          <Box aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <Box style={{ position: "absolute", top: "8%", left: "10%", width: 96, height: 96, borderRadius: 999, background: "color-mix(in srgb, var(--mantine-color-white) 42%, transparent)", filter: "blur(22px)" }} />
            <Box style={{ position: "absolute", top: "16%", right: "14%", width: 56, height: 56, borderRadius: 999, background: "color-mix(in srgb, var(--mantine-color-white) 55%, transparent)", filter: "blur(14px)" }} />
            <Box style={{ position: "absolute", bottom: "14%", right: "12%", width: 84, height: 84, borderRadius: 999, background: "color-mix(in srgb, var(--mantine-primary-color-2) 45%, transparent)", filter: "blur(24px)" }} />
            <DecoracionMotivo motivo={visual.motivo} />
          </Box>
        )}
        {emblema ? (
          // Emblema (F16): SOLO el ícono GRANDE arriba (sin círculo, sin texto) — el corazón grande que
          // corona el heroviz del prototipo dreamy. Relleno + trazo blanco + drop-shadow = emblema sólido.
          // Cero hex (I-A); aria-hidden (el nombre accesible ya vive en el hero). El motivo (tickets) y el
          // glow inferior aportan el resto de la composición.
          Icono && (
            <Box aria-hidden style={{ position: "relative", marginTop: "10%" }}>
              <Icono
                stroke={1.5}
                style={{
                  width: 108,
                  height: 108,
                  color: "var(--mantine-color-white)",
                  fill: "var(--mantine-color-white)",
                  filter:
                    "drop-shadow(0 10px 26px color-mix(in srgb, var(--mantine-color-black) 32%, transparent))",
                }}
              />
            </Box>
          )
        ) : (
          <Box style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--mantine-spacing-md)" }}>
            {Icono &&
              (cristal ? (
                // `cristal`: ícono flotante con glow iridiscente (el 🎤 con drop-shadow del mockup), SIN el
                // círculo blanco — sobre el interior oscuro el círculo blanco tapaba el efecto holográfico.
                <Icono
                  aria-hidden
                  stroke={1.5}
                  style={{
                    width: 56,
                    height: 56,
                    color: "var(--mantine-color-white)",
                    filter:
                      "drop-shadow(0 0 18px color-mix(in srgb, var(--mantine-primary-color-4) 70%, transparent))",
                  }}
                />
              ) : (
                <ThemeIcon variant="white" size={64} radius="xl">
                  <Icono className="size-8" stroke={1.5} />
                </ThemeIcon>
              ))}
            <Text fw={800} fz={{ base: 24, sm: 30 }} lh={1.15} c="white">
              {visual.titulo}
            </Text>
            {visual.subtitulo && (
              <Text fz="sm" c="white" opacity={0.85}>
                {visual.subtitulo}
              </Text>
            )}
          </Box>
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

  // La idol card `cristal` (tienda-libro bcac) suma el borde iridiscente arcoíris + el tilt de reposo -4°
  // del mockup. Los demás holo (concert) conservan el borde de marca sin tilt de reposo (no-op I-H).
  const cristal = visual.tipo === "tarjeta" && visual.estilo === "cristal";
  return visual.holo ? (
    <MarcoHolo iris={cristal} tilt={cristal ? -4 : 0}>
      {cuerpo}
    </MarcoHolo>
  ) : (
    cuerpo
  );
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
  const titulo = tituloHeroRico(props, branding);
  const subtitulo = subtituloHeroRico(props, branding);
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "xl", md: 48 }} style={{ alignItems: "center" }}>
        <Stack gap="lg">
          <HeroEyebrow props={props} />
          <Title
            order={1}
            fz={fzTituloHero(props.tituloTamano) ?? { base: 32, sm: 44 }}
            lh={props.tituloMayusculas && props.tituloTamano === "enorme" ? 0.95 : 1.1}
            fw={800}
            tt={props.tituloMayusculas ? "uppercase" : undefined}
          >
            <TituloHero titulo={titulo} efecto={props.efectoTitulo} />
          </Title>
          {subtitulo && (
            <Text size="lg" c="dimmed" maw={520}>
              <RunsTexto rico={subtitulo} />
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
  const titulo = tituloHeroRico(props, branding);
  const subtitulo = subtituloHeroRico(props, branding);
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg" align="center" ta="center" maw={720} mx="auto">
        {!minimal && <HeroEyebrow props={props} />}
        <Title
          order={1}
          fz={fzTituloHero(props.tituloTamano) ?? { base: minimal ? 28 : 34, sm: minimal ? 40 : 48 }}
          lh={props.tituloTamano === "poster" || (props.tituloMayusculas && props.tituloTamano === "enorme") ? 0.95 : 1.1}
          fw={800}
          tt={props.tituloMayusculas ? "uppercase" : undefined}
        >
          <TituloHero titulo={titulo} efecto={props.efectoTitulo} />
        </Title>
        {subtitulo && (
          <Text size="lg" c="dimmed" maw={560}>
            <RunsTexto rico={subtitulo} />
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
  const titulo = tituloHeroRico(props, branding);
  const subtitulo = subtituloHeroRico(props, branding);
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
          <TituloHero titulo={titulo} efecto={props.efectoTitulo} />
        </Title>
        {subtitulo && (
          <Text fz={{ base: "md", sm: "lg" }} c="inherit" opacity={0.92} maw={620}>
            <RunsTexto rico={subtitulo} />
          </Text>
        )}
        {props.destacado && <Destacado destacado={props.destacado} oscuro />}
        <Ctas props={props} oscuro />
      </Stack>
    </SeccionWrapper>
  );
}
