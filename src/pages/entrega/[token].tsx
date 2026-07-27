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
import {
  componerNavDelHeader,
  hrefMenuItem,
  type Chrome,
} from "~/lib/pagebuilder/chrome";
import {
  hrefEnTienda,
  reanclarNavALaHome,
  reanclarNavATienda,
  type NavItem,
} from "~/lib/pagebuilder/nav";
import { type Tema } from "~/lib/pagebuilder/schema";
import { apexDesdeHost, construirUrlSubdominio } from "~/lib/urlApex";
import { db } from "~/server/db";
import { getEntregaDeOrden } from "~/server/entrega/getEntregaDeOrden";
import { crearStorageDeEnv } from "~/server/storage/storageDeEnv";
import {
  resolverChrome,
  resolverNavPaginas,
} from "~/server/storefront/getStorefrontProps";
import { resolverHerenciaDeLaHome } from "~/server/storefront/temaPagina";
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
  /** Portada pública del producto (F05); `null` ⇒ gradiente temático. Nunca es una key. */
  portadaUrl: string | null;
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
  /**
   * Nav del header compuesto con las MISMAS reglas que la home (follow-up del navbar), pero con URLs
   * ABSOLUTAS al subdominio de la Tienda: esta página es host-agnóstica (se sirve también en el apex,
   * que es la URL que viaja en el correo), así que un `/#catalogo` relativo navegaría al host equivocado.
   */
  navItems: NavItem[];
  /** Chrome de la Tienda, con los links del footer ya resueltos a URLs absolutas (misma razón). */
  chrome: Chrome | null;
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
      portadaUrl: linea.portadaUrl,
      esSobre: linea.esSobre,
      unidadesPorPack: linea.unidadesPorPack,
      cantidad: linea.cantidad,
      archivos,
    });
  }

  // Tema + chrome + nav por el tenant del GRANT (F03/D9 + follow-up del navbar), nunca por el host:
  // esta página se sirve en el APEX, así que resolverlos por host la dejaría sin la marca de la Tienda
  // justo donde el Comprador viene a buscar lo que compró. Defensivos por dentro ⇒ una tienda sin tema
  // ni chrome publicados no rompe la entrega.
  const slug = entrega.branding.slug;
  const [herencia, chrome, navPaginas] = await Promise.all([
    resolverHerenciaDeLaHome({ tenantSlug: slug }),
    resolverChrome({ tenantSlug: slug }),
    resolverNavPaginas({ tenantSlug: slug }),
  ]);

  // Base ABSOLUTA del subdominio de la Tienda, porque esta página es host-agnóstica: abierta desde el
  // apex (la URL del correo), un `/#catalogo` relativo navegaría a la landing de la plataforma. El apex
  // sale de la env (autoritativa en prod) o del host de la request (dev sin env); el protocolo, del
  // proxy de Vercel (`x-forwarded-proto`) con fallback http para dev.
  const [hostname = "", puerto] = (ctx.req.headers.host ?? "").split(":");
  const protoHeader = ctx.req.headers["x-forwarded-proto"];
  const protocol = `${typeof protoHeader === "string" ? protoHeader : "http"}:`;
  const apex = env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? apexDesdeHost(hostname, slug);
  const baseTienda = construirUrlSubdominio({ protocol, apex, puerto, slug, path: "" });

  // Mismo nav que la home y el resto de las páginas de plataforma (una sola regla), re-anclado ABSOLUTO.
  const navItems = reanclarNavATienda(
    reanclarNavALaHome(
      componerNavDelHeader({ chrome, navDerivado: herencia.navDeLaHome, navPaginas }),
    ),
    baseTienda,
  );

  // Los links del footer los resuelve el layout con `hrefMenuItem` (relativo) ⇒ acá se pre-resuelven a
  // URL absoluta, para que el chrome del footer también funcione servido desde el apex.
  const chromeAbsoluto: Chrome | null = chrome && {
    ...chrome,
    footer: {
      ...chrome.footer,
      links: chrome.footer.links.map((l) => ({
        etiqueta: l.etiqueta,
        destino: {
          tipo: "url" as const,
          url: hrefEnTienda(hrefMenuItem(l.destino), baseTienda),
        },
      })),
    },
  };

  return {
    props: {
      tenantBranding: entrega.branding,
      lineas,
      temaPagina: herencia.temaPagina,
      navItems,
      chrome: chromeAbsoluto,
    },
  };
};

export default function EntregaPage({
  tenantBranding,
  lineas,
  temaPagina,
  navItems,
  chrome,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Fondo heredado de la Tienda del grant (F03/D9); `_app` aplica radio/tipografía/modo. Tienda con
  // tema default ⇒ ambas `undefined` ⇒ la página queda byte-idéntica a como salía antes (I6).
  const { estiloShell, colorPagina } = estiloHeredadoDeTema(temaPagina);

  return (
    <StorefrontLayout
      branding={tenantBranding}
      estiloShell={estiloShell}
      colorPagina={colorPagina}
      navItems={navItems}
      chrome={chrome}
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
                portadaUrl={linea.portadaUrl}
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
  portadaUrl,
  colorPrimario,
}: {
  archivo: ArchivoDeLaPagina;
  /** Portada del producto de la línea (F05): el visual de todo lo que no es una IMAGEN. */
  portadaUrl: string | null;
  colorPrimario: string | null;
}) {
  const Icono = ICONO_TIPO[archivo.tipo];
  // Cualquiera de las dos imágenes puede fallar en el navegador aunque la URL esté bien (miniatura
  // vencida mientras la pestaña estaba abierta, glitch de red, objeto borrado del bucket público).
  // La convención del storefront es dura: nunca un `<img>` roto — se cae al escalón siguiente.
  const [falloMiniatura, setFalloMiniatura] = useState(false);
  const [falloPortada, setFalloPortada] = useState(false);
  const hayMiniatura = archivo.miniaturaUrl !== null && !falloMiniatura;
  const esImagen = archivo.tipo === "IMAGEN";

  /*
    Tres escalones, en este orden (F05):

    1. **Miniatura presignada** — solo para archivos IMAGEN, y es LO QUE SE COMPRÓ: el sticker de
       verdad. Manda siempre que exista; F05 no la toca.
    2. **Portada del producto** — para todo lo demás (PDF, EPUB, MP3, ZIP), que no tiene preview y
       hasta acá se veía como un ícono genérico: 4 copias de un libro eran 4 cuadrados iguales sin
       una sola pista de qué libro. De un PDF NO se deriva un preview a propósito (sería derivar
       contenido del archivo vendible, D10); la portada es un asset de marca que el Organizador ya
       subió y que el Comprador ya vio en el catálogo.
    3. **Ícono del tipo** sobre gradiente/superficie neutra — el fallback de siempre.

    El `!esImagen` del escalón 2 es load-bearing y lo cazó el `frontend-reviewer`: sin él, una IMAGEN
    cuya miniatura falla (R2 sin configurar, URL vencida con la pestaña abierta, glitch de red) caería
    en la portada del PRODUCTO — o sea, en un sobre sorpresa se mostraría la tapa genérica del pack
    en el lugar donde va el sticker que te tocó, que es exactamente lo que la persona vino a ver. El
    visual de una IMAGEN es su propio contenido o nada; para eso está el gradiente del escalón 3.
  */
  const hayPortada = portadaUrl !== null && !falloPortada;
  const usarPortada = !hayMiniatura && !esImagen && hayPortada;

  return (
    <Stack gap="xs">
      <Box
        style={{
          aspectRatio: "1 / 1",
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
          // Para una IMAGEN sin miniatura ni portada, el gradiente de la Tienda (§5.2); para los
          // demás casos sin imagen, la superficie neutra sobre la que se lee el ícono del tipo.
          background:
            hayMiniatura || usarPortada
              ? undefined
              : esImagen
                ? gradienteTematico(colorPrimario)
                : "var(--mantine-color-default-hover)",
        }}
        className="flex items-center justify-center"
      >
        {/*
          `alt=""` en las DOS imágenes: el nombre real del archivo se renderiza siempre como texto
          justo debajo (para las dos ramas), así que un `alt` con el mismo nombre haría que un lector
          de pantalla lo anuncie dos veces. La asimetría anterior —miniatura con `alt`, portada
          sin— no tenía fundamento y la levantó el `frontend-reviewer`. Es el mismo criterio de
          `MiniaturaProducto` en el carrito: imagen muda, el texto de al lado es la fuente única.
        */}
        {hayMiniatura ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={archivo.miniaturaUrl!}
            alt=""
            onError={() => setFalloMiniatura(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : usarPortada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portadaUrl!}
            alt=""
            onError={() => setFalloPortada(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Icono
            className="size-8"
            stroke={1.5}
            // Token y no el keyword `white`: los íconos de Tabler no pasan por el resolver de
            // Mantine, así que la convención pide la CSS var explícita
            // (frontend-conventions § Degradación elegante de imágenes).
            color={
              esImagen ? "var(--mantine-color-white)" : "var(--mantine-color-dimmed)"
            }
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
