import { Alert, Box, Container, Text } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { AvisoBarra } from "~/components/storefront/aviso-barra";
import { LandingPlataforma } from "~/components/landing/landing-plataforma";
import { RenderPagina } from "~/components/storefront/render-pagina";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { usePreviewPatch } from "~/components/storefront/use-preview-patch";
import { derivarNav } from "~/lib/pagebuilder/nav";
import { type PageDocument } from "~/lib/pagebuilder/schema";
import {
  getPropsHome,
  type PropsHome,
} from "~/server/storefront/getStorefrontProps";
import {
  fondoLienzoExterior,
  fondoShellConAmbiente,
  maxWidthColumna,
} from "~/styles/estiloSeccion";
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
  // Documento VIVO: en preview (F09/D13) el hook escucha los patches del editor y re-renderiza sin reload;
  // en público devuelve el SSR fijo (sin listener, I-T5). El shell (fondo), el nav y las secciones se
  // derivan TODOS de `paginaViva` ⇒ un patch actualiza header + shell + contenido juntos, sin recargar.
  const paginaViva = usePreviewPatch(pagina, esPreview);
  // Fondo de página del TemaPagina (catálogo-v2 F02): `superficie` (default) = body ⇒ sin cambio; otros
  // esquemas pintan el shell entero. Tanda 2 F05/D5: `ambiente` apila stage-lights (radiales de tokens)
  // sobre ese color base — `ninguno` (default) ⇒ solo el color (no-op). Cero hex inline (I-A).
  const estiloShellFondo = fondoShellConAmbiente(
    paginaViva.root.props.fondoPagina,
    paginaViva.root.props.ambiente,
  );
  // Columna estrecha editorial (Tanda 2 F15): `anchoContenido:"estrecho"` centra el contenido en ~640px
  // sobre un lienzo exterior un pelo más OSCURO que la columna (marfil sobre crema del prototipo). `null`
  // (contenido/ancho) ⇒ sin columna acotada (comportamiento actual, no-op I-H). Cero hex (I-A).
  const columnaMaxWidth = maxWidthColumna(paginaViva.root.props.anchoContenido);
  const estiloLienzo = columnaMaxWidth
    ? fondoLienzoExterior(paginaViva.root.props.fondoPagina)
    : undefined;
  // Nav auto-derivado (F05/D8): items del header desde las secciones marcadas `nav.incluir`. Sin ninguna
  // marcada ⇒ `[]` y el layout cae al nav actual (I-H).
  const navItems = derivarNav(paginaViva.secciones);
  // Cinta SOBRE el nav (F13): el 1er `aviso_barra` con `posicion:"sobre_nav"` se pinta ANTES del header
  // (lo renderiza el layout). El resto (`bajo_nav`, default) los pinta `RenderPagina` dentro de `<main>`.
  const avisoSobreNav = paginaViva.overlays.find(
    (o) => o.tipo === "aviso_barra" && o.props.posicion === "sobre_nav",
  );
  return (
    <StorefrontLayout
      branding={branding}
      estiloShell={estiloShellFondo}
      estiloLienzo={estiloLienzo}
      columnaMaxWidth={columnaMaxWidth}
      navItems={navItems}
      avisoSobreNav={
        avisoSobreNav?.tipo === "aviso_barra" ? (
          <AvisoBarra props={avisoSobreNav.props} />
        ) : undefined
      }
    >
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
        secciones={paginaViva.secciones}
        overlays={paginaViva.overlays}
        branding={branding}
      />
    </StorefrontLayout>
  );
}
