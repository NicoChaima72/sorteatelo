import {
  AspectRatio,
  Box,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { clp } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { gradientePortadaDeterminista } from "~/styles/tenantTheme";
import { api } from "~/utils/api";

/**
 * `producto_spotlight` (widget, Tanda 2 F15/fidelidad editorial): destaca UN producto — "El objeto del
 * deseo" del prototipo editorial. Resuelve el producto por REFERENCIA (`productoId`, I2/ADR-0017) tenant-
 * scoped SERVER-SIDE vía `listarProductosDeCatalogo` (mismo procedimiento que el catálogo, D6/I1 — jamás
 * copia precio/título al documento). Sin `productoId` ⇒ el 1er producto activo (degradación, I-G). Renderiza
 * una FILA editorial: mini portada (imagen o `TapaLibro` tematizada) + «título» en cita serif + autoría +
 * descripción + PRECIO REAL (`Product.precio`, CLP con `Intl.NumberFormat`, tabular-nums — §5) + CTA al
 * detalle. Se auto-oculta si no hay producto (I-G). Cero hex inline (I-A).
 */
export function ProductoSpotlight({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "producto_spotlight" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const tieneRef = props.productoId != null;
  // Resolución tenant-scoped server-side (I1/I2): con referencia ⇒ ese producto; sin ella ⇒ el 1er activo.
  const query = api.checkout.listarProductosDeCatalogo.useQuery(
    tieneRef
      ? { modo: "seleccion", productoIds: [props.productoId!] }
      : { modo: "todos" },
  );
  const producto = query.data?.[0] ?? null;

  // Auto-oculto si no hay producto (I-G): no deja un hueco ni un placeholder roto.
  if (!query.isLoading && !producto) return null;

  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="lg">
        {props.titulo && (
          <Title
            order={2}
            fz={{ base: 24, sm: 30 }}
            fw={700}
            style={{ fontFamily: "var(--mantine-font-family-headings)" }}
          >
            {props.titulo}
          </Title>
        )}

        {query.isLoading || !producto ? (
          <Group gap="lg" align="flex-start" wrap="nowrap">
            <Skeleton width={112} height={168} radius="sm" />
            <Stack gap="sm" style={{ flex: 1 }}>
              <Skeleton height={18} width="70%" />
              <Skeleton height={12} width="40%" />
              <Skeleton height={48} />
              <Skeleton height={24} width="30%" />
            </Stack>
          </Group>
        ) : (
          <Group gap="xl" align="flex-start" wrap="nowrap">
            <PortadaSpotlight
              url={producto.portadaUrl}
              titulo={producto.titulo}
              colorPrimario={colorPrimario}
            />
            <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Text
                fw={700}
                fz={{ base: 17, sm: 19 }}
                lh={1.25}
                style={{ fontFamily: "var(--mantine-font-family-headings)", fontStyle: "italic" }}
              >
                «{producto.titulo}»
              </Text>
              {props.autoria && (
                <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.12em" }}>
                  {props.autoria}
                </Text>
              )}
              <Text size="sm" c="dimmed" mt={4}>
                {producto.descripcion}
              </Text>
              <Text
                fw={700}
                fz={{ base: 22, sm: 26 }}
                mt="sm"
                className="tabular-nums"
                style={{
                  fontFamily: "var(--mantine-font-family-headings)",
                  color: "var(--mantine-primary-color-filled)",
                }}
              >
                {clp(producto.precio)}
              </Text>
              <Button
                component={Link}
                href={`/producto/${producto.id}`}
                size="sm"
                variant="filled"
                mt="xs"
                style={{ width: "fit-content" }}
              >
                {props.ctaTexto ?? "Quiero este"}
              </Button>
            </Stack>
          </Group>
        )}
      </Stack>
    </SeccionWrapper>
  );
}

/**
 * Mini portada del spotlight: la imagen del producto, o una TAPA DE LIBRO tematizada (gradiente del set
 * curado de la familia de marca + título en la tapa) cuando no hay imagen (I-G). Compacta (~112×168, 2:3).
 * `aria-hidden`: el título accesible ya vive en la cita `«...»`. Cero hex (I-A).
 */
function PortadaSpotlight({
  url,
  titulo,
  colorPrimario,
}: {
  url: string | null;
  titulo: string;
  colorPrimario: string | null;
}) {
  return (
    <Box style={{ flex: "0 0 112px", width: 112 }}>
      <AspectRatio ratio={2 / 3}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={titulo}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              borderRadius: "var(--mantine-radius-sm)",
              boxShadow: "6px 8px 0 0 color-mix(in srgb, var(--mantine-color-black) 10%, transparent)",
            }}
          />
        ) : (
          <Box
            aria-hidden
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "hidden",
              borderRadius: "var(--mantine-radius-sm)",
              background: gradientePortadaDeterminista(colorPrimario, titulo),
              boxShadow: "6px 8px 0 0 color-mix(in srgb, var(--mantine-color-black) 10%, transparent)",
            }}
          >
            <Text
              fz={11}
              lineClamp={5}
              style={{
                position: "absolute",
                left: 10,
                right: 10,
                top: 10,
                fontFamily: "var(--mantine-font-family-headings)",
                textTransform: "uppercase",
                fontWeight: 700,
                lineHeight: 1.15,
                color: "var(--mantine-color-white)",
              }}
            >
              {titulo}
            </Text>
          </Box>
        )}
      </AspectRatio>
    </Box>
  );
}
