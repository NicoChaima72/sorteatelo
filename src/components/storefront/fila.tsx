import { Grid, Stack } from "@mantine/core";

import { BannerCta } from "~/components/storefront/banner-cta";
import { BeneficiosGrid } from "~/components/storefront/beneficios-grid";
import { BotonesSociales } from "~/components/storefront/botones-sociales";
import { Espaciador } from "~/components/storefront/espaciador";
import { Estadisticas } from "~/components/storefront/estadisticas";
import { ImagenDestacada } from "~/components/storefront/imagen-destacada";
import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { Separador } from "~/components/storefront/separador";
import { TextoRico } from "~/components/storefront/texto-rico";
import { type NodoHoja, type RepartoFila } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * `fila` (sección, Tanda 3 F08/D13/D14): layout de 2–3 columnas de nodos-HOJA. El `reparto` (enum) fija
 * los spans CURADOS del Grid de 12 (jamás CSS libre); en móvil (`base`) todas las columnas ocupan 12 ⇒
 * APILAN en orden (comportamiento único, sin config). Cada hoja se renderiza con el MISMO dispatch de
 * widgets pero en modo `comoHoja` (sin chrome de sección propio — el estilo vive en la fila). La
 * recursión es imposible por construcción (`NodoHojaSchema` no contiene `fila`, I-U4).
 */

/** Spans (base 12) por reparto: 50/50 = 6+6, 66/33 = 8+4, 33/66 = 4+8, 33/33/33 = 4+4+4. */
const SPANS_POR_REPARTO: Record<RepartoFila, number[]> = {
  "50_50": [6, 6],
  "66_33": [8, 4],
  "33_66": [4, 8],
  "33_33_33": [4, 4, 4],
};

export function Fila({
  nodo,
  branding,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "fila" }>;
  branding: TenantBranding;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const spans = SPANS_POR_REPARTO[props.reparto];
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Grid gutter={{ base: "lg", md: "xl" }} align="stretch">
        {props.columnas.map((columna, i) => (
          <Grid.Col key={i} span={{ base: 12, sm: spans[i] ?? 12 }}>
            <Stack gap="md" h="100%">
              {columna.map((hoja) => (
                <RenderHoja key={hoja.id} hoja={hoja} colorPrimario={branding.colorPrimario} />
              ))}
            </Stack>
          </Grid.Col>
        ))}
      </Grid>
    </SeccionWrapper>
  );
}

/**
 * Despacho de un nodo-HOJA a su componente de widget (el MISMO del render público) en modo `comoHoja`
 * (D14: sin `<SeccionWrapper>` de banda). Switch EXHAUSTIVO sobre la whitelist de `NodoHojaSchema` con
 * candado `never` — un tipo nuevo en la whitelist obliga una rama acá (compila).
 */
function RenderHoja({ hoja, colorPrimario }: { hoja: NodoHoja; colorPrimario: string | null }) {
  switch (hoja.tipo) {
    case "texto_rico":
      return <TextoRico nodo={hoja} comoHoja />;
    case "imagen_destacada":
      return <ImagenDestacada nodo={hoja} colorPrimario={colorPrimario} comoHoja />;
    case "beneficios_grid":
      return <BeneficiosGrid nodo={hoja} comoHoja />;
    case "botones_sociales":
      return <BotonesSociales nodo={hoja} comoHoja />;
    case "estadisticas":
      return <Estadisticas nodo={hoja} comoHoja />;
    case "separador":
      return <Separador nodo={hoja} comoHoja />;
    case "espaciador":
      return <Espaciador nodo={hoja} comoHoja />;
    case "banner_cta":
      return <BannerCta nodo={hoja} comoHoja />;
    default: {
      const _exhaustivo: never = hoja;
      void _exhaustivo;
      return null;
    }
  }
}
