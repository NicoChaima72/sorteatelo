import { describe, expect, it, vi } from "vitest";

import {
  CorreoError,
  crearCorreoService,
  type FetchLike,
  RESEND_BATCH_ENDPOINT,
  RESEND_ENDPOINT,
  TIMEOUT_MS,
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

/**
 * Fake de fetch que responde 200 y captura el request. Sirve para los dos endpoints: al de envío
 * individual le devuelve `{ id }` y al batch un `data` con **un id por correo** — el contrato que
 * `enviarLote` exige (ver `correo.lote.004`). Un fake más laxo escondería justo ese contrato.
 */
function fetchOk(id = "email-abc-123") {
  return vi.fn<FetchLike>().mockImplementation((url, init) => {
    if (url === RESEND_BATCH_ENDPOINT) {
      const enviados = JSON.parse(init.body) as unknown[];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: enviados.map((_e, i) => ({ id: `${id}-${i}` })),
        }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ id }) });
  });
}

describe("services/correo — fail-fast de config", () => {
  // correo.factory.001 — sin apiKey ⇒ error claro al enviar, SIN volcar valor alguno
  it("hace fail-fast con mensaje claro si falta RESEND_API_KEY al enviar, sin incluir secretos", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const correo = crearCorreoService({ apiKey: undefined, fetchImpl });

    await expect(
      correo.enviarCorreo({
        from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
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
      from: "Tienda ARMY · vía Sortéatelo <no-reply@sorteatelo.cl>",
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
      from: "Tienda ARMY · vía Sortéatelo <no-reply@sorteatelo.cl>",
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
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
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

  // correo.envio.003 — los tres campos que F02 agrega al input (ADR-0027 §6). `headers` es lo que
  // en F05 va a llevar List-Unsubscribe; `tags` alimenta las métricas de Resend; la
  // `Idempotency-Key` viaja como CABECERA (no en el body) y es la 2ª línea de defensa contra el
  // duplicado — la 1ª y definitiva es el ledger.
  it("manda headers, tags y la Idempotency-Key en el lugar que corresponde (cabecera vs body)", async () => {
    const fetchImpl = fetchOk();
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    await correo.enviarCorreo({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: "fan@example.cl",
      subject: "s",
      text: "t",
      headers: { "List-Unsubscribe": "<https://app.test/baja/tok>" },
      tags: [{ name: "tipo", value: "CONFIRMACION_COMPRA" }],
      idempotencyKey: "confirmacion-compra/ord_1",
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers["Idempotency-Key"]).toBe("confirmacion-compra/ord_1");

    const enviado = JSON.parse(init.body) as Record<string, unknown>;
    expect(enviado.headers).toEqual({
      "List-Unsubscribe": "<https://app.test/baja/tok>",
    });
    expect(enviado.tags).toEqual([
      { name: "tipo", value: "CONFIRMACION_COMPRA" },
    ]);
    // La Idempotency-Key es de transporte: no se filtra al body del correo.
    expect(enviado).not.toHaveProperty("idempotencyKey");
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
        from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
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
        from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
        to: "fan@example.cl",
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/id/);
  });
});

describe("services/correo — enviarLote (POST /emails/batch, F02/ADR-0027 §6)", () => {
  // correo.lote.001 — el motivo de existir del batch: 250 destinatarios son 3 llamadas, no 250
  // (el rate limit de Resend es 10 req/s). Y los ids tienen que volver ALINEADOS con los inputs:
  // el drenado escribe `proveedorId` fila por fila, así que un corrimiento le pondría a un correo
  // el id de otro.
  it("chunkea de a 100 y devuelve los ids alineados con el orden de los inputs", async () => {
    let chunk = 0;
    const fetchImpl = vi.fn<FetchLike>().mockImplementation((_url, init) => {
      const enviados = JSON.parse(init.body) as { to: string }[];
      const base = chunk++ * 1000;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: enviados.map((_e, i) => ({ id: `email-${base + i}` })),
        }),
      });
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const inputs = Array.from({ length: 250 }, (_v, i) => ({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: `fan${i}@example.cl`,
      subject: "s",
      text: "t",
    }));

    const { ids } = await correo.enviarLote(inputs);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]![0]).toBe(RESEND_BATCH_ENDPOINT);
    const tamanos = fetchImpl.mock.calls.map(
      (c) => (JSON.parse(c[1].body) as unknown[]).length,
    );
    expect(tamanos).toEqual([100, 100, 50]);

    expect(ids).toHaveLength(250);
    // El id 100 sale del SEGUNDO chunk: si el mapeo se hiciera por chunk sin concatenar en orden,
    // acá saldría `email-0`.
    expect(ids[0]).toBe("email-0");
    expect(ids[100]).toBe("email-1000");
    expect(ids[249]).toBe("email-2049");
  });

  // correo.lote.003 — cada chunk necesita su PROPIA Idempotency-Key: con una sola clave para todo
  // el lote, Resend consideraría el 2º chunk un reintento del 1º (ventana 24 h) y lo devolvería
  // cacheado ⇒ 100 correos que nunca salen y 100 ids repetidos escritos en el ledger.
  it("deriva una Idempotency-Key distinta por chunk a partir de la clave del lote", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockImplementation((_url, init) => {
      const enviados = JSON.parse(init.body) as unknown[];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: enviados.map(() => ({ id: "email-x" })) }),
      });
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const inputs = Array.from({ length: 150 }, (_v, i) => ({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: `fan${i}@example.cl`,
      subject: "s",
      text: "t",
    }));

    await correo.enviarLote(inputs, { idempotencyKey: "recordatorio/raf_1" });

    const claves = fetchImpl.mock.calls.map((c) => c[1].headers["Idempotency-Key"]);
    expect(claves).toEqual(["recordatorio/raf_1/0", "recordatorio/raf_1/1"]);
  });

  // correo.lote.004 — el caso que casi rompe I2 (finding del backend-reviewer). Un chunk puede
  // responder 2xx y traer MENOS ids de los que se pidieron. Si eso se aceptara en silencio, el
  // array de ids quedaría corrido y el drenado le escribiría a una fila el `proveedorId` de OTRA;
  // peor, las filas del final quedarían PENDIENTE sin error y se reenviarían ⇒ correo duplicado.
  // El adapter garantiza el contrato: o el chunk viene alineado, o es error.
  it("un chunk 2xx con menos ids que correos es un error, no un lote corto en silencio", async () => {
    let llamada = 0;
    const fetchImpl = vi.fn<FetchLike>().mockImplementation((_url, init) => {
      const enviados = JSON.parse(init.body) as unknown[];
      if (llamada++ === 0) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: enviados.map((_e, i) => ({ id: `email-${i}` })),
          }),
        });
      }
      // 2xx pero el proveedor devolvió 3 ids para 50 correos.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "a" }, { id: "b" }, { id: "c" }],
        }),
      });
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const inputs = Array.from({ length: 150 }, (_v, i) => ({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: `fan${i}@example.cl`,
      subject: "s",
      text: "t",
    }));

    const err = (await correo
      .enviarLote(inputs)
      .catch((e: unknown) => e)) as CorreoError;

    expect(err).toBeInstanceOf(CorreoError);
    // Solo los ids del chunk COMPLETO viajan: los 3 sueltos del chunk roto no se pueden asignar
    // a nadie sin adivinar, y adivinar es justo lo que produce el cruce de proveedorId.
    expect(err.idsParciales).toHaveLength(100);
    expect(err.esCuota).toBe(false);
  });

  // correo.lote.005 — mismo contrato para el item sin `id`: un hueco EN MEDIO del array corre
  // todas las posiciones siguientes, que es la variante silenciosa y más difícil de detectar.
  it("un item sin id en medio del lote también es error (no se compacta el array)", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "a" }, {}, { id: "c" }] }),
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const inputs = Array.from({ length: 3 }, (_v, i) => ({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: `fan${i}@example.cl`,
      subject: "s",
      text: "t",
    }));

    await expect(correo.enviarLote(inputs)).rejects.toBeInstanceOf(CorreoError);
  });
});

describe("services/correo — clasificación de errores (I9: cuota ≠ fallo)", () => {
  // correo.lote.002 — el caso NORMAL bajo Resend Free (100/día): el primer chunk sale y el
  // segundo se topa con la cuota. Dos cosas tienen que sobrevivir al error, o se rompe un
  // invariante cada una: (a) `esCuota` ⇒ el drenado NO quema intentos (I9); (b) los ids YA
  // enviados ⇒ el drenado confirma esas filas y jamás las reenvía (I2 — un throw pelado las
  // dejaría PENDIENTE y el correo saldría dos veces).
  it("un 429 a mitad de lote lanza un error marcado como cuota y con los ids ya enviados", async () => {
    let llamada = 0;
    const fetchImpl = vi.fn<FetchLike>().mockImplementation((_url, init) => {
      const enviados = JSON.parse(init.body) as unknown[];
      if (llamada++ === 0) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: enviados.map((_e, i) => ({ id: `email-${i}` })),
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 429,
        json: async () => ({ message: "Daily quota exceeded" }),
      });
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const inputs = Array.from({ length: 150 }, (_v, i) => ({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: `fan${i}@example.cl`,
      subject: "s",
      text: "t",
    }));

    const err = await correo.enviarLote(inputs).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CorreoError);
    const fallo = err as CorreoError;
    expect(fallo.esCuota).toBe(true);
    expect(fallo.status).toBe(429);
    expect(fallo.idsParciales).toHaveLength(100);
    expect(fallo.idsParciales[0]).toBe("email-0");
    expect(fallo.message).not.toContain(API_KEY);
  });

  // correo.error.003 — un 5xx NO es cuota: es un fallo real y sí gasta presupuesto de reintentos.
  it("un 500 de Resend NO se marca como cuota (gasta intentos, a diferencia del 429)", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Internal error" }),
    });
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });

    const err = (await correo
      .enviarCorreo({
        from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
        to: "fan@example.cl",
        subject: "s",
        text: "t",
      })
      .catch((e: unknown) => e)) as CorreoError;

    expect(err).toBeInstanceOf(CorreoError);
    expect(err.esCuota).toBe(false);
    expect(err.status).toBe(500);
  });
});

describe("services/correo — timeout del fetch (ADR-0027 §6)", () => {
  // correo.timeout.001 — sin timeout, un Resend colgado se lleva puesta la corrida entera del cron
  // (Vercel corta la función a los 60 s y las filas ya reclamadas quedan con el intento gastado y
  // sin correo). El test usa un timeout chico para no dormir 8 s, y verifica el comportamiento
  // REAL: el `AbortSignal` que viaja en el fetch se dispara y el error resultante es un
  // `CorreoError` legible (no una DOMException cruda que el drenado no sabría clasificar).
  it("aborta el fetch cuando el proveedor no responde y lo reporta como CorreoError", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          // Se rechaza con un Error propio (y no con `signal.reason`, que es una DOMException):
          // lo que importa acá es que el corte llegue, no de qué clase es el objeto del proveedor.
          init.signal?.addEventListener("abort", () =>
            reject(new Error("The operation was aborted due to timeout")),
          );
        }),
    );
    const correo = crearCorreoService({
      apiKey: API_KEY,
      fetchImpl,
      timeoutMs: 20,
    });

    const err = (await correo
      .enviarCorreo({
        from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
        to: "fan@example.cl",
        subject: "s",
        text: "t",
      })
      .catch((e: unknown) => e)) as CorreoError;

    expect(err).toBeInstanceOf(CorreoError);
    expect(err.message).toMatch(/no respondió/i);
    // Un timeout NO es cuota: es un fallo real y gasta presupuesto de reintentos (I9 al revés).
    expect(err.esCuota).toBe(false);
    expect(err.message).not.toContain(API_KEY);
  });

  // correo.timeout.002 — el default es el que fija ADR-0027 §6, y el signal llega al fetch
  // (sin esto, el test de arriba pasaría igual con un timeout que nadie cablea en producción).
  it("usa 8 s por defecto y le pasa el signal a cada request", async () => {
    expect(TIMEOUT_MS).toBe(8_000);

    const fetchImpl = fetchOk();
    const correo = crearCorreoService({ apiKey: API_KEY, fetchImpl });
    await correo.enviarCorreo({
      from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
      to: "fan@example.cl",
      subject: "s",
      text: "t",
    });
    await correo.enviarLote([
      {
        from: "T · vía Sortéatelo <no-reply@sorteatelo.cl>",
        to: "fan@example.cl",
        subject: "s",
        text: "t",
      },
    ]);

    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal?.aborted).toBe(false);
    }
  });
});

/**
 * Test de INTEGRACIÓN real contra Resend (D10/S7). OPT-IN doble: solo corre si `RESEND_API_KEY`
 * está en el entorno Y el flag explícito `RESEND_INTEGRATION=1` está presente — así un `vitest run`
 * normal NO gasta cuota ni manda correos. Verifica que Resend devuelve un id. El feature-implementer
 * lo corre UNA vez para probar el circuito real.
 *
 * Destinatario: el correo DE LA CUENTA Resend (`nikochaima72@gmail.com`). **El comentario que había
 * acá quedó stale y se corrigió en F07**: decía que `no-reply@sorteatelo.cl` era «el remitente de
 * prueba sin dominio verificado» y que el destinatario estaba limitado «hasta verificar un dominio
 * (decisión abierta #4)». Las dos cosas ya no son ciertas — `sorteatelo.cl` está VERIFICADO en
 * Resend (ADR-0014/0015) y la decisión #4 se cerró. El destinatario se deja igualmente en el correo
 * del dueño de la cuenta porque este test manda un correo DE VERDAD: apuntarlo a un tercero sería
 * spamear a alguien desde una corrida de tests.
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
        from: "Sortéatelo (prueba) · vía Sortéatelo <no-reply@sorteatelo.cl>",
        // El email del dueño de la cuenta Resend: único destinatario permitido con el
        // remitente de prueba sin dominio verificado (ver el header del describe).
        to: "nikochaima72@gmail.com",
        subject: "Prueba de integración — correo transaccional (F04)",
        text:
          "Este es un envío de prueba del service de correo de Sortéatelo (F04). " +
          "Si lo recibiste, el circuito Resend real funciona.",
        html:
          "<p>Este es un envío de prueba del service de correo de <strong>Sortéatelo</strong> (F04).</p>" +
          "<p>Si lo recibiste, el circuito Resend real funciona.</p>",
      });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
