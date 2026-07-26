import { type ProductFileType } from "@prisma/client";

/**
 * Tipos de archivo de producto: allowlist MIME **cerrada** + derivación de tipo/extensión
 * (productos-tipos-digitales F02, D1/D7/D9, I4).
 *
 * Vive en `src/lib/` y es **puro** —sin `aws-sdk`, sin Prisma en runtime (el único import es un
 * `import type`, que TS borra al compilar)— a propósito: lo consumen el servidor (presign,
 * confirmación, entrega) Y el form del panel en el navegador (F04: `accept` dinámico y el aviso de
 * peso ANTES de subir). Si esto viviera en `services/storage.ts`, el `@aws-sdk/client-s3` entero se
 * colaría en el bundle del cliente.
 *
 * **D9 — el tipo se INFIERE, no se declara**: el Organizador nunca elige el tipo. El server lo
 * deriva del MIME contra esta allowlist (rechazo ANTES de presignar + re-validación en la
 * confirmación contra lo que R2 realmente almacenó). La extensión de la key sale de ACÁ, jamás del
 * nombre de archivo que mandó el cliente.
 *
 * **Fuera de la allowlist a propósito**: `video/*` (peso, expectativa de streaming, costo de
 * egress — puerta abierta explícita del plan), `application/octet-stream` (el comodín binario
 * volvería la allowlist decorativa) y `image/svg+xml` (un SVG puede embeber scripts y se sirve
 * desde nuestro dominio al descargarlo).
 */

/** Límite de peso por archivo, **transversal a todos los tipos** (D7). 20 MB. */
export const LIMITE_BYTES_ARCHIVO_PRODUCTO = 20 * 1024 * 1024;

export interface TipoArchivoResuelto {
  /** MIME **canónico** (el alias del navegador ya normalizado). Es el que se firma y se persiste. */
  contentType: string;
  /** Bucket grueso por el que ramifica la entrega (miniaturas solo IMAGEN, F09). */
  tipo: ProductFileType;
  /** Extensión canónica de la key, SIN punto. Derivada del MIME (D9). */
  extension: string;
}

/**
 * La allowlist. Clave = MIME canónico; es la ÚNICA definición del set de D1 (el `accept` del form,
 * el Zod del input y la validación del service salen todos de acá — una sola fuente de verdad).
 */
const ALLOWLIST: Record<string, { tipo: ProductFileType; extension: string }> = {
  "application/pdf": { tipo: "PDF", extension: "pdf" },
  "application/epub+zip": { tipo: "EPUB", extension: "epub" },
  "image/png": { tipo: "IMAGEN", extension: "png" },
  "image/jpeg": { tipo: "IMAGEN", extension: "jpg" },
  "image/webp": { tipo: "IMAGEN", extension: "webp" },
  "audio/mpeg": { tipo: "AUDIO", extension: "mp3" },
  "audio/mp4": { tipo: "AUDIO", extension: "m4a" },
  "audio/wav": { tipo: "AUDIO", extension: "wav" },
  "application/zip": { tipo: "ZIP", extension: "zip" },
};

/**
 * Alias que mandan los navegadores REALES para tipos que YA están en la allowlist. No amplía el set
 * de D1: es la misma cosa escrita distinto. Sin esto, subir un `.zip` desde Chrome en Windows
 * (`application/x-zip-compressed`) o un `.m4a` desde Safari fallaría con "tipo no permitido", que es
 * un falso negativo confuso. El valor persistido y firmado es SIEMPRE el canónico.
 */
const ALIAS: Record<string, string> = {
  "application/x-zip-compressed": "application/zip",
  "application/x-compressed": "application/zip",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "image/jpg": "image/jpeg",
};

/** Los MIME **canónicos** admitidos. Alimenta el Zod del input y el `accept` del form (F04). */
export const MIMES_ARCHIVO_PRODUCTO: readonly string[] = Object.keys(ALLOWLIST);

/**
 * Normaliza el valor crudo de un header/`File.type`: minúsculas, sin parámetros (`; charset=…`) y
 * con los alias resueltos al canónico.
 */
function canonizar(contentTypeCrudo: string): string {
  const base = contentTypeCrudo.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALIAS[base] ?? base;
}

/**
 * Resuelve un MIME (crudo, tal como lo manda el cliente o lo devuelve R2) contra la allowlist.
 * `null` = **NO permitido** — incluye el string vacío, que es lo que reportan algunos navegadores
 * para extensiones que no conocen. Rechazar el vacío es deliberado: adivinar el tipo desde el
 * nombre del archivo sería exactamente lo que D9 prohíbe.
 */
export function resolverTipoArchivo(
  contentTypeCrudo: string | undefined | null,
): TipoArchivoResuelto | null {
  if (!contentTypeCrudo) return null;
  const contentType = canonizar(contentTypeCrudo);
  const entrada = ALLOWLIST[contentType];
  if (!entrada) return null;
  return { contentType, tipo: entrada.tipo, extension: entrada.extension };
}

/**
 * Extensión canónica de un MIME **ya validado**. Lanza si no está en la allowlist: llegar acá con
 * un tipo no permitido es un bug del caller (tenía que haber pasado por `resolverTipoArchivo`),
 * no una condición de negocio.
 */
export function extensionDeContentType(contentType: string): string {
  const resuelto = resolverTipoArchivo(contentType);
  if (!resuelto) {
    throw new Error(
      `Content-Type fuera de la allowlist de archivos de producto: ${contentType}`,
    );
  }
  return resuelto.extension;
}

/**
 * Formatea un tamaño en bytes para un mensaje humano (p. ej. "22,4 MB", "20 MB", "340 KB").
 * Lo usan los dos rechazos por peso: el del cliente (F04) y el de la confirmación server-side (D7).
 *
 * El decimal se imprime **solo si aporta**: el límite es "20 MB" en la landing, en el aviso del form
 * y en el mensaje de error, así que un "20,0 MB" acá lo haría ver como tres números distintos para
 * la misma cosa. Un peso real como 22,4 MB sí conserva su decimal — ahí el detalle es la información.
 */
export function formatearPeso(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    const conDecimal = mb.toFixed(1);
    // ".0" fuera: para un valor redondo el decimal es ruido, no precisión.
    const limpio = conDecimal.endsWith(".0") ? conDecimal.slice(0, -2) : conDecimal;
    return `${limpio.replace(".", ",")} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

/**
 * Las extensiones canónicas en MAYÚSCULA, en el orden de la allowlist ("PDF", "EPUB", "PNG"…).
 * Es lo que el form del panel imprime en su aviso y lo que los mensajes de rechazo listan.
 *
 * Se DERIVA de `ALLOWLIST` en vez de escribirse a mano (I5): agregar un tipo al set de D1 lo hace
 * aparecer solo en el `accept` del input, en el aviso y en los mensajes de error, sin que quede una
 * lista humana desactualizada contradiciendo a la máquina — que es la forma más común de que un
 * Organizador crea que algo no se acepta.
 */
export const EXTENSIONES_ARCHIVO_PRODUCTO: readonly string[] = Object.values(
  ALLOWLIST,
).map((e) => e.extension.toUpperCase());

/** Resultado de validar un archivo elegido en el form: aceptado, o rechazado CON el motivo humano. */
export type ValidacionArchivo =
  | { ok: true }
  | { ok: false; mensaje: string };

/** Lo mínimo que se necesita de un `File` del navegador. Así la función es pura y testeable en node. */
export interface ArchivoElegido {
  name: string;
  /** Tamaño en bytes tal como lo reporta el navegador. */
  size: number;
  /** `File.type`: el MIME que adivinó el sistema operativo. Puede venir **vacío**. */
  type: string;
}

/**
 * Valida un archivo recién elegido en el form del panel, ANTES de pedir la URL prefirmada (F04/D7).
 *
 * **Esto NO es la validación de seguridad.** La de verdad es server-side y no se puede saltar: la
 * allowlist se re-chequea al presignar y el peso se mide con `statObject` contra lo que R2
 * realmente almacenó, porque el cliente no es fuente confiable ni de su tipo ni de su peso (I4/D7).
 * Esta función es UX: que el Organizador no espere una subida de 40 MB para enterarse de que no
 * entraba, y que el rechazo diga algo accionable en vez de un error de servidor.
 *
 * **El orden de los chequeos es una decisión, no un detalle**: primero el TIPO, después el peso. Un
 * MP4 de 90 MB tiene los dos problemas, pero pedirle que lo comprima sería mentirle — comprimido
 * tampoco lo vamos a aceptar. Se reporta el problema que no tiene arreglo.
 */
export function validarArchivoDeProducto(archivo: ArchivoElegido): ValidacionArchivo {
  const tipos = EXTENSIONES_ARCHIVO_PRODUCTO.join(", ");

  // El navegador no supo qué es (típico de `.epub` en Windows). NO se deduce del nombre: eso es
  // exactamente lo que D9 prohíbe. Pero el mensaje no puede acusar al archivo de estar prohibido
  // cuando el problema es que nadie le puso nombre al tipo.
  if (archivo.type.trim() === "") {
    return {
      ok: false,
      mensaje: `No pudimos reconocer el tipo de «${archivo.name}»: tu navegador no lo informó. Prueba con otro archivo o vuelve a exportarlo. Aceptamos ${tipos}.`,
    };
  }

  if (resolverTipoArchivo(archivo.type) === null) {
    return {
      ok: false,
      mensaje: `«${archivo.name}» no es un tipo que podamos entregar. Aceptamos ${tipos}.`,
    };
  }

  if (archivo.size > LIMITE_BYTES_ARCHIVO_PRODUCTO) {
    return {
      ok: false,
      mensaje: `«${archivo.name}» pesa ${formatearPeso(archivo.size)} y el máximo es ${formatearPeso(LIMITE_BYTES_ARCHIVO_PRODUCTO)} por archivo. Sube una versión más liviana.`,
    };
  }

  return { ok: true };
}
