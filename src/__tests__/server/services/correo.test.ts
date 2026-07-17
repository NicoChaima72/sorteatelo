import { describe, expect, it, vi } from "vitest";

import {
  crearCorreoService,
  type FetchLike,
  RESEND_ENDPOINT,
} from "~/server/services/correo";

/**
 * Tests del adapter de correo Resend (F01/D4). El envío se hace por UN POST HTTP; estos tests
 * construyen el service con un `fetch` FAKE e inspeccionan el request resultante — endpoint,
 * bearer auth, body (from/to/reply_to/subject/text/html) — y CRUCIAL: la `RESEND_API_KEY` nunca
 * aparece en el body ni en los mensajes de error (I3). El único test que golpea Resend real está
 * marcado como integración opt-in (flag `RESEND_INTEGRATION=1` + la key presente) y se skipea
 * limpio en cualquier otra corrida (no gasta cuota ni ensucia el inbox).
 */

const API_KEY = "re_test_super_sensible_1234567890";

/** Fake de fetch que responde 200 `{ id }` y captura el request para inspeccionarlo. */
function fetchOk(id = "email-abc-123") {
  return vi.fn<FetchLike>().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id }),
  });
}

describe("services/correo — fail-fast de config", () => {
  // correo.factory.001 — sin apiKey ⇒ error claro al enviar, SIN volcar valor alguno
  it("hace fail-fast con mensaje claro si falta RESEND_API_KEY al enviar, sin incluir secretos", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const correo = crearCorreoService({ apiKey: undefined, fetchImpl });

    await expect(
      correo.enviarCorreo({
        from: "T · vía Sortealo <onboarding@resend.dev>",
        to: "fan@example.cl",
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
    // Nunca tocó la red: el gate corre antes de cualquier efecto.
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("services/correo — enviarCorreo (POST a Resend)", () => {
  // correo.envio.001 — arma el POST correcto (endpoint, bearer, from/to/reply_to/subject/text/html)
  it("postea al endpoint de Resend con bearer auth y el body completo (incluye reply_to y html)", async () => {
    const fetchImpl = fetchOk("email-xyz-1");
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const res = await correo.enviarCorreo({
      from: "Tienda ARMY · vía Sortealo <onboarding@resend.dev>",
      to: "fan@example.cl",
      replyTo: "organizadora@tienda.cl",
      subject: "Tu compra en Tienda ARMY",
      text: "Descarga: https://app.test/api/descargas/tok",
      html: "<p>Descarga: https://app.test/api/descargas/tok</p>",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.headers["Content-Type"]).toBe("application/json");

    const enviado = JSON.parse(init.body) as Record<string, unknown>;
    expect(enviado).toMatchObject({
      from: "Tienda ARMY · vía Sortealo <onboarding@resend.dev>",
      to: "fan@example.cl",
      reply_to: "organizadora@tienda.cl", // snake_case exigido por la API de Resend
      subject: "Tu compra en Tienda ARMY",
      text: "Descarga: https://app.test/api/descargas/tok",
      html: "<p>Descarga: https://app.test/api/descargas/tok</p>",
    });

    expect(res).toEqual({ id: "email-xyz-1" });
  });

  // correo.envio.002 — sin reply-to ni html: esos campos NO viajan (correo válido igual)
  it("omite reply_to y html cuando no se pasan (correo mínimo válido)", async () => {
    const fetchImpl = fetchOk();
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    await correo.enviarCorreo({
      from: "T · vía Sortealo <onboarding@resend.dev>",
      to: "fan@example.cl",
      subject: "s",
      text: "t",
    });

    const enviado = JSON.parse(fetchImpl.mock.calls[0]![1].body) as Record<
      string,
      unknown
    >;
    expect(enviado).not.toHaveProperty("reply_to");
    expect(enviado).not.toHaveProperty("html");
    expect(enviado).toMatchObject({ to: "fan@example.cl", text: "t" });
  });

  // correo.error.001 — respuesta no-2xx ⇒ error con el status, JAMÁS la apiKey
  it("lanza un error que incluye el status de Resend pero nunca la RESEND_API_KEY", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Invalid `to` field" }),
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const err = await correo
      .enviarCorreo({
        from: "T · vía Sortealo <onboarding@resend.dev>",
        to: "no-sirve",
        subject: "s",
        text: "t",
      })
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("422");
    // El mensaje de Resend puede aparecer, pero la key SECRETA jamás (I3).
    expect((err as Error).message).not.toContain(API_KEY);
  });

  // correo.error.002 — 2xx sin id ⇒ error (no fingir éxito)
  it("lanza si Resend responde 2xx pero sin id de envío", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    await expect(
      correo.enviarCorreo({
        from: "T · vía Sortealo <onboarding@resend.dev>",
        to: "fan@example.cl",
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/id/);
  });
});

/**
 * Test de INTEGRACIÓN real contra Resend (D10/S7). OPT-IN doble: solo corre si `RESEND_API_KEY`
 * está en el entorno Y el flag explícito `RESEND_INTEGRATION=1` está presente — así un `vitest run`
 * normal NO gasta cuota ni manda correos. Verifica que Resend devuelve un id. El feature-implementer
 * lo corre UNA vez para probar el circuito real.
 *
 * Destinatario: el correo DE LA CUENTA Resend (`nikochaima72@gmail.com`). Con el remitente de
 * prueba `onboarding@resend.dev` (sin dominio verificado, S1), Resend SOLO permite enviar al email
 * exacto del dueño de la cuenta — rechaza cualquier otro destinatario (incluida la subdirección
 * `+test`, que Resend trata como string distinto) con 403 hasta verificar un dominio (decisión
 * abierta #4). Es la restricción esperada del modo sandbox, no un bug del adapter.
 */
const RESEND_LISTO =
  !!process.env.RESEND_API_KEY && process.env.RESEND_INTEGRATION === "1";

describe("services/correo — envío real contra Resend (integración, opt-in)", () => {
  // correo.integracion.001 — envío real: recibe un id de Resend
  it.runIf(RESEND_LISTO)(
    "envía un correo de prueba real vía Resend y recibe un id",
    async () => {
      const correo = crearCorreoService({ apiKey: process.env.RESEND_API_KEY });
      const { id } = await correo.enviarCorreo({
        from: "Sortealo (prueba) · vía Sortealo <onboarding@resend.dev>",
        // El email del dueño de la cuenta Resend: único destinatario permitido con el
        // remitente de prueba sin dominio verificado (ver el header del describe).
        to: "nikochaima72@gmail.com",
        subject: "Prueba de integración — correo transaccional (F04)",
        text:
          "Este es un envío de prueba del service de correo de Sortealo (F04). " +
          "Si lo recibiste, el circuito Resend real funciona.",
        html:
          "<p>Este es un envío de prueba del service de correo de <strong>Sortealo</strong> (F04).</p>" +
          "<p>Si lo recibiste, el circuito Resend real funciona.</p>",
      });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
