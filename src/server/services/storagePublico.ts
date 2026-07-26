import {
  CONTENT_TYPES_IMAGEN,
  esContentTypeImagen,
  type ContentTypeImagen,
} from "~/lib/imagenes";
import {
  CONTENT_TYPE_PDF,
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
 * apunta al `R2_PUBLIC_BUCKET`, que **jamás contiene un PDF de PRODUCTO** (I1, re-redacción de
 * admin-bases-pdf D1 — antes decía "jamás un PDF" a secas, pensando solo en el producto). Reusa el
 * S3Client + el presigner PUT + `headObject` del service privado (mismo adapter, otro bucket + otro
 * Content-Type), y agrega tres cosas propias del flujo público:
 *   - `presignarSubidaImagen`: presigna PUT firmando un Content-Type de la allowlist de imágenes
 *     (defensa en profundidad — el input Zod ya lo restringe; el service lo re-valida, I6).
 *   - `presignarSubidaBases`: presigna PUT firmando `application/pdf`, y SOLO para el destino
 *     `bases` (ver `keyBasesSorteo`). Es la ÚNICA excepción de la allowlist del bucket público.
 *   - `urlPublica`: compone la URL pública estable (`R2_PUBLIC_BASE_URL` + key + cache-buster
 *     `?v=`), que se persiste en las columnas `*Url` del modelo (D2).
 *
 * **La excepción `bases` (admin-bases-pdf D1/I1, ADR-0008 + addendum ADR-0013)**: las bases legales
 * del sorteo son un documento PÚBLICO por naturaleza — ADR-0008 obliga a mostrarlas a cualquier
 * visitante del storefront —, no un producto pirateable. Por eso viven acá (URL estable, cacheable,
 * embebible en el visor de `/bases`) y no en el bucket privado con URL prefirmada que expira. El
 * PDF de PRODUCTO sigue SOLO en el bucket privado, gated por `Entitlement` (ADR-0002/0009): esa
 * frontera no se movió ni un milímetro.
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
 * `<tenantId>/sorteo/<raffleId>/bases.pdf` (admin-bases-pdf F01/D1/D2): el PDF de bases legales del
 * Sorteo. A diferencia de las imágenes, la key SÍ lleva extensión — patrón `keyDePdfProducto`
 * (`<tenantId>/<productId>.pdf`): el visor de `/bases` y el botón "Descargar PDF" heredan un nombre
 * de archivo sano del path. Comparte el namespace `sorteo/<raffleId>/` con `keyPremioSorteo`.
 * Re-subir bases sobre el mismo sorteo sobreescribe la MISMA key (el `?v=` de la URL busta el CDN).
 */
export function keyBasesSorteo(tenantId: string, raffleId: string): string {
  return `${tenantId}/sorteo/${raffleId}/bases.pdf`;
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
  /**
   * URL prefirmada PUT para subir el PDF de BASES en `key` (destino `bases`, D1). Firma
   * `application/pdf` — el ÚNICO Content-Type no-imagen que este bucket admite, y solo por esta vía.
   */
  presignarSubidaBases(input: {
    key: string;
    contentType: string;
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
    async presignarSubidaBases({ key, contentType, expiresEnSegundos }) {
      // Defensa en profundidad (I6), espejo de `presignarSubidaImagen`: el input Zod ya fija
      // `application/pdf`; el service lo re-valida antes de firmar. Un tipo distinto NO se presigna
      // — así el destino `bases` no puede convertirse en una puerta genérica del bucket público.
      if (contentType !== CONTENT_TYPE_PDF) {
        throw new Error(
          `Content-Type no permitido para las bases del sorteo. Permitido: ${CONTENT_TYPE_PDF}.`,
        );
      }
      return base.presignarSubida({ key, contentType, expiresEnSegundos });
    },
    // El bucket PÚBLICO solo necesita saber si el objeto está (no aplica el límite de 20 MB de los
    // archivos de producto, que es política del bucket privado). Se adapta el `statObject` del
    // adapter base a ese booleano acá, para no duplicar el manejo del 404 de R2 (I5).
    headObject: async (key) => (await base.statObject(key)) !== null,
    urlPublica: (key) =>
      componerUrlPublica({ baseUrl: config.baseUrl, key, version: Date.now() }),
    putObject: (input) => base.putObject(input),
    deleteObject: (key) => base.deleteObject(key),
  };
}
