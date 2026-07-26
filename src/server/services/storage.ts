import { randomBytes } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { extensionDeContentType } from "~/lib/archivos/tiposArchivo";

/**
 * Service Storage — adapter S3-compatible al bucket privado de PDFs (Cloudflare R2).
 *
 * Es un adapter de la capa `services/` (ADR-0002/0009): no conoce sesión ni reglas de
 * negocio, expone una interfaz estable para poder cambiar el proveedor concreto (R2 → S3 /
 * MinIO / otro) con fricción mínima. La config (endpoint/keys/bucket) entra como argumento
 * explícito de la factory (nunca importa `~/env` adentro), con fail-fast en runtime si falta
 * al ejecutar (I4/I7, patrón `services/flow.ts`). Los secretos NUNCA se loguean (I4).
 *
 * A diferencia de Flow (BYO por tenant, ADR-0006), el storage es de PLATAFORMA: una sola
 * cuenta R2 del Operador, un bucket con paths per-tenant. El aislamiento cross-tenant vive
 * en la KEY (`<tenantId>/<productId>.pdf`, siempre computada server-side, I6) y lo refuerza
 * el endpoint de descarga (defensa I9: jamás presignar una key fuera del prefijo del tenant
 * del grant). Ver ADR-0002 (entrega por URL firmada) y ADR-0009 (R2 S3-compatible).
 */

/** Expiración de la URL prefirmada de DESCARGA (GET). 10 min (ADR-0002/D6/S6). Constante. */
export const EXPIRACION_DESCARGA_SEGUNDOS = 600;
/** Expiración de la URL prefirmada de SUBIDA (PUT). 10 min (D6/S6). Constante. */
export const EXPIRACION_SUBIDA_SEGUNDOS = 600;

/** Content-Type del PDF. Sigue nombrado porque es el default histórico de varios llamadores. */
export const CONTENT_TYPE_PDF = "application/pdf";

/**
 * Key de un **archivo de producto** (productos-tipos-digitales F02, D9/I6):
 * `<tenantId>/<productId>/<ref>.<ext>`. Helper PURO — la única definición del path per-tenant.
 *
 * - El cliente NUNCA la elige ni la ve: la computa el server para presignar y la persiste en
 *   `ProductFile.key`. El cliente solo referencia la fila por su `id`.
 * - La **extensión sale del `contentType` YA VALIDADO** contra la allowlist, jamás del nombre de
 *   archivo que mandó el cliente (D9). Un cliente que sube un PNG diciendo `virus.exe` termina en
 *   una key `.png`.
 * - `ref` es un segmento **aleatorio** generado por el server (`generarRefArchivo`), no el `id` de
 *   la fila: rompe el huevo-y-la-gallina de "la key necesita el id y el id lo genera el INSERT" sin
 *   escrituras en dos tiempos, y de paso deja la key inadivinable (el bucket es privado, pero una
 *   key adivinable nunca ayuda). La key se persiste igual, así que sigue siendo el dato autoritativo.
 *
 * **Formato LEGACY** (pre-F01, todavía vivo en filas migradas y en `Product.pdfPath`):
 * `<tenantId>/<productId>.pdf`, sin carpeta por producto. Se lee, no se genera más.
 */
export function keyDeArchivoProducto({
  tenantId,
  productId,
  ref,
  contentType,
}: {
  tenantId: string;
  productId: string;
  ref: string;
  contentType: string;
}): string {
  return `${tenantId}/${productId}/${ref}.${extensionDeContentType(contentType)}`;
}

/** Segmento aleatorio de la key (16 bytes hex). Server-side siempre. */
export function generarRefArchivo(): string {
  return randomBytes(16).toString("hex");
}

// Rango de caracteres de control (0x00–0x1F y 0x7F) y de ASCII imprimible (0x20–0x7E),
// como constantes para no incrustar bytes de control en las expresiones regulares.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");
const NO_ASCII_PRINTABLE = new RegExp("[^\u0020-\u007e]", "g");

/**
 * Sanea un nombre para usarlo como nombre del archivo descargado (S8). Quita caracteres de control
 * y los peligrosos para un header `Content-Disposition` (comillas, barras, CR/LF — anti
 * header-injection), colapsa espacios, recorta el largo y **garantiza la extensión que corresponde
 * al `contentType`**.
 *
 * Tipo-agnóstico desde F02 (antes forzaba `.pdf` a secas). El `contentType` es OBLIGATORIO a
 * propósito: un default `application/pdf` dejaría que un caller nuevo bautizara silenciosamente un
 * MP3 como `.pdf`. La extensión sale SIEMPRE del MIME validado, nunca de lo que el nombre traiga
 * (D9) — `cancion.exe` con `audio/mpeg` sale `cancion.mp3`.
 */
export function sanearNombreArchivo(nombre: string, contentType: string): string {
  const extension = extensionDeContentType(contentType);
  const base = nombre
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(/["\\/\r\n]/g, "") // comillas, barras, saltos de línea
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  // Se descarta la extensión que venga en el nombre (si la hay) y se impone la del MIME: así el
  // nombre nunca contradice el contenido real.
  const sinExtension = base.replace(/\.[A-Za-z0-9]{1,8}$/, "").trim();
  const limpio = sinExtension.length > 0 ? sinExtension : "descarga";
  return `${limpio}.${extension}`;
}

/**
 * Valor de `Content-Disposition: attachment` con el filename saneado. Incluye el fallback
 * ASCII (`filename="…"`) y la variante RFC 5987 (`filename*=UTF-8''…`) para nombres con
 * acentos/no-ASCII. El adapter lo pasa como `ResponseContentDisposition` de la descarga.
 */
function contentDispositionAttachment(
  nombreArchivo: string,
  // `inline` lo usan SOLO las miniaturas de la página de entrega (productos-tipos-digitales F09):
  // un `<img>` que apunta a una URL con `attachment` no es algo con lo que se pueda contar. NO
  // cambia nada de la política de acceso — la URL sigue siendo prefirmada, corta y autorizada por
  // el Entitlement; lo único que cambia es si el navegador la pinta o la baja.
  disposicion: "attachment" | "inline" = "attachment",
): string {
  const asciiFallback = nombreArchivo.replace(NO_ASCII_PRINTABLE, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(nombreArchivo);
  return `${disposicion}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export interface StorageConfig {
  endpoint: string | undefined;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  bucket: string | undefined;
}

/** Metadata real de un objeto ya almacenado, tal como la reporta R2 (no lo que dijo el cliente). */
export interface ObjetoAlmacenado {
  /** Tamaño real en bytes (`ContentLength`). Es la fuente del límite de 20 MB (D7). */
  bytes: number;
  /** Content-Type con el que R2 almacenó el objeto; `undefined` si el objeto no lo declara. */
  contentType: string | undefined;
}

export interface StorageService {
  /**
   * URL prefirmada PUT para subir el objeto en `key`. El `contentType` va FIRMADO (la URL solo
   * vale para ese tipo exacto) y es OBLIGATORIO desde F02: con la allowlist abierta a 9 tipos, un
   * default `application/pdf` sería una trampa silenciosa.
   */
  presignarSubida(input: {
    key: string;
    contentType: string;
    expiresEnSegundos?: number;
  }): Promise<string>;
  /**
   * URL prefirmada GET para descargar `key` como attachment con `nombreArchivo`. El `contentType`
   * viaja como `ResponseContentType`, así el navegador recibe el tipo REAL del archivo (F02/F03).
   */
  presignarDescarga(input: {
    key: string;
    nombreArchivo: string;
    contentType: string;
    expiresEnSegundos?: number;
    /**
     * `attachment` (default) baja el archivo; `inline` deja que el navegador lo pinte — lo usan las
     * MINIATURAS de la página de entrega (F09). La política de acceso no cambia: sigue siendo una
     * URL prefirmada, corta y autorizada por el Entitlement de una orden pagada (ADR-0002).
     */
    disposicion?: "attachment" | "inline";
  }): Promise<string>;
  /**
   * Metadata del objeto en `key`, o `null` si no existe (404 de R2). Reemplaza al `headObject`
   * booleano de F03: la confirmación necesita el TAMAÑO real para aplicar el límite de 20 MB (D7),
   * y ese dato solo lo tiene el bucket — el cliente no es fuente confiable de su propio peso.
   */
  statObject(key: string): Promise<ObjetoAlmacenado | null>;
  /** Sube un objeto server-side (scripts/usos futuros; el flujo del panel usa presign). */
  putObject(input: {
    key: string;
    body: Uint8Array | string;
    contentType?: string;
  }): Promise<void>;
  /** Borra un objeto (overwrite/limpieza; usado por el test de integración). */
  deleteObject(key: string): Promise<void>;
}

/** Fail-fast: exige que la config esté presente al ejecutar. NUNCA incluye el valor (secreto). */
function exigir(valor: string | undefined, nombre: string): string {
  if (!valor) {
    throw new Error(
      `Falta ${nombre} para operar con el storage R2 — configúralo en .env (ver .env.example).`,
    );
  }
  return valor;
}

export function crearStorageService(config: StorageConfig): StorageService {
  let clienteCache: S3Client | undefined;

  /** Resuelve (y memoiza) el S3Client + bucket, validando la config al ejecutar (fail-fast). */
  function resolver(): { s3: S3Client; bucket: string } {
    const endpoint = exigir(config.endpoint, "R2_ENDPOINT");
    const accessKeyId = exigir(config.accessKeyId, "R2_ACCESS_KEY_ID");
    const secretAccessKey = exigir(config.secretAccessKey, "R2_SECRET_ACCESS_KEY");
    const bucket = exigir(config.bucket, "R2_BUCKET");
    clienteCache ??= new S3Client({
      region: "auto", // R2 no usa regiones AWS (S4)
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // path-style predecible contra el endpoint de R2
      // Los checksums CRC32 default del aws-sdk v3 reciente rompen contra R2 (S4).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return { s3: clienteCache, bucket };
  }

  return {
    async presignarSubida({ key, contentType, expiresEnSegundos }) {
      const { s3, bucket } = resolver();
      const comando = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      return getSignedUrl(s3, comando, {
        expiresIn: expiresEnSegundos ?? EXPIRACION_SUBIDA_SEGUNDOS,
        // Firma el content-type: la URL solo es válida si el cliente sube exactamente ESE tipo
        // (sin esto el aws-sdk deja content-type fuera de SignedHeaders y cualquier tipo pasaría).
        // El fetch PUT del cliente debe mandar el mismo header (application/pdf o el de la imagen).
        signableHeaders: new Set(["content-type"]),
      });
    },

    async presignarDescarga({
      key,
      nombreArchivo,
      contentType,
      expiresEnSegundos,
      disposicion,
    }) {
      const { s3, bucket } = resolver();
      const comando = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: contentDispositionAttachment(
          nombreArchivo,
          disposicion,
        ),
        // El tipo REAL del archivo (F02): un MP3 llega como `audio/mpeg`, no como PDF.
        ResponseContentType: contentType,
      });
      return getSignedUrl(s3, comando, {
        expiresIn: expiresEnSegundos ?? EXPIRACION_DESCARGA_SEGUNDOS,
      });
    },

    async statObject(key) {
      const { s3, bucket } = resolver();
      try {
        const salida = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          bytes: salida.ContentLength ?? 0,
          contentType: salida.ContentType ?? undefined,
        };
      } catch (e) {
        // R2/S3 devuelven 404 (NotFound / $metadata 404) para un objeto ausente: eso es
        // "no existe", no un error a propagar. Cualquier otro fallo (auth, red) sí se propaga.
        if (esNotFound(e)) return null;
        throw e;
      }
    },

    async putObject({ key, body, contentType }) {
      const { s3, bucket } = resolver();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? CONTENT_TYPE_PDF,
        }),
      );
    },

    async deleteObject(key) {
      const { s3, bucket } = resolver();
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** Distingue el 404 (objeto ausente) de un error real, sin depender de una clase concreta. */
function esNotFound(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
}
