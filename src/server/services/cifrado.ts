import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Service de cifrado de credenciales — AES-256-GCM a nivel de aplicación (S2/ADR-0006).
 *
 * Adapter de la capa `services/`: núcleo PURO y testeable. No conoce sesión ni reglas
 * de negocio, no toca `~/env` ni I/O — la clave entra como argumento explícito
 * (`Buffer` de 32 bytes). El caller (el seed de F01-A; el ruteo del webhook de Carril C)
 * lee `CREDENTIALS_ENCRYPTION_KEY` de `env` y la parsea con `parsearClave`.
 *
 * Invariante I5 (ADR-0006): las CredencialFlow (apiKey/secretKey) se guardan CIFRADAS
 * at-rest; ni los secretos ni la clave aparecen jamás en texto plano en DB, logs ni
 * respuestas — por eso los mensajes de error nunca incluyen valores.
 *
 * Formato del token cifrado (empaquetado en un solo String, aprobado por schema-guardian):
 *   base64( iv[12] ‖ authTag[16] ‖ ciphertext )
 * GCM usa un IV de 96 bits (recomendado) NUEVO por operación (nonce único) y un auth tag
 * de 128 bits que garantiza integridad/autenticidad: descifrar con clave (o token)
 * alterado falla al verificar el tag.
 */

const ALGORITMO = "aes-256-gcm";
const LONGITUD_IV = 12; // 96 bits — recomendado para GCM
const LONGITUD_TAG = 16; // 128 bits — auth tag de GCM
const LONGITUD_CLAVE = 32; // 256 bits — AES-256

/**
 * Decodifica y valida la clave de cifrado desde su representación base64.
 * Fail-fast si no decodifica a exactamente 32 bytes. El mensaje NUNCA incluye el
 * valor de la clave (I5).
 */
export function parsearClave(rawBase64: string): Buffer {
  const clave = Buffer.from(rawBase64, "base64");
  if (clave.length !== LONGITUD_CLAVE) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY inválida: debe decodificar (base64) a ${LONGITUD_CLAVE} bytes ` +
        `para AES-256. Generá una con: openssl rand -base64 32`,
    );
  }
  return clave;
}

/** Cifra `textoPlano` con AES-256-GCM y devuelve el token empaquetado (base64). */
export function cifrar(textoPlano: string, clave: Buffer): string {
  const iv = randomBytes(LONGITUD_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([
    cipher.update(textoPlano, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, cifrado]).toString("base64");
}

/**
 * Descifra un token producido por `cifrar`. Lanza si la clave es incorrecta o el
 * token fue alterado (el auth tag de GCM no verifica).
 */
export function descifrar(tokenCifrado: string, clave: Buffer): string {
  const raw = Buffer.from(tokenCifrado, "base64");
  const iv = raw.subarray(0, LONGITUD_IV);
  const authTag = raw.subarray(LONGITUD_IV, LONGITUD_IV + LONGITUD_TAG);
  const cifrado = raw.subarray(LONGITUD_IV + LONGITUD_TAG);

  const decipher = createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString(
    "utf8",
  );
}
