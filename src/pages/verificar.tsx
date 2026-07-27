import {
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconScale, IconSearch, IconTicket } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { useState } from "react";

import { BoletosDelSorteo } from "~/components/storefront/boletos-del-sorteo";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { DISCLAIMER_SORTEO } from "~/lib/disclaimerSorteo";
import { fecha } from "~/lib/formato";
import { getPropsVerificar, type PropsVerificar } from "~/server/storefront/getVerificarProps";
import { estiloHeredadoDeTema } from "~/styles/estiloSeccion";
import { api } from "~/utils/api";

/**
 * Página `/verificar` del storefront (verificador-tickets F03, D3): el **verificador público de
 * tickets**. El Comprador escribe el correo con el que compró y ve sus Números del sorteo ACTIVO
 * (ADR-0024). Es la moneda de confianza estándar del nicho y lo que la landing ya promete.
 *
 * Ruta de PLATAFORMA (slug reservado, D3), no una página del builder: su contenido no lo edita el
 * Organizador, y el enlace va PINNED en el header y el footer de TODAS las tiendas (D8). Por eso
 * hereda tema, chrome y nav exactamente como `/bases` (D10) — quien llega desde el header tiene que
 * seguir sintiendo que está en la misma tienda.
 *
 * Sin cuentas (ADR-0004): el correo ES la identidad. Y sin PII en la respuesta (I2): lo único que
 * baja del server son los números, el prefijo y el nombre del sorteo — ni siquiera el correo que se
 * buscó vuelve. Un correo sin tickets recibe el MISMO mensaje neutral que uno que jamás compró (D4):
 * la página no sirve para confirmar la existencia de la compra de un tercero.
 *
 * `noindex` como `/bases`: es una superficie de consulta de una tienda concreta, no contenido que
 * deba competir en buscadores.
 */
export const getServerSideProps: GetServerSideProps<PropsVerificar> = (ctx) =>
  getPropsVerificar(ctx);

export default function VerificarPage({
  tenantBranding,
  navItems,
  chrome,
  temaPagina,
  sorteo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Fondo/tipografía/radio heredados de la Tienda (tema-paginas F03). Tema default ⇒ `undefined` en
  // ambas ⇒ la página sale byte-idéntica a como saldría sin herencia.
  const { estiloShell, colorPagina } = estiloHeredadoDeTema(temaPagina);

  return (
    <StorefrontLayout
      branding={tenantBranding}
      navItems={navItems}
      chrome={chrome}
      estiloShell={estiloShell}
      colorPagina={colorPagina}
    >
      <Head>
        <title>{`Verificar tickets · ${tenantBranding.nombre}`}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <Container size="sm" py="xl" px={{ base: "md", lg: "xl" }}>
        <Stack gap="lg">
          <div>
            <Title order={1} fz={{ base: 26, sm: 34 }} fw={800}>
              Verifica tus tickets
            </Title>
            {sorteo && (
              <Text c="dimmed" mt={4}>
                {/* La fecha llega como ISO string: las props del SSR son JSON y un `Date` crudo hace
                    lanzar a Next. Se rehidrata acá, con el helper único de formato. */}
                {sorteo.nombre} · {sorteo.premio} · hasta el{" "}
                {fecha(new Date(sorteo.fechaFinIso))}
              </Text>
            )}
          </div>

          {sorteo ? (
            <BuscadorDeTickets />
          ) : (
            <SinSorteoActivo nombreTienda={tenantBranding.nombre} />
          )}

          {/* Disclaimer de ADR-0008: la responsabilidad del sorteo es del Organizador. Mismo texto
              único que la vitrina y `/bases` (`~/lib/disclaimerSorteo`), nunca un literal nuevo. */}
          <Alert
            variant="light"
            color="gray"
            icon={<IconScale className="size-[18px]" />}
            title="Responsabilidad del sorteo"
          >
            <Text size="xs">{DISCLAIMER_SORTEO}</Text>
          </Alert>
        </Stack>
      </Container>
    </StorefrontLayout>
  );
}

/**
 * Copy de los dos finales sin boletos. Fuera del componente y con las dos propiedades requeridas
 * (frontend-conventions § Avisos y tablas de copy por estado): si mañana aparece un tercer final,
 * no compila hasta que alguien le escriba el suyo.
 *
 * `cuota` NO ecoa el mensaje del server aunque el `DomainError` traiga uno humano: el copy de una
 * pantalla vive en la pantalla (y así el E2E puede asertar un texto estable). `generico` es a
 * propósito vago —no hay nada útil que decirle a alguien sobre un fallo de red— pero ofrece la
 * salida real, que es reintentar.
 */
const COPY_ERROR: Record<"cuota" | "generico", { titulo: string; cuerpo: string }> = {
  cuota: {
    titulo: "Demasiadas búsquedas seguidas",
    cuerpo:
      "Espera un minuto y vuelve a intentarlo. Es un límite para evitar que alguien use esta página para probar correos ajenos.",
  },
  generico: {
    titulo: "No pudimos hacer la búsqueda",
    cuerpo: "Algo falló de nuestro lado. Vuelve a intentarlo en unos segundos.",
  },
};

/**
 * El formulario + su resultado. Solo se monta cuando hay sorteo ACTIVO (D2): sin sorteo no se
 * ofrece una búsqueda que no puede encontrar nada.
 *
 * Es una QUERY con `enabled` y no una mutation porque no escribe nada; el `refetchOnWindowFocus`
 * apagado es load-bearing y no higiene: cada refetch consumiría una unidad de la cuota del rate
 * limit (D5), o sea que volver a la pestaña podría dejar a la persona sin poder buscar.
 */
function BuscadorDeTickets() {
  // El correo YA BUSCADO, que es lo que dispara la query. Separado del valor del input a propósito:
  // así tipear no consulta nada, y el resultado en pantalla siempre corresponde a lo que se envió.
  const [buscado, setBuscado] = useState<string | null>(null);

  const form = useForm({
    initialValues: { email: "" },
    validate: {
      // Espejo mínimo y legítimo: solo obligatoriedad + forma evidente. El veredicto real lo da el
      // Zod del server; acá alcanza con no gastar un intento de la cuota en un campo vacío.
      email: (v) =>
        /^\S+@\S+\.\S+$/.test(v.trim())
          ? null
          : "Escribe el correo con el que hiciste la compra",
    },
  });

  const q = api.checkout.verificarTickets.useQuery(
    { email: buscado ?? "" },
    { enabled: buscado !== null, retry: false, refetchOnWindowFocus: false },
  );

  const buscando = buscado !== null && q.isFetching;
  const hayResultado = buscado !== null && !q.isFetching && !q.isError;

  return (
    <Stack gap="md">
      <form onSubmit={form.onSubmit((v) => setBuscado(v.email.trim()))}>
        {/* `align="flex-end"` alinea el botón con el input (no con su label) y `wrap` lo baja a una
            segunda línea cuando no entran los dos — el `flex-basis` de 220px hace que eso ocurra
            solo abajo de ~320px, que es justo el ancho donde el botón al lado sería ilegible. */}
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            {...form.getInputProps("email")}
            label="Tu correo"
            placeholder="tucorreo@ejemplo.cl"
            type="email"
            inputMode="email"
            autoComplete="email"
            style={{ flex: "1 1 220px" }}
          />
          <Button
            type="submit"
            loading={buscando}
            leftSection={<IconSearch className="size-4" />}
          >
            Buscar
          </Button>
        </Group>
      </form>

      {q.isError && (
        <ErrorDeBusqueda
          tipo={q.error.data?.code === "TOO_MANY_REQUESTS" ? "cuota" : "generico"}
          onReintentar={() => void q.refetch()}
        />
      )}

      {hayResultado &&
        (q.data && q.data.numeros.length > 0 ? (
          <CajaResultado>
            <BoletosDelSorteo numeros={q.data.numeros} prefijo={q.data.prefijo} />
          </CajaResultado>
        ) : (
          <CajaResultado>
            {/* D4: este es EL MISMO mensaje para un correo que nunca compró y para uno que compró
                sin tickets. Que sean indistinguibles es la decisión, no una simplificación: si
                dijeran cosas distintas, cualquiera podría averiguar si un tercero compró acá. */}
            <Stack align="center" gap={4}>
              <Text fw={600} ta="center">
                No encontramos tickets del sorteo actual para ese correo
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Revisa que sea el mismo correo con el que hiciste la compra. Los tickets aparecen
                acá una vez que el pago quedó confirmado.
              </Text>
            </Stack>
          </CajaResultado>
        ))}
    </Stack>
  );
}

/** Contenedor del resultado: la misma caja punteada del estado vacío, para que los dos finales de la
 *  búsqueda ocupen el mismo lugar y el mismo peso visual (no se «salta» la página al buscar). */
function CajaResultado({ children }: { children: React.ReactNode }) {
  return (
    <Box
      py="lg"
      px="md"
      style={{
        borderRadius: "var(--mantine-radius-md)",
        border: "1px dashed var(--mantine-color-default-border)",
      }}
    >
      {children}
    </Box>
  );
}

/** Fallo de la búsqueda: cuota agotada (D5) o cualquier otro. Siempre con la salida a mano. */
function ErrorDeBusqueda({
  tipo,
  onReintentar,
}: {
  tipo: "cuota" | "generico";
  onReintentar: () => void;
}) {
  const copy = COPY_ERROR[tipo];
  return (
    <Alert variant="light" color="red" title={copy.titulo}>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{copy.cuerpo}</Text>
        <Button size="xs" variant="default" onClick={onReintentar}>
          Reintentar
        </Button>
      </Stack>
    </Alert>
  );
}

/**
 * Estado vacío neutral sin sorteo ACTIVO (D2/I5): la página existe en TODAS las tiendas y en todo
 * momento, así que tiene que saber decir «ahora mismo no hay nada que verificar» sin romperse ni
 * ofrecer un formulario inútil. No muestra sorteos pasados ni ganadores (D11).
 */
function SinSorteoActivo({ nombreTienda }: { nombreTienda: string }) {
  return (
    <Stack
      align="center"
      gap="xs"
      py="xl"
      style={{
        borderRadius: "var(--mantine-radius-md)",
        border: "1px dashed var(--mantine-color-default-border)",
      }}
    >
      <IconTicket className="size-8" stroke={1.5} color="var(--mantine-color-dimmed)" />
      <Text fw={600}>Ahora mismo no hay un sorteo activo</Text>
      <Text size="sm" c="dimmed" ta="center" maw={480}>
        Cuando {nombreTienda} tenga un sorteo en curso, acá vas a poder buscar tus números con el
        correo que usaste para comprar.
      </Text>
      <Anchor href="/" size="sm" mt="xs">
        Volver a la tienda
      </Anchor>
    </Stack>
  );
}
