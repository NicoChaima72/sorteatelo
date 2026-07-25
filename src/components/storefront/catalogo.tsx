import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconBooks, IconGift } from "@tabler/icons-react";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { StepperCantidad } from "~/components/storefront/stepper-cantidad";
import { clp } from "~/lib/formato";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { gradientePortadaDeterminista } from "~/styles/tenantTheme";
import { api, type RouterOutputs } from "~/utils/api";

/** Tipo derivado del backend (no redeclarar el shape a mano). */
type ProductoCatalogo =
  RouterOutputs["checkout"]["listarProductosDeCatalogo"][number];

/**
 * Catálogo del page builder (widget `catalogo`, F05/ADR-0016; plantilla-rica F04, design.md §5.1 pto
 * 3): grid de tarjetas con portada, título, precio (`tabular-nums`, CLP, I4), badge "Sorteo" y
 * agregar/stepper de cantidad. Las props vienen del Documento (`props.titulo`/`modo`/`productoIds`/
 * `columnas`). Reusa `checkout.listarProductosDeCatalogo` (tenant-scoped server-side, I1; referencias
 * ajenas/inactivas descartadas en silencio, D6). Card sin portada ⇒ placeholder temático (§5.2).
 */
export function CatalogoStorefront({
  nodo,
  colorPrimario,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "catalogo" }>;
  colorPrimario: string | null;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const productos = api.checkout.listarProductosDeCatalogo.useQuery({
    modo: props.modo,
    productoIds: props.productoIds,
  });
  const cols = { base: 1, sm: 2, md: props.columnas };
  const esCarrusel = props.layout === "carrusel";

  return (
    <SeccionWrapper
      id={nodo.id}
      estilo={nodo.estilo}
      divisorColor={divisorColor}
    >
      <Stack gap="lg">
        <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
          {props.titulo}
        </Title>

        {productos.isLoading ? (
          <SimpleGrid cols={cols} spacing="lg">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={320} radius="md" />
            ))}
          </SimpleGrid>
        ) : productos.isError ? (
          <Stack align="center" py="xl" gap="sm">
            <Text size="sm" c="red">
              No pudimos cargar los productos.
            </Text>
            <Button
              variant="default"
              size="xs"
              onClick={() => void productos.refetch()}
            >
              Reintentar
            </Button>
          </Stack>
        ) : !productos.data || productos.data.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            <IconBooks
              className="size-8"
              stroke={1.5}
              color="var(--mantine-color-dimmed)"
            />
            <Text size="sm" c="dimmed" ta="center">
              Esta tienda todavía no tiene productos publicados.
            </Text>
          </Stack>
        ) : esCarrusel ? (
          <CarruselCatalogo productos={productos.data} colorPrimario={colorPrimario} />
        ) : (
          <SimpleGrid cols={cols} spacing="lg">
            {productos.data.map((producto) => (
              <TarjetaProducto
                key={producto.id}
                producto={producto}
                colorPrimario={colorPrimario}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </SeccionWrapper>
  );
}

/**
 * Layout `carrusel` (Tanda 2 F13): fila horizontal de covers con auto-scroll CSS continuo (patrón
 * marquee de `cinta_texto`). La pista lleva las tarjetas DUPLICADAS (2ª copia `aria-hidden` + clase
 * `carrusel-marquee-dup`) ⇒ `translateX(-50%)` hace un loop sin costura; pausa en hover. Con
 * `prefers-reduced-motion` la pista NO anima y el contenedor pasa a scroll manual (`overflow-x`),
 * ocultando la copia (globals.css). Covers compactos (~220px, retrato) como el carrusel del prototipo.
 */
function CarruselCatalogo({
  productos,
  colorPrimario,
}: {
  productos: ProductoCatalogo[];
  colorPrimario: string | null;
}) {
  const item = (producto: ProductoCatalogo, dup: boolean) => (
    <Box
      key={dup ? `dup-${producto.id}` : producto.id}
      aria-hidden={dup || undefined}
      className={dup ? "carrusel-marquee-dup" : undefined}
      style={{ flex: "0 0 220px", marginInlineEnd: "var(--mantine-spacing-md)" }}
    >
      <TarjetaProducto producto={producto} colorPrimario={colorPrimario} retrato />
    </Box>
  );
  return (
    <Box className="carrusel-marquee carrusel-marquee-pausa">
      <Box className="carrusel-marquee-pista">
        {productos.map((p) => item(p, false))}
        {productos.map((p) => item(p, true))}
      </Box>
    </Box>
  );
}

function TarjetaProducto({
  producto,
  colorPrimario,
  retrato,
}: {
  producto: ProductoCatalogo;
  colorPrimario: string | null;
  /** Carrusel (F13): cover en retrato (3:4) tipo el prototipo, en vez del 4:3 de la grilla. */
  retrato?: boolean;
}) {
  const { contiene, agregar, quitar } = useCarrito();
  const enCarrito = contiene(producto.id);

  return (
    <Card
      withBorder
      radius="md"
      padding={0}
      className="h-full animar-hover-lift animar-zoom-hover"
    >
      <Stack gap={0} h="100%">
        <Portada
          url={producto.portadaUrl}
          titulo={producto.titulo}
          colorPrimario={colorPrimario}
          participaEnSorteo={producto.participaEnSorteo}
          esNuevo={producto.esNuevo}
          retrato={retrato}
        />

        <Stack gap="sm" p="md" className="flex-1">
          <Stack gap={4} className="flex-1">
            <Text
              component={Link}
              href={`/producto/${producto.id}`}
              fw={600}
              lineClamp={2}
            >
              {producto.titulo}
            </Text>
            <Text size="sm" c="dimmed" lineClamp={2}>
              {producto.descripcion}
            </Text>
          </Stack>

          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text fw={700} className="tabular-nums">
              {clp(producto.precio)}
            </Text>
            {enCarrito ? (
              <Group gap="xs" wrap="nowrap">
                <StepperCantidad id={producto.id} size="sm" />
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => quitar(producto.id)}
                >
                  Quitar
                </Button>
              </Group>
            ) : (
              <Button
                size="xs"
                onClick={() =>
                  agregar({
                    id: producto.id,
                    titulo: producto.titulo,
                    precio: producto.precio,
                  })
                }
              >
                Agregar
              </Button>
            )}
          </Group>
        </Stack>
      </Stack>
    </Card>
  );
}

/** Portada del producto: imagen, o TAPA DE LIBRO tematizada si no hay (§5.2; F13). */
function Portada({
  url,
  titulo,
  colorPrimario,
  participaEnSorteo,
  esNuevo,
  retrato,
}: {
  url: string | null;
  titulo: string;
  colorPrimario: string | null;
  participaEnSorteo: boolean;
  esNuevo: boolean;
  retrato?: boolean;
}) {
  return (
    <Box pos="relative" style={{ aspectRatio: retrato ? "3 / 4" : "4 / 3", overflow: "hidden" }}>
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
          }}
        />
      ) : (
        <TapaLibro titulo={titulo} colorPrimario={colorPrimario} />
      )}

      {participaEnSorteo && (
        <Badge
          variant="filled"
          radius="sm"
          leftSection={<IconGift className="size-3" stroke={2} />}
          pos="absolute"
          top={8}
          left={8}
          styles={{ label: { textTransform: "none" } }}
        >
          Sorteo
        </Badge>
      )}

      {/* Badge DERIVADO "Nuevo" (F13): producto creado hace < 30 días (dato del use case, no persistido).
          Esquina opuesta al "Sorteo" ⇒ no se pisan. `variant="white"` = fondo blanco + texto de marca. */}
      {esNuevo && (
        <Badge
          variant="white"
          radius="sm"
          pos="absolute"
          top={8}
          right={8}
          styles={{ label: { textTransform: "none" } }}
        >
          Nuevo
        </Badge>
      )}
    </Box>
  );
}

/**
 * Fallback de portada cuando el producto no tiene imagen (Tanda 2 F13): una TAPA DE LIBRO diseñada, no
 * una inicial gigante. El fondo es un gradiente del SET CURADO acotado a la FAMILIA de marca del tenant
 * (`gradientePortadaDeterminista`, determinista por título — cero hex, sin `hue-rotate` que metía azules).
 * Detalles que hacen leer "libro": un LOMO sutil (franja vertical cerca del borde izquierdo) + el TÍTULO
 * EN la tapa (uppercase, display font del tema, abajo-izquierda con padding), sobre un scrim inferior de
 * tono profundo de marca que garantiza legibilidad sobre cualquier gradiente del set. `aria-hidden`: el
 * título accesible ya vive en el `<Text>` de la tarjeta. CSS 100% de tokens (I-A), sin motion (I-C).
 */
function TapaLibro({
  titulo,
  colorPrimario,
}: {
  titulo: string;
  colorPrimario: string | null;
}) {
  return (
    <Box
      aria-hidden
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: gradientePortadaDeterminista(colorPrimario, titulo),
      }}
    >
      {/* Lomo del libro: fina franja vertical clara cerca del borde izquierdo. */}
      <Box
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 14,
          width: 3,
          background: "color-mix(in srgb, var(--mantine-color-white) 22%, transparent)",
        }}
      />
      {/* Scrim inferior (tono profundo de marca) ⇒ el título blanco es legible sobre cualquier gradiente. */}
      <Box
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--mantine-primary-color-9) 62%, transparent), transparent 58%)",
        }}
      />
      {/* Título EN la tapa: uppercase, bold, display font del tema, abajo-izquierda con padding generoso. */}
      <Text
        fz={{ base: 15, sm: 17 }}
        lineClamp={4}
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 18,
          fontFamily: "var(--mantine-font-family-headings)",
          textTransform: "uppercase",
          fontWeight: 800,
          lineHeight: 1.12,
          letterSpacing: "0.01em",
          color: "var(--mantine-color-white)",
          textShadow: "0 1px 12px color-mix(in srgb, var(--mantine-color-black) 45%, transparent)",
        }}
      >
        {titulo}
      </Text>
    </Box>
  );
}
