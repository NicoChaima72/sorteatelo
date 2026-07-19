import {
  ActionIcon,
  Box,
  Group,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { ImagenConFallback } from "~/components/storefront/imagen-tenant";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type GaleriaProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `galeria` (sección, catálogo-v2 F08): 2–24 imágenes en grilla / masonry / carrusel, con lightbox
 * opcional. Cada celda usa `<ImagenConFallback>` ⇒ una URL rota (asset borrado, D11) degrada sin romper
 * la grilla (I-G). El lightbox es un `<Modal>` de Mantine (respeta la CSP/foco; sin librerías externas).
 *
 * CLS=0 (I-C): CADA celda reserva un `aspectRatio` fijo en el `<img>` real (no solo en el fallback) ⇒
 * el slot no colapsa mientras la imagen lazy carga. `grid`/`carrusel` = 1:1; `masonry` = ratios
 * VARIADOS deterministas por índice (aspecto de mampostería con altura reservada, sin CLS).
 */

/** Ratios reservados para masonry (variedad visual, altura conocida ⇒ CLS=0). Deterministas por índice. */
const RATIOS_MASONRY = ["4 / 5", "1 / 1", "3 / 4", "5 / 4"] as const;

export function Galeria({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "galeria" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const [abierto, setAbierto] = useState<number | null>(null);

  const abrir = props.lightbox ? (i: number) => setAbierto(i) : undefined;

  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg">
        {props.titulo && (
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700} ta="center">
            {props.titulo}
          </Title>
        )}

        {props.layout === "carrusel" ? (
          <ScrollArea offsetScrollbars scrollbarSize={8}>
            <Group gap="md" wrap="nowrap" align="stretch">
              {props.items.map((item, i) => (
                <Box key={i} miw={220} maw={280}>
                  <Celda item={item} ratio="1 / 1" colorPrimario={colorPrimario} onClick={abrir && (() => abrir(i))} />
                </Box>
              ))}
            </Group>
          </ScrollArea>
        ) : props.layout === "masonry" ? (
          <Box style={{ columnCount: props.columnas, columnGap: "var(--mantine-spacing-md)" }}>
            {props.items.map((item, i) => (
              <Box key={i} mb="md" style={{ breakInside: "avoid" }}>
                <Celda
                  item={item}
                  ratio={RATIOS_MASONRY[i % RATIOS_MASONRY.length]!}
                  colorPrimario={colorPrimario}
                  onClick={abrir && (() => abrir(i))}
                />
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleGrid cols={{ base: 2, sm: props.columnas }} spacing="md">
            {props.items.map((item, i) => (
              <Celda key={i} item={item} ratio="1 / 1" colorPrimario={colorPrimario} onClick={abrir && (() => abrir(i))} />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      {props.lightbox && (
        <Lightbox
          items={props.items}
          indice={abierto}
          colorPrimario={colorPrimario}
          onClose={() => setAbierto(null)}
          onNav={(d) =>
            setAbierto((i) => (i === null ? null : (i + d + props.items.length) % props.items.length))
          }
        />
      )}
    </SeccionWrapper>
  );
}

/**
 * Una celda: imagen (con fallback) + leyenda opcional; clic ⇒ lightbox (si está activo). `ratio` fija el
 * `aspectRatio` del `<img>` real ⇒ reserva el slot (CLS=0, I-C).
 */
function Celda({
  item,
  ratio,
  colorPrimario,
  onClick,
}: {
  item: GaleriaProps["items"][number];
  ratio: string;
  colorPrimario: string | null;
  onClick?: () => void;
}) {
  const radius = "var(--mantine-radius-md)";
  return (
    <Box
      className={onClick ? "animar-zoom-hover" : undefined}
      onClick={onClick}
      style={{ cursor: onClick ? "zoom-in" : undefined, overflow: "hidden", borderRadius: radius }}
    >
      <ImagenConFallback
        src={item.url}
        alt={item.alt}
        colorPrimario={colorPrimario}
        style={{ width: "100%", aspectRatio: ratio, objectFit: "cover", borderRadius: radius, display: "block" }}
      />
      {item.leyenda && (
        <Text size="xs" c="dimmed" mt={4}>
          {item.leyenda}
        </Text>
      )}
    </Box>
  );
}

/** Lightbox: `<Modal>` con la imagen ampliada + navegación anterior/siguiente (botones + flechas del teclado). */
function Lightbox({
  items,
  indice,
  colorPrimario,
  onClose,
  onNav,
}: {
  items: GaleriaProps["items"];
  indice: number | null;
  colorPrimario: string | null;
  onClose: () => void;
  onNav: (delta: number) => void;
}) {
  const abierto = indice !== null;
  const item = indice === null ? null : items[indice];

  // Navegación por teclado (accesibilidad): ←/→ mientras el lightbox está abierto.
  useEffect(() => {
    if (!abierto || items.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNav(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNav(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, items.length, onNav]);

  return (
    <Modal
      opened={abierto}
      onClose={onClose}
      size="xl"
      centered
      withCloseButton
      // Siempre un nombre accesible: la leyenda si la hay, o el alt de la imagen.
      title={item?.leyenda ?? item?.alt ?? undefined}
    >
      {item && (
        <Stack gap="sm">
          <ImagenConFallback
            src={item.url}
            alt={item.alt}
            colorPrimario={colorPrimario}
            style={{ width: "100%", height: "auto", maxHeight: "70vh", objectFit: "contain", display: "block" }}
            fallbackStyle={{ aspectRatio: "4 / 3", height: "auto" }}
          />
          {items.length > 1 && (
            <Group justify="space-between">
              <ActionIcon variant="default" radius="xl" size="lg" aria-label="Anterior" onClick={() => onNav(-1)}>
                <IconChevronLeft className="size-5" />
              </ActionIcon>
              <ActionIcon variant="default" radius="xl" size="lg" aria-label="Siguiente" onClick={() => onNav(1)}>
                <IconChevronRight className="size-5" />
              </ActionIcon>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
