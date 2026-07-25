import { Box, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { useCountUp } from "~/components/storefront/animar";
import { emojiBeneficio, iconoBeneficio } from "~/components/storefront/iconos-beneficio";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { num } from "~/lib/formato";
import { type EstadisticasProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `estadisticas` (sección, catálogo-v2 F05): fila 2–4 de cifras grandes con COUNT-UP al entrar al
 * viewport (F03: SSR = valor final, reduced-motion ⇒ inmediato — I-D/I-B). Cifras NARRADAS por el
 * Organizador (prueba social editorial, no el conteo real del sorteo, §5). `prefijo`/`sufijo`
 * enmarcan el número; `icono` (opcional) del enum ICONOS_BENEFICIO.
 */
export function Estadisticas({
  nodo,
  divisorColor,
  comoHoja,
}: {
  nodo: Extract<SeccionNode, { tipo: "estadisticas" }>;
  divisorColor?: string;
  /** `true` ⇒ se renderiza como HOJA de una `fila` (sin chrome de sección propio, Tanda 3 F08/D14). */
  comoHoja?: boolean;
}) {
  const props = nodo.props;
  const grid = (
    <SimpleGrid cols={{ base: 2, sm: props.items.length }} spacing="lg">
      {props.items.map((item, i) => (
        <StatItem key={i} item={item} estiloVisual={props.estiloVisual} />
      ))}
    </SimpleGrid>
  );
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor} comoHoja={comoHoja}>
      <Stack gap="lg">
        {props.titulo && (
          <Title order={2} fz={{ base: 22, sm: 28 }} fw={700} ta="center">
            {props.titulo}
          </Title>
        )}
        {/* Nota al pie OPCIONAL (F17): el "Cifras de ejemplo" del prototipo dreamy, 6px bajo el grid.
            Ausente ⇒ el grid es hijo directo del Stack, byte-idéntico al render previo (no-op, I-H). */}
        {props.notaPie ? (
          <Stack gap={6}>
            {grid}
            <Text fz={{ base: 10, sm: 11 }} c="dimmed" ta="center">
              {props.notaPie}
            </Text>
          </Stack>
        ) : (
          grid
        )}
      </Stack>
    </SeccionWrapper>
  );
}

/**
 * Una cifra con count-up. Sub-componente porque `useCountUp` es un hook (uno por ítem). `estiloVisual`
 * `cards` (default) = render actual con `ThemeIcon`; `simple` (F06/D10) = sin icono ni contenedor, solo
 * la cifra grande + etiqueta (las stats limpias del mockup); `tarjetas_suaves` (F12) = cada cifra en una
 * TARJETA blanca con sombra suave; `dreamy` (F17) = las stat-cards EXACTAS del prototipo `dev-ref/
 * variant-dreamy` (L96-107): EMOJI del set curado arriba + número en violeta primario con la UNIDAD inline
 * + etiqueta gris chica, en una card aireada (blanco translúcido + sombra suave + ring blanco, sin borde
 * gris). Todo con tokens del tenant (cero hex). Exportado para test unitario del render (F17).
 */
export function StatItem({
  item,
  estiloVisual,
}: {
  item: EstadisticasProps["items"][number];
  estiloVisual: EstadisticasProps["estiloVisual"];
}) {
  const { valor, ref } = useCountUp<HTMLSpanElement>(item.valor);
  const Icono = estiloVisual === "simple" ? null : item.icono ? iconoBeneficio(item.icono) : null;
  const contenido = (
    <Stack gap={4} align="center" ta="center">
      {Icono && (
        <ThemeIcon variant="light" size="lg" radius="md">
          <Icono className="size-5" stroke={1.75} />
        </ThemeIcon>
      )}
      <Group gap={2} align="baseline" justify="center" wrap="nowrap">
        {item.prefijo && (
          <Text fz={{ base: 26, sm: 36 }} fw={800} lh={1}>
            {item.prefijo}
          </Text>
        )}
        <Text ref={ref} component="span" fz={{ base: 30, sm: 44 }} fw={800} lh={1} className="tabular-nums">
          {num(valor)}
        </Text>
        {item.sufijo && (
          <Text fz={{ base: 26, sm: 36 }} fw={800} lh={1}>
            {item.sufijo}
          </Text>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {item.etiqueta}
      </Text>
    </Stack>
  );

  // `tarjetas_suaves` (F12; COMPACTADA en F13): tarjeta blanca con sombra suave, layout COMPACTO tipo el
  // prototipo dreamy — ícono arriba, número grande PERO no inflado, etiqueta chica abajo. NO reusa
  // `contenido` (cuyo número fz 44 se veía inflado y vacío en la tarjeta). Cero hex, tokens del tenant.
  if (estiloVisual === "tarjetas_suaves") {
    const IconoTs = item.icono ? iconoBeneficio(item.icono) : null;
    return (
      <Box
        px="md"
        py="lg"
        style={{
          background: "var(--mantine-color-body)",
          borderRadius: "var(--mantine-radius-lg)",
          boxShadow: "var(--mantine-shadow-sm)",
          border: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Stack gap={6} align="center" ta="center">
          {IconoTs && (
            <ThemeIcon variant="light" size="md" radius="md">
              <IconoTs className="size-4" stroke={1.75} />
            </ThemeIcon>
          )}
          <Group gap={2} align="baseline" justify="center" wrap="nowrap">
            {item.prefijo && (
              <Text fz={{ base: 22, sm: 26 }} fw={800} lh={1}>
                {item.prefijo}
              </Text>
            )}
            <Text ref={ref} component="span" fz={{ base: 26, sm: 32 }} fw={800} lh={1} className="tabular-nums">
              {num(valor)}
            </Text>
            {item.sufijo && (
              <Text fz={{ base: 22, sm: 26 }} fw={800} lh={1}>
                {item.sufijo}
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {item.etiqueta}
          </Text>
        </Stack>
      </Box>
    );
  }

  // `dreamy` (F17): las stat-cards EXACTAS de `dev-ref/variant-dreamy` (L96-107). Cierra los 4 diffs:
  //  (1) ícono = EMOJI del set curado (map `EMOJI_BENEFICIO`, no ThemeIcon monocromo, no emoji libre — D2);
  //  (2) número en VIOLETA primario (`--mantine-primary-color-filled`), no tinta;
  //  (3) unidad (sufijo) INLINE en el número, mismo tamaño/color — "12 días"/"2 entradas" juntos;
  //  (4) card AIREADA: fondo blanco translúcido + sombra suave + ring BLANCO (sin el borde gris de
  //      `tarjetas_suaves`), dark-aware por `light-dark()`. Cero hex (tokens del tenant, I-A).
  if (estiloVisual === "dreamy") {
    const emoji = item.icono ? emojiBeneficio(item.icono) : null;
    return (
      <Box
        px="sm"
        py="lg"
        ta="center"
        style={{
          background:
            "light-dark(color-mix(in srgb, var(--mantine-color-white) 72%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 72%, transparent))",
          borderRadius: "var(--mantine-radius-lg)",
          boxShadow: "var(--mantine-shadow-sm)",
          // ring BLANCO/airy (≈ sin borde): NO el `--mantine-color-default-border` gris de `tarjetas_suaves`.
          border:
            "1px solid light-dark(color-mix(in srgb, var(--mantine-color-white), transparent 20%), var(--mantine-color-dark-4))",
        }}
      >
        <Stack gap={4} align="center">
          {emoji && (
            <Text component="span" fz={{ base: 20, sm: 26 }} lh={1} aria-hidden>
              {emoji}
            </Text>
          )}
          {/* Número VIOLETA con prefijo/sufijo INLINE al mismo tamaño/color (diff 2 + 3). El count-up
              vive en el span interior; prefijo/sufijo son texto hermano ⇒ misma línea, mismo color. */}
          <Text
            className="st-stat-valor tabular-nums"
            fw={800}
            fz={{ base: 15, sm: 20 }}
            lh={1.1}
            style={{ color: "var(--mantine-primary-color-filled)" }}
          >
            {item.prefijo}
            <Text component="span" ref={ref} inherit>
              {num(valor)}
            </Text>
            {item.sufijo ? ` ${item.sufijo}` : ""}
          </Text>
          <Text className="st-stat-label" fz={{ base: 10, sm: 12 }} lh={1.15} c="dimmed">
            {item.etiqueta}
          </Text>
        </Stack>
      </Box>
    );
  }
  return contenido;
}
