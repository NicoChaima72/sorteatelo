import {
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconDownload, IconFileText, IconScale } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { DISCLAIMER_SORTEO } from "~/lib/disclaimerSorteo";
import { hrefMenuItem } from "~/lib/pagebuilder/chrome";
import { fecha } from "~/lib/formato";
import { getPropsBases, type PropsBases } from "~/server/storefront/getBasesProps";

/**
 * Página `/bases` del storefront (admin-bases-pdf F04, D4/D5, ADR-0008): el visor de las **bases
 * legales del sorteo ACTIVO** de la Tienda. Es una ruta de PLATAFORMA (slug reservado, F04/D6), no
 * una página del builder: su contenido no lo edita el Organizador — él solo sube el PDF.
 *
 * Visor NATIVO (`<iframe>`), sin librería: `react-pdf` sería peso y complejidad contra el principio
 * rector de "simple y barato", y el navegador ya sabe renderizar un PDF servido con su Content-Type.
 * El botón «Descargar PDF» es el fallback OBLIGATORIO, no un adorno: iOS Safari renderiza mal los
 * PDFs embebidos (suele mostrar solo la primera página), así que en móvil ese botón ES el visor.
 *
 * Estado vacío neutral (D5) sin sorteo activo o sin PDF — nunca un 500 ni un iframe roto: esta URL la
 * publica el footer en TODA la tienda y se cita en documentos legales.
 */
export const getServerSideProps: GetServerSideProps<PropsBases> = (ctx) =>
  getPropsBases(ctx);

export default function BasesPage({
  tenantBranding,
  navPaginas,
  chrome,
  pdfUrl,
  sorteo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Nav: el menú del chrome manda; si no, las páginas `enNav` del tenant. Acá NO hay anclas de
  // sección que derivar (esta página no es un Documento), así que el nav derivado no aplica.
  const menuChrome = chrome?.header.menu ?? [];
  const navItems =
    menuChrome.length > 0
      ? menuChrome.map((m) => ({ label: m.etiqueta, href: hrefMenuItem(m.destino) }))
      : navPaginas;

  return (
    <StorefrontLayout branding={tenantBranding} navItems={navItems} chrome={chrome}>
      <Head>
        <title>{`Bases del sorteo · ${tenantBranding.nombre}`}</title>
        {/* Documento legal de una tienda concreta: no aporta a la búsqueda y no queremos que
            compita con la home de la tienda en los resultados. */}
        <meta name="robots" content="noindex" />
      </Head>

      <Container size="lg" py="xl" px={{ base: "md", lg: "xl" }}>
        <Stack gap="lg">
          <div>
            <Title order={1} fz={{ base: 26, sm: 34 }} fw={800}>
              Bases del sorteo
            </Title>
            {sorteo && (
              <Text c="dimmed" mt={4}>
                {/* La fecha llega como ISO string: las props de `getServerSideProps` son JSON y un
                    `Date` crudo hace lanzar a Next (500 en toda la tienda). Se rehidrata acá. */}
                {sorteo.nombre} · {sorteo.premio} · vigente hasta el{" "}
                {fecha(new Date(sorteo.fechaFinIso))}
              </Text>
            )}
          </div>

          {pdfUrl ? (
            <VisorPdf url={pdfUrl} />
          ) : (
            <SinBases haySorteo={sorteo !== null} nombreTienda={tenantBranding.nombre} />
          )}

          {/* Disclaimer de ADR-0008 (I4): la responsabilidad del sorteo es del Organizador. Acá es
              MÁS necesario que en la vitrina — es la página de las bases legales. */}
          <Alert
            variant="light"
            color="gray"
            icon={<IconScale className="size-[18px]" />}
            title="Responsabilidad del sorteo"
          >
            {/* Fuente ÚNICA (`~/lib/disclaimerSorteo`): la vitrina y esta página muestran el MISMO
                texto. Estaban duplicados como literales y ya habían divergido. */}
            <Text size="xs">{DISCLAIMER_SORTEO}</Text>
          </Alert>
        </Stack>
      </Container>
    </StorefrontLayout>
  );
}

/**
 * Visor embebido + descarga. El `<iframe>` es best-effort (desktop lo renderiza; iOS Safari no
 * siempre) y por eso el botón de descarga va ARRIBA, visible sin scrollear: es la vía que SIEMPRE
 * funciona. `title` en el iframe por accesibilidad (lector de pantalla).
 */
function VisorPdf({ url }: { url: string }) {
  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="wrap">
        <Button
          component="a"
          href={url}
          target="_blank"
          rel="noreferrer"
          leftSection={<IconDownload className="size-4" />}
        >
          Descargar PDF
        </Button>
        <Text size="xs" c="dimmed">
          ¿No ves el documento? Ábrelo con el botón: algunos navegadores móviles no muestran PDFs
          incrustados.
        </Text>
      </Group>

      <Box
        style={{
          borderRadius: "var(--mantine-radius-md)",
          border: "1px solid var(--mantine-color-default-border)",
          overflow: "hidden",
          background: "var(--mantine-color-default-hover)",
        }}
      >
        <iframe
          src={url}
          title="Bases del sorteo"
          style={{ display: "block", width: "100%", height: "80vh", border: "none" }}
        />
      </Box>
    </Stack>
  );
}

/** Estado vacío neutral (D5): sin sorteo activo, o con sorteo pero sin PDF subido todavía. */
function SinBases({
  haySorteo,
  nombreTienda,
}: {
  haySorteo: boolean;
  nombreTienda: string;
}) {
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
      <IconFileText
        className="size-8"
        stroke={1.5}
        color="var(--mantine-color-dimmed)"
      />
      <Text fw={600}>
        {haySorteo
          ? "Las bases todavía no están publicadas"
          : "Ahora mismo no hay un sorteo activo"}
      </Text>
      <Text size="sm" c="dimmed" ta="center" maw={480}>
        {haySorteo ? (
          <>
            {nombreTienda} aún no subió el documento con las bases de su sorteo. Vuelve a
            intentarlo en un rato.
          </>
        ) : (
          <>
            Cuando {nombreTienda} tenga un sorteo en curso, sus bases se publican acá.
          </>
        )}
      </Text>
      <Anchor href="/" size="sm" mt="xs">
        Volver a la tienda
      </Anchor>
    </Stack>
  );
}
