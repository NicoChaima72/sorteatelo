import { Center, Container, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconPlayerPause } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";

import {
  getPropsEnPausa,
  type PropsStorefront,
} from "~/server/storefront/getStorefrontProps";

/**
 * Página NEUTRAL de una Tienda en pausa (facturación F05/D4, ADR-0026). Es el destino al que el gate
 * de venta manda a los visitantes cuando la Tienda dejó de vender — dunning de Flow agotado, plan
 * cancelado con el período cerrado, o cortesía vencida.
 *
 * **No nombra el motivo**, y eso es la decisión de diseño de esta página: la mora es un asunto entre
 * la Plataforma y el Organizador, y contarle a un visitante que «esta tienda no pagó» sería quemar al
 * cliente que se supone que vamos a recuperar. Tampoco es un error del visitante ⇒ nada en `red`
 * (design.md §9 reserva el rojo para errores y acciones destructivas): la pausa es un estado, se
 * comunica en neutros.
 *
 * Sí dice explícitamente que las compras anteriores siguen valiendo (I5): es la única parte del
 * mensaje que le importa a quien ya le compró a esta tienda, y su descarga de verdad sigue viva —
 * `/api/descargas/[token]` no pasa por este gate.
 *
 * `noindex` porque es un estado transitorio: no queremos que el buscador se quede con esta versión de
 * la tienda. Y el SSR reconsulta el gate, así que en cuanto la Tienda regulariza esta URL redirige a
 * la home en vez de seguir mostrando un cartel viejo.
 */
export const getServerSideProps: GetServerSideProps<PropsStorefront> = (ctx) =>
  getPropsEnPausa(ctx);

export default function EnPausaPage({
  tenantBranding,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>{`${tenantBranding.nombre} · en pausa`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Center mih="100vh" px="md">
        <Container size="xs">
          <Stack align="center" gap="md">
            <ThemeIcon variant="light" color="gray" radius="xl" size={56}>
              <IconPlayerPause className="size-7" stroke={1.5} />
            </ThemeIcon>

            <Title order={1} ta="center" fz={{ base: "h3", sm: "h2" }}>
              {tenantBranding.nombre} está en pausa
            </Title>

            <Text ta="center" c="dimmed">
              Esta tienda no está recibiendo pedidos por ahora. Vuelve a intentarlo en
              unos días.
            </Text>

            {/* Voz: tuteo y sin género (design.md §8). El «Tranquila» que tenía esta línea daba por
                sentada una compradora mujer — servía para la tienda de la autora ARMY, no para una
                plataforma multi-tenant donde esta página la ve el público de cualquier Tienda. */}
            <Text ta="center" size="sm" c="dimmed" mt="xs">
              ¿Ya compraste acá? Tu descarga sigue disponible con el enlace que te llegó
              por correo.
            </Text>
          </Stack>
        </Container>
      </Center>
    </>
  );
}
