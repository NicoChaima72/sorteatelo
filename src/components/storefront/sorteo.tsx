import {
  Alert,
  Anchor,
  Badge,
  Box,
  Group,
  SimpleGrid,
  Stack,
  Text,
  type TextProps,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconGift, IconScale, IconTicket } from "@tabler/icons-react";
import { type CSSProperties, type ReactNode } from "react";

import {
  formatoCompacto,
  useCountdown,
} from "~/components/storefront/use-countdown";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { fecha, num } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";
import {
  BORDE_TENUE_SOBRE_OSCURO,
  esFondoOscuro,
  FONDO_TENUE_SOBRE_OSCURO,
  TEXTO_TENUE_SOBRE_OSCURO,
} from "~/styles/estiloSeccion";
import { gradienteTematico } from "~/styles/tenantTheme";

/**
 * Vitrina del sorteo (widget `sorteo_vitrina`, F05/ADR-0016; plantilla-rica F04, design.md §5.1 pto
 * 4; ADR-0008). Aparece SOLO si hay un sorteo ACTIVO (auto-oculto §5.2: sin sorteo ⇒ sin sección). El
 * premio/nombre/fechas/conteo se resuelven server-side (NO en el documento, I2). Las props del
 * documento controlan `mostrarBases` (texto de bases del Organizador) y `estiloConteo`. El conteo es
 * de TICKETS (sin correos — privacidad ADR-0004). El DISCLAIMER (I8/ADR-0008) NO es configurable: se
 * muestra SIEMPRE con sorteo activo, sin importar las props.
 *
 * Contraste sobre esquema OSCURO (Tanda 2 F12): cuando la sección tiene fondo oscuro/bicolor (el banner
 * del premio del prototipo dreamy), los sub-textos/badges/alert que en fondo claro usan un gris fijo
 * (`dimmed`/`gray`) quedaban ILEGIBLES sobre morado. Con `oscuro` derivan su color del EMPAREJADO que el
 * wrapper ya fijó (currentColor) ⇒ legibles sobre cualquier esquema. Sobre fondo claro se conserva el
 * `dimmed`/`gray` byte-idéntico (no-op, I-H) — las tiendas claras existentes no cambian.
 */

/** Disclaimer FIJO de plataforma (redacción legal fina se ajusta con abogado en F10, ADR-0008). */
const DISCLAIMER_SORTEO =
  "Este sorteo es organizado y ejecutado exclusivamente por quien opera esta tienda, único " +
  "responsable de sus bases, premios y resultado. La plataforma solo provee la tecnología: no " +
  "organiza el sorteo ni responde por su ejecución. Revisa las bases antes de participar.";

/**
 * Estilo por defecto de la vitrina (catálogo-v2 F02): la sección deja de HARDCODEAR su fondo y usa
 * un esquema `superficie_alt` (banda gris tokenizada) — equivalente visual al `default-hover` previo,
 * ahora sobreescribible desde el documento (`estilo`). Sin bump: un documento sin `estilo` conserva
 * la banda distintiva del sorteo (no-op perceptual, I-H).
 */
const ESTILO_SORTEO_DEFAULT = EstiloSeccionSchema.parse({
  fondo: { tipo: "esquema", esquema: "superficie_alt" },
});

export function SorteoStorefront({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "sorteo_vitrina" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const sorteo = useSorteoActivo();
  const estilo = nodo.estilo ?? ESTILO_SORTEO_DEFAULT;
  // Contraste (F12): sobre fondo oscuro los sub-textos derivan su tenue de currentColor (no `dimmed`).
  const oscuro = esFondoOscuro(estilo.fondo);

  // Sección opcional/decorativa: si falla o no hay sorteo, no se renderiza (no rompe la home, §5.2).
  if (sorteo.isError || !sorteo.data) return null;
  const s = sorteo.data;

  return (
    <SeccionWrapper id={nodo.id} estilo={estilo} divisorColor={divisorColor}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "lg", md: 48 }} style={{ alignItems: "center" }}>
          <PremioVisual url={s.premioImageUrl} colorPrimario={colorPrimario} />

          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon
                variant={oscuro ? "default" : "light"}
                size="lg"
                radius="md"
                styles={oscuro ? { root: { background: FONDO_TENUE_SOBRE_OSCURO, color: "currentColor", border: "none" } } : undefined}
              >
                <IconGift className="size-5" stroke={1.75} />
              </ThemeIcon>
              <TextoTenue oscuro={oscuro} fw={600} tt="uppercase" fz="xs" style={{ letterSpacing: "0.08em" }}>
                Sorteo activo
              </TextoTenue>
            </Group>

            <Title order={2} fz={{ base: 26, sm: 34 }} fw={800} lh={1.15}>
              {s.premio}
            </Title>

            <TextoTenue oscuro={oscuro}>{s.nombre}</TextoTenue>

            {props.estiloConteo === "destacado" && (
              <Group gap={8} align="baseline">
                <Text fz={{ base: 32, sm: 40 }} fw={800} className="tabular-nums">
                  {num(s.totalParticipaciones)}
                </Text>
                <TextoTenue oscuro={oscuro} size="sm">
                  {s.totalParticipaciones === 1 ? "participación" : "participaciones"}
                </TextoTenue>
              </Group>
            )}

            <Group gap="xs" wrap="wrap">
              {props.estiloConteo === "badge" && (
                <BadgeTenue oscuro={oscuro}>
                  {num(s.totalParticipaciones)}{" "}
                  {s.totalParticipaciones === 1 ? "participación" : "participaciones"}
                </BadgeTenue>
              )}
              <BadgeTenue oscuro={oscuro} variante="contorno">
                Vigente hasta el {fecha(s.fechaFin)}
              </BadgeTenue>
              <CierreBadge fechaFin={s.fechaFin} oscuro={oscuro} />
            </Group>

            <Group gap={8} wrap="nowrap">
              <IconTicket
                className="size-4"
                stroke={1.75}
                color={oscuro ? "currentColor" : "var(--mantine-primary-color-filled)"}
              />
              <Text size="sm">
                Comprar en esta tienda es participar: cada compra suma tus tickets.
              </Text>
            </Group>

            {props.mostrarBases && s.basesTexto && (
              <TextoTenue oscuro={oscuro} size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {s.basesTexto}
              </TextoTenue>
            )}
            {props.mostrarBases && s.basesUrl && (
              <Anchor
                href={s.basesUrl}
                target="_blank"
                rel="noreferrer"
                size="sm"
                c={oscuro ? "inherit" : undefined}
                style={oscuro ? { textDecoration: "underline" } : undefined}
              >
                Ver las bases completas
              </Anchor>
            )}

            <Alert
              variant="light"
              color="gray"
              icon={<IconScale className="size-[18px]" />}
              title="Responsabilidad del sorteo"
              styles={
                oscuro
                  ? {
                      // `color: currentColor` TAMBIÉN en el root: el variant de Mantine setea su propio
                      // color de texto ahí y pisaba la herencia del emparejado (quedaba gris sobre morado).
                      root: {
                        background: FONDO_TENUE_SOBRE_OSCURO,
                        border: `1px solid ${BORDE_TENUE_SOBRE_OSCURO}`,
                        color: "currentColor",
                      },
                      title: { color: "inherit" },
                      message: { color: "inherit" },
                      icon: { color: "inherit" },
                    }
                  : undefined
              }
            >
              <Text size="xs">{DISCLAIMER_SORTEO}</Text>
            </Alert>
          </Stack>
        </SimpleGrid>
    </SeccionWrapper>
  );
}

/**
 * Texto secundario legible en cualquier esquema (F12). Sobre fondo claro = `c="dimmed"` (byte-idéntico
 * al render previo, no-op). Sobre oscuro = deriva de currentColor (el emparejado que el wrapper fijó),
 * nunca un gris fijo ilegible sobre morado.
 */
function TextoTenue({
  oscuro,
  children,
  style,
  ...rest
}: {
  oscuro: boolean;
  children: ReactNode;
  style?: CSSProperties;
} & Omit<TextProps, "style" | "c">) {
  return (
    <Text
      {...rest}
      c={oscuro ? undefined : "dimmed"}
      style={{ ...(style ?? {}), ...(oscuro ? { color: TEXTO_TENUE_SOBRE_OSCURO } : {}) }}
    >
      {children}
    </Text>
  );
}

/**
 * Badge legible en cualquier esquema (F12). Sobre claro conserva el look previo (`light` o `outline
 * gray`). Sobre oscuro = chip frosted derivado de currentColor (fondo/borde/tinta emparejados).
 */
function BadgeTenue({
  oscuro,
  variante = "relleno",
  children,
}: {
  oscuro: boolean;
  variante?: "relleno" | "contorno";
  children: ReactNode;
}) {
  if (oscuro) {
    return (
      <Badge
        variant="default"
        styles={{
          root: {
            background: variante === "contorno" ? "transparent" : FONDO_TENUE_SOBRE_OSCURO,
            color: "currentColor",
            border: `1px solid ${BORDE_TENUE_SOBRE_OSCURO}`,
          },
          label: { textTransform: "none", fontWeight: variante === "contorno" ? 400 : undefined },
        }}
      >
        {children}
      </Badge>
    );
  }
  return variante === "contorno" ? (
    <Badge variant="outline" color="gray" styles={{ label: { fontWeight: 400, textTransform: "none" } }}>
      {children}
    </Badge>
  ) : (
    <Badge variant="light" styles={{ label: { textTransform: "none" } }}>
      {children}
    </Badge>
  );
}

/** Badge de cuenta regresiva; se oculta si el sorteo ya venció (degradación §5.2). */
function CierreBadge({ fechaFin, oscuro }: { fechaFin: Date; oscuro: boolean }) {
  const t = useCountdown(fechaFin);
  if (t.terminado) return null;
  if (oscuro) {
    return (
      <Badge
        variant="default"
        classNames={{ label: "tabular-nums" }}
        styles={{
          root: { background: FONDO_TENUE_SOBRE_OSCURO, color: "currentColor", border: `1px solid ${BORDE_TENUE_SOBRE_OSCURO}` },
          label: { textTransform: "none" },
        }}
      >
        Cierra en {formatoCompacto(t)}
      </Badge>
    );
  }
  return (
    <Badge variant="light" classNames={{ label: "tabular-nums" }} styles={{ label: { textTransform: "none" } }}>
      Cierra en {formatoCompacto(t)}
    </Badge>
  );
}

/** Imagen del premio, o un bloque de gradiente temático si no hay (degradación elegante §5.2). */
function PremioVisual({
  url,
  colorPrimario,
}: {
  url: string | null;
  colorPrimario: string | null;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Premio del sorteo"
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          objectFit: "cover",
          borderRadius: "var(--mantine-radius-lg)",
          display: "block",
        }}
      />
    );
  }
  return (
    <Box
      className="flex items-center justify-center"
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        borderRadius: "var(--mantine-radius-lg)",
        background: gradienteTematico(colorPrimario),
      }}
    >
      <IconGift
        className="size-16"
        stroke={1.25}
        color="var(--mantine-color-white)"
        style={{ opacity: 0.9 }}
      />
    </Box>
  );
}
