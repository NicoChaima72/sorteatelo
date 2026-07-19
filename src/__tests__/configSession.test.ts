import { describe, expect, it } from "vitest";

import { sesionFakeAplica } from "~/configSession";

/**
 * Guard PURO de la impersonación de dev (configSession, F09c). Lo crítico: el mecanismo es INERTE fuera
 * de development. Aunque el switch `enabled` quede en `true` (el usuario lo deja prendido para usarlo),
 * en PRODUCCIÓN la sesión fake JAMÁS aplica ⇒ manda la autenticación real (getServerAuthSession). Esta
 * es la garantía de seguridad del interceptor de `/api/auth/session` y del wrapper del servidor.
 */
describe("configSession/sesionFakeAplica (guard de impersonación dev)", () => {
  // config.session.001 — el camino feliz de dev: prendido + development ⇒ aplica
  it("enabled + development ⇒ true (sesión fake activa)", () => {
    expect(sesionFakeAplica({ enabled: true, nodeEnv: "development" })).toBe(true);
  });

  // config.session.002 — LA garantía de seguridad: prendido en PRODUCCIÓN ⇒ NO aplica (sesión real)
  it("enabled + production ⇒ false (inerte en prod ⇒ sesión real)", () => {
    expect(sesionFakeAplica({ enabled: true, nodeEnv: "production" })).toBe(false);
  });

  // config.session.003 — prendido en test ⇒ tampoco aplica (solo development)
  it("enabled + test ⇒ false (solo development lo activa)", () => {
    expect(sesionFakeAplica({ enabled: true, nodeEnv: "test" })).toBe(false);
  });

  // config.session.004 — apagado ⇒ nunca aplica, ni siquiera en development
  it("disabled ⇒ false en cualquier entorno", () => {
    expect(sesionFakeAplica({ enabled: false, nodeEnv: "development" })).toBe(false);
    expect(sesionFakeAplica({ enabled: false, nodeEnv: "production" })).toBe(false);
    expect(sesionFakeAplica({ enabled: false, nodeEnv: undefined })).toBe(false);
  });
});
