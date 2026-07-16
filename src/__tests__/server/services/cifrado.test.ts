import { describe, expect, it } from "vitest";

import { cifrar, descifrar, parsearClave } from "~/server/services/cifrado";

/**
 * Service de cifrado (AES-256-GCM app-level, S2/ADR-0006). Núcleo puro y testeable:
 * las funciones no tocan env ni I/O — reciben la clave (Buffer) inyectada. Es lo que
 * usa el seed de F01-A para cifrar las CredencialFlow y lo que usará el ruteo del
 * webhook (Carril C) para descifrarlas antes de instanciar el service Flow del tenant.
 *
 * Invariante I5: los secretos y la clave jamás en texto plano en DB/logs/respuestas.
 */

// Clave de test: 32 bytes → base64. NO es un secreto real (fija, pública, solo test).
const CLAVE_B64 = Buffer.alloc(32, 7).toString("base64");
const clave = parsearClave(CLAVE_B64);

describe("services/cifrado — AES-256-GCM", () => {
  // cifrado.001
  it("roundtrip: descifrar(cifrar(x)) recupera el secreto original", () => {
    const secreto = "flow-secret-key-super-confidencial-123";
    const token = cifrar(secreto, clave);
    expect(descifrar(token, clave)).toBe(secreto);
  });

  // cifrado.002
  it("el ciphertext NO contiene el plaintext (ni como substring)", () => {
    const secreto = "PLAINTEXT_MARCADOR_UNICO";
    const token = cifrar(secreto, clave);
    expect(token).not.toContain(secreto);
    // Tampoco en el buffer decodificado (defensa extra contra fuga en el empaquetado).
    expect(Buffer.from(token, "base64").toString("latin1")).not.toContain(
      secreto,
    );
  });

  // cifrado.003
  it("descifrar con una clave incorrecta falla (auth tag GCM no verifica)", () => {
    const secreto = "otro-secreto";
    const token = cifrar(secreto, clave);
    const claveMala = parsearClave(Buffer.alloc(32, 9).toString("base64"));
    expect(() => descifrar(token, claveMala)).toThrow();
  });

  // cifrado.004
  it("dos cifrados del mismo plaintext dan tokens distintos (IV aleatorio por operación)", () => {
    const secreto = "mismo-secreto";
    expect(cifrar(secreto, clave)).not.toBe(cifrar(secreto, clave));
  });

  // cifrado.005
  it("parsearClave acepta base64 de 32 bytes y rechaza longitudes inválidas sin filtrar el valor", () => {
    expect(parsearClave(CLAVE_B64)).toHaveLength(32);

    const corta = Buffer.alloc(16, 1).toString("base64"); // 128 bits, insuficiente para AES-256
    let mensaje = "";
    try {
      parsearClave(corta);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toMatch(/32 bytes/i);
    // El mensaje de error nunca incluye el valor de la clave (I5).
    expect(mensaje).not.toContain(corta);
  });
});
