import { Alert, Box, Container, Text } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { LandingPlataforma } from "~/components/landing/landing-plataforma";
import { RenderPagina } from "~/components/storefront/render-pagina";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { type PageDocument } from "~/lib/pagebuilder/schema";
import {
  getPropsHome,
  type PropsHome,
} from "~/server/storefront/getStorefrontProps";
import { colorSolidoDeEsquema } from "~/styles/estiloSeccion";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Home agnóstica al host (D1). El mismo archivo despacha por ZONA resuelta server-side en
 * `getServerSideProps`:
 * - subdominio con Tienda PUBLICADA ⇒ home del storefront renderizada desde el **Documento de
 *   Página** (page builder, F05/ADR-0016): `publishedJson`, o el Borrador si es una preview con
 *   token válido (`esPreview`);
 * - apex/`www` ⇒ landing oficial de la plataforma «El Talonario» (`LandingPlataforma`, indexable);
 * - host sin Tienda publicada ⇒ `notFound` neutral (I2/ADR-0007), no llega acá.
 */
export const getServerSideProps: GetServerSideProps<PropsHome> = async (ctx) =>
  getPropsHome(ctx);

export default function HomePage({
  tenantBranding,
  pagina,
  esPreview,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (!tenantBranding || !pagina) return <LandingPlataforma />;
  return (
    <StorefrontHome
      branding={tenantBranding}
      pagina={pagina}
      esPreview={esPreview}
    />
  );
}

/**
 * Home del storefront: el chrome (header/footer) sigue leyendo las columnas del Tenant (R1: chrome
 * fijo) y las SECCIONES + OVERLAYS se renderizan desde el Documento de Página (F05/F10). El
 * `avisoTexto` ya NO vive en el chrome: F10 lo migró al overlay `aviso_barra` (lo renderiza
 * `RenderPagina`). Todo tematizado per-tenant y con degradación elegante (§5.2). En preview del
 * Borrador se marca `robots noindex` + banner (I5).
 */
function StorefrontHome({
  branding,
  pagina,
  esPreview,
}: {
  branding: TenantBranding;
  pagina: PageDocument;
  esPreview: boolean;
}) {
  // Fondo de página del TemaPagina (catálogo-v2 F02): `superficie` (default) = body ⇒ sin cambio;
  // otros esquemas pintan el shell entero. Cero hex inline (token de la escala del tenant, I-A).
  const fondoPagina = colorSolidoDeEsquema(pagina.root.props.fondoPagina);
  return (
    <StorefrontLayout branding={branding} estiloShell={{ background: fondoPagina }}>
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
                  Estás viendo el Borrador de esta tienda, no la versión publicada. Los
                  visitantes ven la última versión publicada.
                </Text>
              </Alert>
            </Container>
          </Box>
        </>
      )}

      <RenderPagina
        secciones={pagina.secciones}
        overlays={pagina.overlays}
        branding={branding}
      />
    </StorefrontLayout>
  );
}
