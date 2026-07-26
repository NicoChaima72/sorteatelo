import { type NextApiRequest } from "next";

import { sanearNombreArchivo } from "~/server/services/storage";

/**
 * Núcleo testeable del endpoint público de descarga por token (F03/D5, patrón núcleo+wrapper
 * como el webhook de Flow). Recibe un `req` acotado y sus dependencias inyectables (el repo de
 * grants, el presigner de descarga, el reloj); devuelve `{ status, headers?, body? }` — NO
 * escribe la respuesta ni toca env. El wrapper (`src/pages/api/descargas/[token].ts`) lee env,
 * cablea `db` + storage y escribe `res`.
 *
 * Generalizado a CUALQUIER tipo permitido por productos-tipos-digitales F03: el núcleo ya no sabe
 * nada de PDF — recibe el archivo ya resuelto (key + contentType + nombre) y solo decide y firma.
 *
 * Política (ADR-0002/0004/0005, invariantes I1-I3/I9):
 * - Método ≠ GET ⇒ 405 sin efecto.
 * - `token` ⇒ grant (unique global: token⇒grant⇒tenant/producto, igual que `Payment.token`).
 *   El endpoint NO exige sesión (ADR-0004: el Comprador no tiene cuenta; el token ES la
 *   autoridad).
 * - Grant vigente (`expiresAt` > ahora) Y archivo entregable ⇒ **302** con `Location` = URL
 *   prefirmada corta (~10 min) de la key de ESE archivo, con su content-type REAL.
 * - **Cualquier otro caso ⇒ 404 neutral IDÉNTICO** (I3): token inexistente, grant expirado o
 *   archivo pendiente son indistinguibles por construcción (mismo status y body).
 * - **Defensa en profundidad (I9/I2)**: si la key no empieza con `<grant.tenantId>/`, también
 *   404 neutral — jamás se presigna una key fuera del prefijo del tenant del grant (aunque la
 *   FK lo haga imposible por construcción, no confiamos: un tenant NUNCA sirve archivos de otro).
 * - **No loguea** token, path ni email en ningún camino (I4).
 */

/** Proyección del grant necesaria para decidir y presignar (la carga el repo del wrapper). */
export interface GrantParaDescarga {
  tenantId: string;
  expiresAt: Date;
  /**
   * El archivo a servir, ya resuelto por el repo vía `archivosParaEntrega` (productos-tipos-digitales
   * F03): trae su `key`, su `contentType` REAL y el `nombreArchivo` con el que el Comprador lo
   * recibe. `null` = el producto todavía no tiene archivo entregable ⇒ 404 neutral.
   *
   * Reemplaza al par `{ pdfPath, titulo }` de F03 de entrega-storage-r2: el tipo dejó de ser
   * siempre PDF y el nombre dejó de derivarse del título en tiempo de descarga.
   */
  archivo: {
    key: string;
    contentType: string;
    nombreArchivo: string;
  } | null;
  /**
   * Los OTROS archivos que este mismo grant autoriza, indexados por el `id` de su `ProductFile`
   * (productos-tipos-digitales F09). En un producto ESTANDAR está vacío: hay uno solo y es
   * `archivo`. En un SOBRE son los N que le tocaron a ESTA orden (F08) — jamás el pool entero.
   *
   * Es lo que hace que `?archivo=<fileId>` sea seguro: el id del query **SELECCIONA** dentro de un
   * conjunto que ya autorizó el token, nunca autoriza por sí mismo. Un id de otro archivo (del pool
   * que no le tocó, de otra orden, de otra Tienda) simplemente no está en el mapa ⇒ 404 neutral.
   */
  archivosPorId?: Record<
    string,
    { key: string; contentType: string; nombreArchivo: string }
  >;
}

export type BuscarGrantPorToken = (
  token: string,
) => Promise<GrantParaDescarga | null>;

export type PresignarDescargaFn = (input: {
  key: string;
  nombreArchivo: string;
  contentType: string;
}) => Promise<string>;

export interface ManejarDescargaArgs {
  req: Pick<NextApiRequest, "method" | "query">;
  buscarGrant: BuscarGrantPorToken;
  presignarDescarga: PresignarDescargaFn;
  /** Reloj inyectable (default: ahora). Permite testear la expiración sin esperar. */
  ahora?: Date;
}

export interface RespuestaDescarga {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

/** Respuesta neutral IDÉNTICA para todos los caminos de fallo (I3). Única definición. */
const RESPUESTA_404_NEUTRAL: RespuestaDescarga = {
  status: 404,
  body: "No encontrado.",
};

/** Extrae el token del query del route dinámico `[token]`. */
function extraerToken(query: NextApiRequest["query"]): string | null {
  const t = query.token;
  if (typeof t === "string" && t.length > 0) return t;
  if (Array.isArray(t) && typeof t[0] === "string" && t[0].length > 0) return t[0];
  return null;
}

/** Lee `?archivo=<fileId>` del query. Ausente o vacío ⇒ `null` (se sirve el primero, como siempre). */
function extraerArchivoPedido(query: NextApiRequest["query"]): string | null {
  const a = query.archivo;
  if (typeof a === "string" && a.length > 0) return a;
  if (Array.isArray(a) && typeof a[0] === "string" && a[0].length > 0) return a[0];
  return null;
}

export async function manejarDescarga({
  req,
  buscarGrant,
  presignarDescarga,
  ahora = new Date(),
}: ManejarDescargaArgs): Promise<RespuestaDescarga> {
  // Gate de método: solo GET (es una descarga que el Comprador abre en el navegador).
  if (req.method !== "GET") {
    return { status: 405, body: "Método no permitido." };
  }

  const token = extraerToken(req.query);
  if (!token) return RESPUESTA_404_NEUTRAL;

  const grant = await buscarGrant(token);
  // Token inexistente ⇒ 404 neutral (indistinguible de expirado / PDF pendiente).
  if (!grant) return RESPUESTA_404_NEUTRAL;

  // Grant expirado ⇒ 404 neutral.
  if (grant.expiresAt.getTime() <= ahora.getTime()) return RESPUESTA_404_NEUTRAL;

  // Qué archivo de los que el grant autoriza se pide. Sin `?archivo=` se sirve el primero, que es
  // el comportamiento de siempre (y en un ESTANDAR el único). Con `?archivo=<fileId>` se busca EN EL
  // CONJUNTO YA AUTORIZADO por el token: el id selecciona, no autoriza (I1). Un id que no está ⇒
  // 404 neutral, indistinguible de token inexistente o grant expirado (I3).
  const archivoPedido = extraerArchivoPedido(req.query);
  const archivo =
    archivoPedido === null
      ? grant.archivo
      : (grant.archivosPorId?.[archivoPedido] ?? null);

  // Archivo pendiente (el producto todavía no tiene nada entregable) o id no autorizado ⇒ 404.
  if (archivo === null) return RESPUESTA_404_NEUTRAL;

  // Defensa I9: la key DEBE vivir bajo el prefijo del tenant del grant. Si no, 404 neutral
  // (jamás presignar una key de otro tenant). El grant y el archivo son del mismo tenant por
  // construcción (FK); esto es defensa en profundidad, no una ruta esperada. Se mantiene INTACTA
  // al generalizar el tipo (I1): sigue siendo un `startsWith` sobre la key real que se va a firmar.
  if (!archivo.key.startsWith(`${grant.tenantId}/`)) {
    return RESPUESTA_404_NEUTRAL;
  }

  // Grant vigente + archivo presente + key bajo su prefijo ⇒ 302 a la URL prefirmada corta, con el
  // content-type REAL del archivo (un MP3 llega como `audio/mpeg`, no como PDF) y su nombre. El
  // `sanearNombreArchivo` se re-aplica acá aunque el nombre ya se guardó saneado: es el borde que
  // arma una cabecera HTTP (`Content-Disposition`), y ahí no se confía en que la DB traiga algo
  // limpio (anti header-injection, defensa en profundidad).
  const url = await presignarDescarga({
    key: archivo.key,
    nombreArchivo: sanearNombreArchivo(
      archivo.nombreArchivo,
      archivo.contentType,
    ),
    contentType: archivo.contentType,
  });

  return {
    status: 302,
    headers: {
      Location: url,
      // La URL prefirmada expira pronto (~10 min): no cachear el redirect.
      "Cache-Control": "no-store, max-age=0",
    },
  };
}
