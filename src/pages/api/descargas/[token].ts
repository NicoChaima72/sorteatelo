import { type NextApiRequest, type NextApiResponse } from "next";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  type GrantParaDescarga,
  manejarDescarga,
} from "~/server/descargas/manejarDescarga";
import { archivosDelGrant } from "~/server/entrega/archivosDelGrant";
import { crearStorageDeEnv } from "~/server/storage/storageDeEnv";

/**
 * Endpoint público de descarga del Comprador (F03/D5) — wrapper Next (borde de cableado).
 *
 * Es la ÚNICA parte que lee env, cablea los adapters reales (repo de grants contra `db`,
 * presigner de R2) y escribe `res`. Toda la política (gate de método, 404 neutral, defensa
 * de prefijo I9, 302) vive en el núcleo testeable `manejarDescarga`.
 *
 * NO exige sesión (ADR-0004: el Comprador no tiene cuenta; el token del `DownloadGrant` ES la
 * autoridad). No loguea token ni path (I4).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Fail-fast de config R2 (sin volcar secretos): sin storage no se puede presignar. Mejor un
  // 500 explícito que un efecto roto (patrón del webhook con la clave de cifrado). En un deploy
  // bien configurado esto nunca ocurre, así que no rompe la neutralidad de los 404 reales.
  if (
    !env.R2_ENDPOINT ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET
  ) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  const storage = crearStorageDeEnv();

  const { status, headers, body } = await manejarDescarga({
    req,
    buscarGrant: buscarGrantPorToken,
    presignarDescarga: (input) => storage.presignarDescarga(input),
  });

  if (headers) {
    for (const [clave, valor] of Object.entries(headers)) {
      res.setHeader(clave, valor);
    }
  }
  if (status === 302) {
    res.status(302).end();
    return;
  }
  res.status(status).send(body ?? "");
}

/**
 * Repo del grant: token ⇒ grant (unique global) ⇒ tenant/producto ⇒ archivo a servir. Devuelve solo
 * la proyección que el núcleo necesita para decidir y presignar. Un token inexistente ⇒ null (⇒ 404
 * neutral).
 *
 * El archivo se resuelve con `archivosParaEntrega` (productos-tipos-digitales F03), scopeado por el
 * `tenantId` **del grant** — que es server-authored (sale de la fila, no del request). Así la
 * generalización a cualquier tipo no abre ningún camino cross-tenant: el mismo tenant que autoriza
 * es el que scopea la búsqueda del archivo, y el núcleo re-chequea el prefijo de la key igual (I9).
 *
 * Sin `?archivo=`, se sirve el PRIMER archivo autorizado: para un producto ESTANDAR hay exactamente
 * uno (invariante de `confirmarArchivoProducto`, F02) ⇒ el comportamiento no cambió. Un producto
 * SOBRE tiene N archivos ASIGNADOS a esta orden (F08) y la página de entrega (F09) linkea a cada uno
 * con `?archivo=<fileId>`.
 *
 * El conjunto autorizado lo resuelve `archivosDelGrant` — la MISMA función que usa la página de
 * entrega (I5). Es importante que sea la misma: en un sobre autoriza solo lo ASIGNADO, nunca el pool
 * completo, así que ni la página puede mostrar de más ni el endpoint entregar de más.
 */
async function buscarGrantPorToken(
  token: string,
): Promise<GrantParaDescarga | null> {
  const grant = await db.downloadGrant.findUnique({
    where: { token },
    select: {
      tenantId: true,
      expiresAt: true,
      productId: true,
      orderId: true,
    },
  });
  if (!grant) return null;

  const archivos = await archivosDelGrant({ db, grant });
  const archivo = archivos[0];

  return {
    tenantId: grant.tenantId,
    expiresAt: grant.expiresAt,
    archivo: archivo
      ? {
          key: archivo.key,
          contentType: archivo.contentType,
          nombreArchivo: archivo.nombreArchivo,
        }
      : null,
    // Solo los que TIENEN fila (`id`): el fallback legacy del `pdfPath` no es direccionable por id,
    // y no hace falta que lo sea (es siempre el único archivo de su producto ⇒ se sirve sin query).
    archivosPorId: Object.fromEntries(
      archivos
        .filter((a): a is typeof a & { id: string } => a.id !== null)
        .map((a) => [
          a.id,
          {
            key: a.key,
            contentType: a.contentType,
            nombreArchivo: a.nombreArchivo,
          },
        ]),
    ),
  };
}
