import {
  Anchor,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";

import { useCarrito } from "~/components/storefront/carrito";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { clp } from "~/lib/formato";
import {
  getPropsPaginaComprador,
  type PropsStorefront,
} from "~/server/storefront/getStorefrontProps";
import { api } from "~/utils/api";

/**
 * Detalle de un producto del storefront (F03). Página EXCLUSIVA del Comprador: fuera de un
 * storefront (apex / host sin Tienda publicada) responde `notFound` neutral (I2/ADR-0007). El
 * producto se lee tenant-scoped server-side por tRPC (`getProductoStorefront`); un `id` de otra
 * Tienda / inactivo / inexistente ⇒ NOT_FOUND ⇒ estado neutral "no encontrado".
 */
export const getServerSideProps: GetServerSideProps<PropsStorefront> = async (
  ctx,
) => getPropsPaginaComprador(ctx);

export default function ProductoPage({
  tenantBranding,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;

  return (
    <StorefrontLayout branding={tenantBranding}>
      {id ? <Detalle id={id} /> : <NoEncontrado />}
    </StorefrontLayout>
  );
}

function Detalle({ id }: { id: string }) {
  const producto = api.checkout.getProductoStorefront.useQuery(
    { id },
    { retry: false },
  );
  const { contiene, agregar, quitar } = useCarrito();

  if (producto.isLoading) {
    return (
      <Stack gap="md" maw={640}>
        <Skeleton height={32} width="70%" />
        <Skeleton height={20} width={120} />
        <Skeleton height={120} />
      </Stack>
    );
  }

  if (producto.isError) {
    // NOT_FOUND (otra Tienda / inactivo / inexistente) ⇒ respuesta neutral (I2). Un error de red
    // transitorio ⇒ Reintentar (no lo confundimos con "no existe").
    return producto.error.data?.code === "NOT_FOUND" ? (
      <NoEncontrado />
    ) : (
      <Stack align="center" py="xl" gap="sm">
        <Text size="sm" c="red">
          No pudimos cargar este producto.
        </Text>
        <Button
          variant="default"
          size="xs"
          onClick={() => void producto.refetch()}
        >
          Reintentar
        </Button>
      </Stack>
    );
  }

  if (!producto.data) return <NoEncontrado />;

  const p = producto.data;
  const enCarrito = contiene(p.id);

  return (
    <Stack gap="lg" maw={720}>
      <Anchor component={Link} href="/" size="sm" c="dimmed">
        <Group gap={4} wrap="nowrap">
          <IconArrowLeft className="size-4" stroke={1.75} />
          Volver a la tienda
        </Group>
      </Anchor>

      {p.portadaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.portadaUrl}
          alt={p.titulo}
          style={{
            width: "100%",
            maxHeight: 360,
            objectFit: "cover",
            borderRadius: "var(--mantine-radius-md)",
          }}
        />
      )}

      <Stack gap="xs">
        <Title order={1} fz={{ base: 24, sm: 30 }} lh={1.2}>
          {p.titulo}
        </Title>
        <Text fw={700} fz="xl" className="tabular-nums">
          {clp(p.precio)}
        </Text>
      </Stack>

      <Text style={{ whiteSpace: "pre-wrap" }}>{p.descripcion}</Text>

      <Group gap="sm">
        {enCarrito ? (
          <Button variant="light" color="gray" onClick={() => quitar(p.id)}>
            Quitar del carrito
          </Button>
        ) : (
          <Button
            onClick={() =>
              agregar({ id: p.id, titulo: p.titulo, precio: p.precio })
            }
          >
            Agregar al carrito
          </Button>
        )}
        <Button component={Link} href="/checkout" variant="default">
          Ir a pagar
        </Button>
      </Group>
    </Stack>
  );
}

function NoEncontrado() {
  return (
    <Stack align="center" py="xl" gap="sm">
      <Text fw={600}>No encontramos este producto</Text>
      <Text size="sm" c="dimmed" ta="center">
        Puede que ya no esté disponible en esta tienda.
      </Text>
      <Anchor component={Link} href="/" size="sm">
        Volver a la tienda
      </Anchor>
    </Stack>
  );
}
