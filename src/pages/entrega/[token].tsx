import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconDownload,
  IconFileMusic,
  IconFileText,
  IconFileZip,
  IconPhoto,
} from "@tabler/icons-react";
import { type ProductFileType } from "@prisma/client";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { type Tema } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";
import { getEntregaDeOrden } from "~/server/entrega/getEntregaDeOrden";
import { crearStorageDeEnv } from "~/server/storage/storageDeEnv";
import { resolverTemaPagina } from "~/server/storefront/temaPagina";
import { estiloHeredadoDeTema } from "~/styles/estiloSeccion";
import { gradienteTematico, type TenantBranding } from "~/styles/tenantTheme";
import { env } from "~/env";

/**
 * **Página de entrega de una orden** (productos-tipos-digitales F09, D5/I8) — el "qué me tocó" de un
 * sobre sorpresa y, en general, el lugar donde el Comprador ve TODO lo que compró.
 *
 * Sin cuenta ni login (ADR-0004): autoriza el **token del `DownloadGrant`** que llegó por correo,
 * igual que el endpoint de descarga. Token inexistente, vencido o de una orden no pagada ⇒ `404`
 * neutral, indistinguibles entre sí (I3).
 *
 * **Las `key` del bucket nunca llegan al navegador** (I2/ADR-0002): `getServerSideProps` las usa
 * para presignar las miniaturas y las DESCARTA antes de emitir props. Lo que viaja es una URL
 * prefirmada de 5 minutos (más corta que la de descarga: es para pintar, no para guardar) y solo
 * para archivos de tipo IMAGEN — de un MP3 o un ZIP no hay nada que previsualizar, y de un PDF
 * generar un preview sería derivar contenido del archivo vendible (D10).
 *
 * **HOST-AGNÓSTICA a propósito**, y es lo que la hace alcanzable: el enlace que el Comprador recibe
 * por correo apunta al APEX de la plataforma (`APP_URL`), porque el correo no conoce subdominios —
 * exactamente como el `/api/descargas/<token>` al que reemplaza. Una página que entrara por
 * `getPropsPaginaEntrega`/`resolverBrandingSSR` exigiría `zona === "storefront"` y daría **404 en la
 * única puerta que ese Comprador tiene**. Así que la marca de la Tienda NO sale del host: sale del
 * TENANT DEL GRANT, que es server-authored y ya está implícito en el token.
 *
 * Corolario: tampoco pasa por el gate de facturación, que es lo correcto por otra vía — quien ya
 * pagó no puede quedarse sin su descarga porque el Organizador esté moroso.
 */

/** Miniaturas: mucho más cortas que la descarga (~10 min). Se pintan al abrir y no se guardan. */
const EXPIRACION_MINIATURA_SEGUNDOS = 300;

const ICONO_TIPO: Record<ProductFileType, typeof IconFileText> = {
  PDF: IconFileText,
  EPUB: IconFileText,
  IMAGEN: IconPhoto,
  AUDIO: IconFileMusic,
  ZIP: IconFileZip,
};

interface ArchivoDeLaPagina {
  nombreArchivo: string;
  tipo: ProductFileType;
  packOrdinal: number | null;
  urlDescarga: string;
  /** URL prefirmada corta, solo para IMAGEN. Nunca es la key. */
  miniaturaUrl: string | null;
}

interface LineaDeLaPagina {
  /** No es secreto (no es una key de bucket) y da un `key` de React estable. */
  productoId: string;
  titulo: string;
  esSobre: boolean;
  unidadesPorPack: number;
  cantidad: number;
  archivos: ArchivoDeLaPagina[];
}

interface PropsEntrega {
  tenantBranding: TenantBranding;
  lineas: LineaDeLaPagina[];
  /**
   * Tema mínimo heredado de la Tienda (tema-paginas F03/D9). Sale del tenant del GRANT, igual que el
   * branding y por la misma razón: acá no hay host del que deducirlo. `null` ⇒ tienda sin tematizar.
   */
  temaPagina: Tema | null;
}

export const getServerSideProps: GetServerSideProps<PropsEntrega> = async (
  ctx,
) => {
  const token = typeof ctx.params?.token === "string" ? ctx.params.token : null;
  if (!token) return { notFound: true };

  const entrega = await getEntregaDeOrden({ db, token });
  // Token inexistente / vencido / orden no pagada ⇒ la MISMA respuesta (I3).
  if (!entrega) return { notFound: true };

  // Las miniaturas necesitan R2 configurado; sin eso la página igual sirve (los enlaces de descarga
  // no dependen de esto) — se degrada a solo íconos en vez de romper la entrega de alguien que pagó.
  const hayStorage =
    Boolean(env.R2_ENDPOINT) &&
    Boolean(env.R2_ACCESS_KEY_ID) &&
    Boolean(env.R2_SECRET_ACCESS_KEY) &&
    Boolean(env.R2_BUCKET);
  const storage = hayStorage ? crearStorageDeEnv() : null;

  const lineas: LineaDeLaPagina[] = [];
  for (const linea of entrega.lineas) {
    const archivos: ArchivoDeLaPagina[] = [];
    for (const a of linea.archivos) {
      const miniaturaUrl =
        storage && a.tipo === "IMAGEN"
          ? await storage.presignarDescarga({
              key: a.keyServerOnly,
              nombreArchivo: a.nombreArchivo,
              contentType: a.contentType,
              expiresEnSegundos: EXPIRACION_MINIATURA_SEGUNDOS,
              disposicion: "inline", // para que el navegador la PINTE, no la baje
            })
          : null;
      // `keyServerOnly` se queda acá: NO entra en el objeto que se serializa (I2).
      archivos.push({
        nombreArchivo: a.nombreArchivo,
        tipo: a.tipo,
        packOrdinal: a.packOrdinal,
        urlDescarga: a.urlDescarga,
        miniaturaUrl,
      });
    }
    lineas.push({
      productoId: linea.productoId,
      titulo: linea.titulo,
      esSobre: linea.esSobre,
      unidadesPorPack: linea.unidadesPorPack,
      cantidad: linea.cantidad,
      archivos,
    });
  }

  // Tema por el tenant del GRANT (F03/D9), nunca por el host: esta página se sirve en el APEX, así que
  // resolverlo por host la dejaría sin la marca de la Tienda justo donde el Comprador viene a buscar lo
  // que compró. Defensivo por dentro ⇒ una tienda sin tema publicado no rompe la entrega.
  const temaPagina = await resolverTemaPagina({ tenantSlug: entrega.branding.slug });

  return { props: { tenantBranding: entrega.branding, lineas, temaPagina } };
};

export default function EntregaPage({
  tenantBranding,
  lineas,
  temaPagina,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Fondo heredado de la Tienda del grant (F03/D9); `_app` aplica radio/tipografía/modo. Tienda con
  // tema default ⇒ ambas `undefined` ⇒ la página queda byte-idéntica a como salía antes (I6).
  const { estiloShell, colorPagina } = estiloHeredadoDeTema(temaPagina);

  return (
    <StorefrontLayout
      branding={tenantBranding}
      estiloShell={estiloShell}
      colorPagina={colorPagina}
    >
      {/* `size="lg"` como el resto de las páginas de contenido del storefront. */}
      <Container size="lg" py="xl" px={{ base: "md", lg: "xl" }}>
        <Stack gap="lg">
          <Stack gap="xs">
            <Title order={1} fz={{ base: 24, sm: 30 }} lh={1.2}>
              Tu compra en {tenantBranding.nombre}
            </Title>
            <Text c="dimmed">
              Acá está todo lo que compraste. Descárgalo cuando quieras: guarda
              los archivos en tu dispositivo para tenerlos siempre.
            </Text>
          </Stack>

          {lineas.map((linea) => (
            <LineaEntrega
              key={linea.productoId}
              linea={linea}
              colorPrimario={tenantBranding.colorPrimario}
            />
          ))}
        </Stack>
      </Container>
    </StorefrontLayout>
  );
}

function LineaEntrega({
  linea,
  colorPrimario,
}: {
  linea: LineaDeLaPagina;
  colorPrimario: string | null;
}) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
          <Text fw={600}>{linea.titulo}</Text>
          {linea.esSobre && (
            <Badge
              variant="light"
              styles={{ root: { flexShrink: 0 }, label: { textTransform: "none" } }}
            >
              {/* Lo que le tocó, dicho en los términos en que lo compró (D5). */}
              {linea.cantidad === 1
                ? `Pack de ${linea.unidadesPorPack}`
                : `${linea.cantidad} packs de ${linea.unidadesPorPack}`}
            </Badge>
          )}
        </Group>

        {linea.archivos.length === 0 ? (
          <Alert color="pendiente" variant="light">
            Todavía no podemos mostrarte estos archivos. Responde el correo de tu
            compra y la tienda te ayuda.
          </Alert>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {linea.archivos.map((archivo, i) => (
              <TarjetaArchivo
                // El `id` del archivo no viaja suelto a props (solo dentro de la URL de descarga),
                // así que el índice desempata nombres repetidos. Es seguro acá: la lista viene
                // ordenada del server y no se reordena ni filtra en el cliente.
                key={`${archivo.nombreArchivo}-${i}`}
                archivo={archivo}
                colorPrimario={colorPrimario}
              />
            ))}
          </div>
        )}
      </Stack>
    </Card>
  );
}

function TarjetaArchivo({
  archivo,
  colorPrimario,
}: {
  archivo: ArchivoDeLaPagina;
  colorPrimario: string | null;
}) {
  const Icono = ICONO_TIPO[archivo.tipo];
  // La miniatura puede fallar en el navegador aunque la URL se haya firmado bien (URL vencida
  // mientras la pestaña estaba abierta, glitch de red). La convención del storefront es dura: nunca
  // un `<img>` roto — se cae al gradiente temático, igual que `ImagenConFallback`.
  const [falloMiniatura, setFalloMiniatura] = useState(false);
  const hayMiniatura = archivo.miniaturaUrl !== null && !falloMiniatura;
  const esImagen = archivo.tipo === "IMAGEN";

  return (
    <Stack gap="xs">
      <Box
        style={{
          aspectRatio: "1 / 1",
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
          // Para una IMAGEN sin miniatura, el gradiente de la Tienda (§5.2); para los demás tipos,
          // la superficie neutra sobre la que se lee el ícono del tipo de archivo.
          background:
            !hayMiniatura && esImagen
              ? gradienteTematico(colorPrimario)
              : "var(--mantine-color-default-hover)",
        }}
        className="flex items-center justify-center"
      >
        {hayMiniatura ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={archivo.miniaturaUrl!}
            alt={archivo.nombreArchivo}
            onError={() => setFalloMiniatura(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Icono
            className="size-8"
            stroke={1.5}
            color={esImagen ? "white" : "var(--mantine-color-dimmed)"}
          />
        )}
      </Box>
      <Text size="xs" c="dimmed" truncate title={archivo.nombreArchivo}>
        {archivo.nombreArchivo}
      </Text>
      <Button
        component="a"
        href={archivo.urlDescarga}
        size="xs"
        variant="light"
        leftSection={<IconDownload className="size-3.5" />}
      >
        Descargar
      </Button>
    </Stack>
  );
}
