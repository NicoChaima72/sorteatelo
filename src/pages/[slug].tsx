import { Alert, Box, Container, Text } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { AvisoBarra } from "~/components/storefront/aviso-barra";
import { RenderPagina } from "~/components/storefront/render-pagina";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { useInlineEdit } from "~/components/storefront/use-inline-edit";
import { usePreviewPatch } from "~/components/storefront/use-preview-patch";
import { hrefMenuItem } from "~/lib/pagebuilder/chrome";
import { derivarNav } from "~/lib/pagebuilder/nav";
import {
  getPropsPaginaTienda,
  type PropsPagina,
} from "~/server/storefront/getStorefrontProps";
import {
  fondoLienzoExterior,
  fondoShellConAmbiente,
  maxWidthColumna,
} from "~/styles/estiloSeccion";

/**
 * Página SECUNDARIA del storefront (`/[slug]`, Tanda 3 F04/D7, ADR-0016). MISMO pipeline que la home
 * (`index.tsx`): SSR anónimo cacheable desde el **Documento de Página** publicado de esa página, con el
 * mismo chrome/tema/nav. En el pages router las rutas estáticas (`/checkout`, `/producto/*`, `/editor`,
 * `/login`, `/admin`, `/api`) ganan precedencia sobre `[slug]`; además el SSR rechaza slugs reservados y
 * da 404 NEUTRAL si la página no existe/está sin publicar (I-U3, fail-closed). Preview tokenizado igual.
 */
export const getServerSideProps: GetServerSideProps<PropsPagina> = (ctx) =>
  getPropsPaginaTienda(ctx);

export default function PaginaTienda({
  tenantBranding,
  pagina,
  esPreview,
  navPaginas,
  chrome,
  slug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Documento VIVO: en preview el hook escucha los patches del editor (F09/D13); en público es el SSR fijo.
  const paginaViva = usePreviewPatch(pagina, esPreview);
  // Edición inline sobre el canvas (Tanda 3 F12/D19): SOLO en preview y dentro del iframe del editor.
  useInlineEdit(esPreview);
  const estiloShellFondo = fondoShellConAmbiente(
    paginaViva.root.props.fondoPagina,
    paginaViva.root.props.ambiente,
  );
  const columnaMaxWidth = maxWidthColumna(paginaViva.root.props.anchoContenido);
  const estiloLienzo = columnaMaxWidth
    ? fondoLienzoExterior(paginaViva.root.props.fondoPagina)
    : undefined;
  // Nav (Tanda 3 F06/D10): el menú del chrome manda; si no, anclas de esta página + páginas `enNav`.
  const menuChrome = chrome?.header.menu ?? [];
  const navItems =
    menuChrome.length > 0
      ? menuChrome.map((m) => ({ label: m.etiqueta, href: hrefMenuItem(m.destino) }))
      : [...derivarNav(paginaViva.secciones), ...navPaginas];
  const avisoSobreNav = paginaViva.overlays.find(
    (o) => o.tipo === "aviso_barra" && o.props.posicion === "sobre_nav",
  );

  return (
    <StorefrontLayout
      branding={tenantBranding}
      estiloShell={estiloShellFondo}
      estiloLienzo={estiloLienzo}
      columnaMaxWidth={columnaMaxWidth}
      navItems={navItems}
      chrome={chrome}
      avisoSobreNav={
        avisoSobreNav?.tipo === "aviso_barra" ? (
          <AvisoBarra props={avisoSobreNav.props} />
        ) : undefined
      }
    >
      <Head>
        <title>{`${slug} · ${tenantBranding.nombre}`}</title>
      </Head>
      {esPreview && (
        <>
          <Head>
            <meta name="robots" content="noindex" />
          </Head>
          <Box
            py="xs"
            style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
          >
            <Container size="lg" px={{ base: "md", lg: "xl" }}>
              <Alert
                variant="light"
                color="gray"
                icon={<IconEye className="size-[18px]" />}
                title="Vista previa del borrador"
              >
                <Text size="xs">
                  Estás viendo el Borrador de esta página, no la versión publicada.
                </Text>
              </Alert>
            </Container>
          </Box>
        </>
      )}

      <RenderPagina
        secciones={paginaViva.secciones}
        overlays={paginaViva.overlays}
        branding={tenantBranding}
      />
    </StorefrontLayout>
  );
}
