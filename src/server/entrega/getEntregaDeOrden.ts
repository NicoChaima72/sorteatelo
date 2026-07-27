import { type PrismaClient, type ProductFileType } from "@prisma/client";

import { archivosDelGrant } from "~/server/entrega/archivosDelGrant";
import { entregaAlAzar } from "~/server/productos/fuenteDeArchivos";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * **Página de entrega de una orden** (productos-tipos-digitales F09, D5/I8): qué se le muestra al
 * Comprador cuando abre el enlace que le llegó por correo.
 *
 * Autorización: el **token de un `DownloadGrant`** de la orden, y nada más (ADR-0004: el Comprador
 * no tiene cuenta, así que no hay sesión que consultar; el token ES la autoridad, igual que en el
 * endpoint de descarga). Un token de otra orden muestra OTRA orden — no la de nadie más — y uno
 * inexistente o vencido no muestra nada.
 *
 * Muestra la orden COMPLETA (todos sus productos) y no solo el producto del grant presentado: es
 * "la entrega de tu compra", los grants de una orden viajaron todos en el mismo correo al mismo
 * Comprador, y obligarlo a abrir N páginas para N productos de una sola compra no tiene sentido.
 *
 * Lo que NO devuelve, y es deliberado (I2/ADR-0002): ninguna `key` del bucket. Ni para descargar
 * (eso va por `/api/descargas/<token>`) ni para la miniatura (esa la presigna el borde con la key
 * que se queda server-side). Tampoco el correo del Comprador ni nada de otras órdenes.
 */

export interface ArchivoEntregado {
  /** `id` del `ProductFile`, o `null` si viene del `pdfPath` legacy (sin fila propia). */
  id: string | null;
  nombreArchivo: string;
  tipo: ProductFileType;
  /** MIME real del archivo. Lo necesita el borde para presignar la miniatura con su tipo correcto. */
  contentType: string;
  bytes: number | null;
  /** Cuál de los packs lo trajo (`null` en un producto estándar). */
  packOrdinal: number | null;
  /** Enlace de descarga: `/api/descargas/<token>` (+ `?archivo=<id>` si hay más de uno). */
  urlDescarga: string;
  /**
   * Key del objeto, **SOLO para que el borde presigne la miniatura**. Nunca se serializa al
   * navegador: `getServerSideProps` la consume y la descarta (por eso está separada del resto y
   * marcada acá). Ver `src/pages/entrega/[token].tsx`.
   */
  keyServerOnly: string;
}

export interface LineaEntregada {
  productoId: string;
  titulo: string;
  /** Archivos por pack (SOBRE) o el archivo único (ESTANDAR). Vacío = todavía no hay nada. */
  archivos: ArchivoEntregado[];
  /** Cuántos archivos entrega un pack de lo que se compró; 1 en un producto estándar. */
  unidadesPorPack: number;
  /** Cuántos packs/unidades se compraron. */
  cantidad: number;
  esSobre: boolean;
}

export interface EntregaDeOrden {
  /**
   * Marca de la Tienda de la orden, resuelta desde el **grant** y NO desde el host.
   *
   * Es lo que hace que la página funcione desde cualquier host, y no es un detalle: el enlace que
   * el Comprador recibe por correo apunta al APEX de la plataforma (el correo no conoce
   * subdominios, igual que el viejo `/api/descargas/<token>`), así que una página que exigiera
   * `zona === "storefront"` daría 404 en la única puerta que ese Comprador tiene. El token ya
   * identifica al tenant: derivar la marca de ahí es a la vez más correcto y más simple.
   */
  branding: TenantBranding;
  /** Vencimiento del grant por el que se entró (los de una orden se emiten juntos, D5). */
  expiraEn: Date;
  lineas: LineaEntregada[];
}

/**
 * Resuelve la entrega de la orden a la que pertenece `token`, o `null` si el token no existe, está
 * vencido, o su orden no está PAGADA.
 *
 * `null` es UNA sola respuesta para los tres casos a propósito (misma neutralidad que el 404 del
 * endpoint de descarga, I3): quien prueba tokens al azar no puede distinguir "no existe" de "existe
 * pero venció".
 */
export async function getEntregaDeOrden({
  db,
  token,
  ahora = new Date(),
}: {
  db: PrismaClient;
  token: string;
  ahora?: Date;
}): Promise<EntregaDeOrden | null> {
  const grant = await db.downloadGrant.findUnique({
    where: { token },
    select: {
      tenantId: true,
      orderId: true,
      expiresAt: true,
      order: {
        select: {
          estado: true,
          // Los campos de MARCA y nada más: jamás la `FlowCredential` ni secretos (mismo `select`
          // acotado que `crearRepoBranding`).
          tenant: {
            select: {
              nombre: true,
              slug: true,
              descripcion: true,
              logoUrl: true,
              colorPrimario: true,
              colorAcento: true,
              instagramUrl: true,
              tiktokUrl: true,
              whatsappUrl: true,
              contactoEmail: true,
            },
          },
          items: {
            select: {
              productId: true,
              cantidad: true,
              unidadesPorPack: true,
              product: {
                select: {
                  titulo: true,
                  modalidad: true,
                  // La FUENTE (E15): decide si lo entregado fue al azar (pool) o son copias.
                  fuente: { select: { modalidad: true } },
                },
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          // Los tokens de TODA la orden: cada línea linkea con el suyo. Se cargan server-side y
          // solo se emiten dentro de las URLs de descarga — el token es la autoridad del enlace.
          downloadGrants: {
            select: { token: true, productId: true },
          },
        },
      },
    },
  });

  if (!grant) return null;
  if (grant.expiresAt.getTime() <= ahora.getTime()) return null;
  // Una orden no pagada no tiene nada que entregar (no debería tener grants, pero el estado manda).
  if (grant.order.estado !== "PAGADO") return null;

  const tokenPorProducto = new Map(
    grant.order.downloadGrants.map((g) => [g.productId, g.token]),
  );

  const lineas: LineaEntregada[] = [];
  for (const item of grant.order.items) {
    const tokenDeLinea = tokenPorProducto.get(item.productId);
    // Sin grant no hay autoridad para entregar esa línea: se omite en vez de inventar un enlace.
    if (!tokenDeLinea) continue;

    const archivos = await archivosDelGrant({
      db,
      grant: {
        tenantId: grant.tenantId,
        orderId: grant.orderId,
        productId: item.productId,
      },
    });

    // La entrega fue AL AZAR sii el origen de los archivos es un pool (E15/V-I7). Para un pack de
    // fuente ESTANDAR (el caso libro) no lo es, aunque entregue 4 unidades. La regla es la MISMA
    // que usan los efectos post-pago y `archivosDelGrant`, importada y no re-escrita.
    const alAzar = entregaAlAzar(item.product);

    const entregados = archivos.map((a) => ({
      id: a.id,
      nombreArchivo: a.nombreArchivo,
      tipo: a.tipo,
      contentType: a.contentType,
      bytes: a.bytes,
      packOrdinal: a.packOrdinal,
      // Con un solo archivo (el caso ESTANDAR) el enlace queda EXACTAMENTE como el del correo de
      // siempre; el `?archivo=` solo aparece cuando hay entre cuáles elegir. Se decide sobre los
      // archivos DISTINTOS (antes de derivar copias): N copias del mismo archivo no son algo entre
      // lo que elegir, así que no deben ensuciar el enlace de una compra normal.
      urlDescarga:
        a.id === null || archivos.length <= 1
          ? `/api/descargas/${tokenDeLinea}`
          : `/api/descargas/${tokenDeLinea}?archivo=${a.id}`,
      keyServerOnly: a.key,
    }));

    /*
      COPIAS derivadas en presentación (ENMIENDA v2, E15/V-I2). Un pack de fuente ESTANDAR —«Pack 4
      libros»— entrega 4 unidades del MISMO archivo, y comprar 3 unidades de un producto normal son
      3 unidades del mismo archivo. Ninguna de las dos cosas genera filas: el
      `@@unique([orderItemId, packOrdinal, productFileId])` prohíbe la fila repetida y está bien que
      la prohíba, así que las copias se derivan acá, en el borde de presentación, y no en la DB.

      Para una entrega AL AZAR no se deriva nada: las `unidadesPorPack × cantidad` filas ya vienen
      sorteadas de `PackAssignment`, cada una un archivo distinto dentro de su pack.
    */
    const copias = alAzar ? 1 : item.unidadesPorPack * item.cantidad;

    lineas.push({
      productoId: item.productId,
      titulo: item.product.titulo,
      unidadesPorPack: item.unidadesPorPack,
      cantidad: item.cantidad,
      esSobre: alAzar,
      archivos:
        copias <= 1
          ? entregados
          : Array.from({ length: copias }, () => entregados).flat(),
    });
  }

  return {
    branding: grant.order.tenant,
    expiraEn: grant.expiresAt,
    lineas,
  };
}
