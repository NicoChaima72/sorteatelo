import {
  CONTENT_TYPES_IMAGEN,
  esContentTypeImagen,
  type ContentTypeImagen,
} from "~/lib/imagenes";
import {
  crearStorageService,
  type StorageConfig,
  type StorageService,
} from "~/server/services/storage";

// Re-export para no romper los consumidores server que importaban la allowlist desde acá.
export { CONTENT_TYPES_IMAGEN, esContentTypeImagen, type ContentTypeImagen };

/**
 * Service Storage PÚBLICO — adapter S3-compatible al bucket PÚBLICO de assets de marca
 * (Cloudflare R2, ADR-0013, plantilla-rica F01).
 *
 * Categóricamente distinto del `storage.ts` privado de PDFs: las imágenes del storefront
 * (logo/hero/portadas/premio) son propaganda cacheable servida por CDN, sin valor si se
 * "filtran". La frontera público/privado es a nivel de BUCKET, no de prefijo: este service
 * apunta al `R2_PUBLIC_BUCKET`, que jamás contiene un PDF (I2). Reusa el S3Client + el presigner
 * PUT + `headObject` del service privado (mismo adapter, otro bucket + otro Content-Type), y
 * agrega dos cosas propias del flujo público:
 *   - `presignarSubidaImagen`: presigna PUT firmando un Content-Type de la allowlist de imágenes
 *     (defensa en profundidad — el input Zod ya lo restringe; el service lo re-valida, I6).
 *   - `urlPublica`: compone la URL pública estable (`R2_PUBLIC_BASE_URL` + key + cache-buster
 *     `?v=`), que se persiste en las columnas `*Url` del modelo (D2).
 *
 * Como el storage privado, es de PLATAFORMA (una sola cuenta R2 del Operador), no BYO por tenant.
 * Los secretos (claves R2) viven solo en el closure del service, jamás en logs ni respuestas (I5).
 */

// La allowlist `CONTENT_TYPES_IMAGEN` + `esContentTypeImagen` viven en `~/lib/imagenes` (client-safe)
// y se re-exportan arriba — el picker del editor (cliente) no puede importar este módulo (S3Client).

// ── Keys per-tenant computadas SIEMPRE server-side (D3/I6) ─────────────────────────────────
// Organización, no seguridad (el bucket es público entero). El cliente NUNCA elige la key.
// Objeto SIN extensión en la key; el Content-Type va en la metadata del objeto y el `?v=` de la
// URL pública busca cache al re-subir sobre la MISMA key.

/** `<tenantId>/branding/logo`. */
export function keyLogoTenant(tenantId: string): string {
  return `${tenantId}/branding/logo`;
}
/** `<tenantId>/branding/hero`. */
export function keyHeroTenant(tenantId: string): string {
  return `${tenantId}/branding/hero`;
}
/** `<tenantId>/productos/<productId>/portada`. */
export function keyPortadaProducto(tenantId: string, productId: string): string {
  return `${tenantId}/productos/${productId}/portada`;
}
/** `<tenantId>/sorteo/<raffleId>/premio`. */
export function keyPremioSorteo(tenantId: string, raffleId: string): string {
  return `${tenantId}/sorteo/${raffleId}/premio`;
}
/**
 * `<tenantId>/pagina/<assetId>` (catálogo-v2 F08): imágenes LIBRES del editor de la Página (modelo
 * `PageAsset`). Namespace por tenant; el `assetId` (cuid del `PageAsset`) discrimina cada imagen. La
 * key NO se persiste (se recomputa de `id+tenantId`) — el cliente jamás la elige (I6).
 */
export function keyPaginaAsset(tenantId: string, assetId: string): string {
  return `${tenantId}/pagina/${assetId}`;
}

/**
 * Compone la URL pública de un asset (D2): `R2_PUBLIC_BASE_URL` + key + cache-buster `?v=<version>`.
 * PURA y testeable — la version se inyecta (el service pasa `Date.now()`). Fail-fast si falta la
 * base (I7): mejor un 500 claro al usar que una URL rota persistida. Normaliza la barra final de la
 * base para no producir `//`.
 */
export function componerUrlPublica({
  baseUrl,
  key,
  version,
}: {
  baseUrl: string | undefined;
  key: string;
  version: number | string;
}): string {
  if (!baseUrl) {
    throw new Error(
      "Falta R2_PUBLIC_BASE_URL para componer la URL pública del asset — configúralo en .env (ver .env.example).",
    );
  }
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${key}?v=${version}`;
}

export interface StoragePublicoConfig extends StorageConfig {
  /** Base de la URL pública del bucket (`R2_PUBLIC_BASE_URL`). Sin barra final. */
  baseUrl: string | undefined;
}

export interface StoragePublicoService {
  /** URL prefirmada PUT para subir una imagen en `key`, firmando su Content-Type (de la allowlist). */
  presignarSubidaImagen(input: {
    key: string;
    contentType: ContentTypeImagen;
    expiresEnSegundos?: number;
  }): Promise<string>;
  /** `true` si el objeto existe en el bucket público; `false` si no (404 de R2). */
  headObject(key: string): Promise<boolean>;
  /** URL pública estable del asset con cache-buster (`?v=<timestamp>`). Se persiste en la columna. */
  urlPublica(key: string): string;
  /** Sube un objeto server-side (usado por el test de integración). */
  putObject(input: {
    key: string;
    body: Uint8Array | string;
    contentType?: string;
  }): Promise<void>;
  /** Borra un objeto (limpieza; usado por el test de integración). */
  deleteObject(key: string): Promise<void>;
}

export function crearStoragePublicoService(
  config: StoragePublicoConfig,
): StoragePublicoService {
  // Reusa el adapter S3 privado apuntado al bucket PÚBLICO (mismo endpoint/keys, otro bucket).
  const base: StorageService = crearStorageService(config);

  return {
    async presignarSubidaImagen({ key, contentType, expiresEnSegundos }) {
      // Defensa en profundidad (I6): el Content-Type ya viene validado por Zod en el borde;
      // el service lo re-valida antes de firmar (protege contra un caller JS sin tipos). Un tipo
      // fuera de la allowlist NO se presigna. No interpolamos el valor (el tipo lo estrecha a
      // `never` en esta rama); listamos los permitidos, que es lo accionable.
      if (!esContentTypeImagen(contentType)) {
        throw new Error(
          `Content-Type no permitido para un asset de marca. Permitidos: ${CONTENT_TYPES_IMAGEN.join(", ")}.`,
        );
      }
      return base.presignarSubida({ key, contentType, expiresEnSegundos });
    },
    headObject: (key) => base.headObject(key),
    urlPublica: (key) =>
      componerUrlPublica({ baseUrl: config.baseUrl, key, version: Date.now() }),
    putObject: (input) => base.putObject(input),
    deleteObject: (key) => base.deleteObject(key),
  };
}
