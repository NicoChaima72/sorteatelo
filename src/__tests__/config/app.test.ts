import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { APP_CONFIG } from "~/config/app";

/**
 * Tests de la config de identidad de plataforma (F01). `APP_CONFIG` es la ÚNICA fuente del
 * nombre/tagline/dominio de Sortéatelo — la UI lo consume de acá, nunca hardcodeado
 * (frontend-conventions § Idioma, I4). Debe ser importable desde el cliente: cero dependencias
 * de `~/server` (arrastraría env vars server-only al bundle).
 */
describe("config/app — APP_CONFIG", () => {
  // config.app.001 — expone la identidad de plataforma (nombre/tagline/dominio)
  it("expone nombre, tagline y dominio de la plataforma", () => {
    expect(APP_CONFIG.name).toBe("Sortéatelo");
    expect(APP_CONFIG.dominio).toBe("sorteatelo.cl");
    expect(typeof APP_CONFIG.tagline).toBe("string");
    expect(APP_CONFIG.tagline.length).toBeGreaterThan(0);
  });

  // config.app.002 — client-safe: no importa nada de ~/server (no filtra secretos al bundle)
  it("no importa código de ~/server (seguro para el bundle del cliente)", () => {
    const src = readFileSync(resolve(__dirname, "../../config/app.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']~\/server/);
  });
});
