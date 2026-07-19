import { describe, expect, it } from "vitest";

import { esRutaRelativaSegura } from "~/server/sesion/rutaRelativa";

/**
 * Guard PURO del `callbackUrl` del login DEV (F09c): el endpoint `/api/dev/login` redirige a esta ruta
 * tras crear la sesión. Debe ser una ruta RELATIVA al mismo host (`/editor`, `/`) — nunca una URL
 * absoluta ni protocol-relative que saque al navegador a otro host (open-redirect). Es dev-only, pero
 * el guard se testea porque decide una redirección.
 */
describe("sesion/esRutaRelativaSegura (guard del callback dev)", () => {
  // page.sesion.dev.001 — ruta root-relative típica ⇒ OK
  it("acepta rutas root-relative (`/editor`, `/`)", () => {
    expect(esRutaRelativaSegura("/editor")).toBe(true);
    expect(esRutaRelativaSegura("/")).toBe(true);
    expect(esRutaRelativaSegura("/admin?x=1")).toBe(true);
  });

  // page.sesion.dev.002 — URL absoluta ⇒ rechazo (no saca al navegador a otro host)
  it("rechaza URLs absolutas", () => {
    expect(esRutaRelativaSegura("https://evil.com")).toBe(false);
    expect(esRutaRelativaSegura("http://autora.localhost:3001/editor")).toBe(false);
    expect(esRutaRelativaSegura("javascript:alert(1)")).toBe(false);
  });

  // page.sesion.dev.003 — protocol-relative y truco de backslash ⇒ rechazo
  it("rechaza protocol-relative `//host` y el truco `/\\host`", () => {
    expect(esRutaRelativaSegura("//evil.com")).toBe(false);
    expect(esRutaRelativaSegura("/\\evil.com")).toBe(false);
  });

  // page.sesion.dev.004 — ruta suelta sin `/` inicial y string vacío ⇒ rechazo
  it("rechaza rutas sin `/` inicial y el string vacío", () => {
    expect(esRutaRelativaSegura("editor")).toBe(false);
    expect(esRutaRelativaSegura("")).toBe(false);
  });
});
