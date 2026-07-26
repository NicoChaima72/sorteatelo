import { Badge, Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import {
  bloquesReloj,
  formatoRelojLinea,
  useCountdown,
  type TiempoRestante,
} from "~/components/storefront/use-countdown";
import { useSorteoActivo } from "~/components/storefront/use-sorteo-activo";
import { ANCLAS_QUE_SON_RUTA } from "~/lib/pagebuilder/nav";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { EstiloSeccionSchema } from "~/lib/pagebuilder/widgets";

/** Banda gris por defecto cuando `intensidad:"fuerte"` y no hay estilo (equivalente al look previo). */
const ESTILO_FUERTE_DEFAULT = EstiloSeccionSchema.parse({
  padY: "m",
  fondo: { tipo: "esquema", esquema: "superficie_alt" },
});
/** Sin banda por defecto en `suave` (transparente, `py` m). */
const ESTILO_SUAVE_DEFAULT = EstiloSeccionSchema.parse({ padY: "m" });

/** Mensaje por defecto cuando el Organizador no escribió el suyo (reusado por las 3 variantes, D4). */
const MENSAJE_DEFAULT = "El sorteo cierra pronto";

/**
 * Superficie TRANSLÚCIDA de la variante `panel`: el fondo de la sección se ve a través (por eso compone
 * con cualquier `esquema`/`ambiente` de la sección, incluido `neon`, D1/I6). Misma receta que la card
 * dreamy del FAQ — cero hex (I4), `light-dark` para que funcione en los temas oscuros per-tenant.
 */
const SUPERFICIE_TRANSLUCIDA =
  "light-dark(color-mix(in srgb, var(--mantine-color-white) 72%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 72%, transparent))";
const RING_TRANSLUCIDO =
  "light-dark(color-mix(in srgb, var(--mantine-color-white), transparent 25%), var(--mantine-color-dark-4))";

/**
 * Token del ACENTO de la página con FALLBACK a la marca del tenant (D5/I-T2): si el `TemaPagina` no
 * definió `colorAcento`, la CSS var no existe y el navegador cae al primario — degradación sin código.
 */
const ACENTO = "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";

/** Caption FIJA de la variante `tarjeta` (D4): no es configurable desde el editor. */
const CAPTION_TARJETA = "TIEMPO RESTANTE";

/**
 * `urgencia_countdown` (F10): cuenta regresiva al cierre del sorteo ACTIVO. Auto-oculto sin sorteo o
 * si ya venció (§3, I3 — en las TRES variantes). El componente interno aísla `useCountdown` para no
 * llamar un hook condicional.
 *
 * `estiloVisual` (builder-countdown-presencia F01/F02, D1):
 * - `clasico` (default no-op, I1): la anatomía de siempre — ícono + mensaje + UNA línea de reloj + CTA,
 *   con la banda/pulso que aporta `intensidad` (D7: `intensidad` solo significa acá). Lo único que cambió
 *   con la enmienda D2 del usuario es el TEXTO del reloj, que ahora tictaquea con minutos y segundos.
 * - `panel`: banda translúcida liviana con el reloj por BLOQUES (D/H/M/S). Sin badge ni premio.
 * - `tarjeta`: la presencia completa — badge, premio, reloj enorme en el acento, caption y CTA grande.
 *
 * Las tres pintan el MISMO dato (`bloquesReloj`/`formatoRelojLinea` salen del mismo helper puro), así que
 * no pueden desincronizarse en pad ni en unidades.
 */
export function UrgenciaCountdown({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "urgencia_countdown" }>;
  divisorColor?: string;
}) {
  const sorteo = useSorteoActivo();
  if (sorteo.isError || !sorteo.data) return null; // auto-oculto sin sorteo
  return (
    <UrgenciaInner
      fechaFin={sorteo.data.fechaFin}
      premio={sorteo.data.premio}
      nodo={nodo}
      divisorColor={divisorColor}
    />
  );
}

function UrgenciaInner({
  fechaFin,
  premio,
  nodo,
  divisorColor,
}: {
  fechaFin: Date;
  /** Nombre del premio del sorteo activo — solo lo pinta la variante `tarjeta` (D4). */
  premio: string;
  nodo: Extract<SeccionNode, { tipo: "urgencia_countdown" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const t = useCountdown(fechaFin);
  if (t.terminado) return null; // auto-oculto al vencer

  const variante = props.estiloVisual;
  const fuerte = props.intensidad === "fuerte";
  // Un ancla de RUTA (hoy solo `bases` ⇒ `/bases`, D14) gana: es el enlace LEGAL al PDF del sorteo,
  // no un target de scroll. El resto del enum sigue colapsando a los dos destinos históricos de este
  // widget (sorteo/catálogo) — ese colapso es previo a este plan y no se toca acá.
  const ctaHref =
    ANCLAS_QUE_SON_RUTA[props.ctaAncla] ??
    (props.ctaAncla === "sorteo" ? "#sorteo" : "#catalogo");
  // D7: la banda gris que `fuerte` aporta por defecto es un default de `clasico`. Las otras variantes
  // traen su propia presencia (la banda translúcida del panel, la card de la tarjeta) y una banda gris
  // por debajo las ensuciaría. Un `estilo` explícito del Organizador manda siempre, en las tres.
  const estilo =
    nodo.estilo ??
    (variante === "clasico" && fuerte ? ESTILO_FUERTE_DEFAULT : ESTILO_SUAVE_DEFAULT);
  const mensaje = props.mensaje ?? MENSAJE_DEFAULT;

  return (
    <SeccionWrapper id={nodo.id} estilo={estilo} divisorColor={divisorColor}>
      {variante === "tarjeta" ? (
        <Box
          maw={520}
          mx="auto"
          w="100%"
          // Mobile-first con la cuenta hecha (el público es mayoritariamente mobile): el inset lateral
          // hasta el reloj es el `px` del Container del SeccionWrapper (md = 16×2) + este `px` + el borde
          // de 1px×2 (`box-sizing: border-box`). Con `lg` (20×2) a 360 px quedaban 286 px de contenido
          // para 4 bloques que pedían 296 ⇒ el bloque «Seg» se salía de la card y habilitaba scroll
          // horizontal de página. Con `md` en base quedan 294 px a 360 y 254 px a 320 (iPhone SE),
          // contra los 246 que pide el reloj — ver el presupuesto en `RelojBloques`.
          px={{ base: "md", sm: "xl" }}
          py={{ base: "lg", sm: "xl" }}
          ta="center"
          style={{
            borderRadius: "var(--mantine-radius-lg)",
            background: "var(--mantine-color-body)",
            border: `1px solid color-mix(in srgb, ${ACENTO} 28%, transparent)`,
            boxShadow: "var(--mantine-shadow-md)",
          }}
        >
          <Stack gap="md" align="center">
            <Badge
              variant="light"
              size="lg"
              radius="sm"
              leftSection={<IconClock className="size-3.5" stroke={2} aria-hidden="true" />}
              // `textTransform:none` porque el mensaje es una frase del Organizador, no una etiqueta; y
              // `whiteSpace:normal` porque `mensaje` admite hasta 120 caracteres y el default del Badge
              // los cortaría con puntos suspensivos (perder copy del Organizador no es degradar elegante).
              styles={{
                root: { height: "auto", paddingBlock: 6 },
                label: { textTransform: "none", whiteSpace: "normal", overflow: "visible" },
              }}
            >
              {mensaje}
            </Badge>
            <Text fw={700} fz={{ base: 20, sm: 24 }} lh={1.2} className="break-words">
              {premio}
            </Text>
            <RelojBloques t={t} tamano="tarjeta" acentuado pulsoSegundos />
            <Text
              fz={{ base: 10, sm: 11 }}
              c="dimmed"
              tt="uppercase"
              lh={1.2}
              style={{ letterSpacing: "0.14em" }}
            >
              {CAPTION_TARJETA}
            </Text>
            {props.ctaTexto && (
              <Button component="a" href={ctaHref} size="lg" radius="md" fullWidth>
                {props.ctaTexto}
              </Button>
            )}
          </Stack>
        </Box>
      ) : variante === "panel" ? (
        <Box
          maw={560}
          mx="auto"
          w="100%"
          px={{ base: "md", sm: "lg" }}
          py="md"
          style={{
            borderRadius: "var(--mantine-radius-lg)",
            background: SUPERFICIE_TRANSLUCIDA,
            border: `1px solid ${RING_TRANSLUCIDO}`,
          }}
        >
          <Stack gap="sm" align="center">
            <Group gap="xs">
              {/* Decorativo: el mensaje de al lado ya dice todo (patrón del resto del storefront). En
                  `clasico` el mismo ícono va SIN `aria-hidden` y así se queda: agregárselo cambiaría su
                  HTML más allá del único delta que I1 admite (el texto del reloj). */}
              <IconClock
                className="size-4"
                stroke={1.75}
                color="var(--mantine-primary-color-filled)"
                aria-hidden="true"
              />
              <Text fw={600} fz="sm">
                {mensaje}
              </Text>
            </Group>
            <RelojBloques t={t} tamano="panel" />
            {props.ctaTexto && (
              <Button component="a" href={ctaHref} size="sm" radius="md">
                {props.ctaTexto}
              </Button>
            )}
          </Stack>
        </Box>
      ) : (
        <Stack gap="md" align="center">
          <Group gap="xs">
            <IconClock
              className="size-5"
              stroke={1.75}
              color="var(--mantine-primary-color-filled)"
            />
            <Text fw={600}>{mensaje}</Text>
          </Group>
          <Text
            fz={{ base: 32, sm: 44 }}
            fw={800}
            className={fuerte ? "tabular-nums animar-pulso" : "tabular-nums"}
          >
            {formatoRelojLinea(t)}
          </Text>
          {props.ctaTexto && (
            <Button component="a" href={ctaHref} size="md" radius="md">
              {props.ctaTexto}
            </Button>
          )}
        </Stack>
      )}
    </SeccionWrapper>
  );
}

/**
 * El reloj por BLOQUES (D3): Días / Horas / Min / Seg, los 4 SIEMPRE presentes aunque den 0 — que el
 * bloque de días desaparezca en las últimas 24 h correría el resto del reloj de lugar (CLS 0). Compartido
 * por `panel` y `tarjeta`; lo único que cambia entre ellas es la escala (`tamano`), el color del número
 * (`acentuado`) y el pulso de los segundos. Los valores salen de `bloquesReloj` (helper puro).
 */
function RelojBloques({
  t,
  tamano,
  acentuado = false,
  pulsoSegundos = false,
}: {
  t: TiempoRestante;
  tamano: "panel" | "tarjeta";
  acentuado?: boolean;
  pulsoSegundos?: boolean;
}) {
  const grande = tamano === "tarjeta";
  return (
    // `gap` de `Group` NO admite valores responsive (es `MantineSpacing`, no `StyleProp`), así que el
    // ancho mínimo del reloj se ajusta por el `miw` de cada bloque, que SÍ es responsive. Presupuesto
    // en el ancho más angosto que soportamos (320 px, iPhone SE): el reloj pide 4×54 + 3×10 = 246 px y
    // el inset de la tarjeta deja 254 px (contando su borde de 1px×2) ⇒ 8 px de margen, el más ajustado
    // de todos. El `miw` es un piso duro (no lo negocia flex-shrink): subirlo en `base` reintroduce el
    // overflow horizontal que este número vino a cerrar — si hace falta más aire, va en `sm`.
    <Group gap="xs" justify="center" wrap="nowrap" w="100%">
      {bloquesReloj(t).map((b) => (
        <Stack
          key={b.clave}
          gap={4}
          align="center"
          miw={grande ? { base: 54, sm: 76 } : { base: 48, sm: 52 }}
        >
          <Text
            fz={grande ? { base: 38, sm: 56 } : { base: 26, sm: 32 }}
            fw={800}
            lh={1}
            // El PULSO es decoración: vive en `globals.css` dentro del gate
            // `prefers-reduced-motion: no-preference` (I5). El TICK del contenido NO depende de esta
            // clase — con movimiento reducido el reloj sigue corriendo, solo deja de latir (D6).
            className={
              pulsoSegundos && b.clave === "segundos"
                ? "tabular-nums animar-pulso"
                : "tabular-nums"
            }
            style={acentuado ? { color: ACENTO } : undefined}
          >
            {b.valor}
          </Text>
          <Text
            fz={{ base: 10, sm: 11 }}
            c="dimmed"
            tt="uppercase"
            lh={1.2}
            style={{ letterSpacing: "0.08em" }}
          >
            {b.label}
          </Text>
        </Stack>
      ))}
    </Group>
  );
}
