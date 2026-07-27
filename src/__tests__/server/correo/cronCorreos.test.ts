import { describe, expect, it, vi } from "vitest";

import { manejarCronCorreos } from "~/server/correo/cronCorreos";

/**
 * Tests del NÚCLEO del endpoint de cron (F02, ADR-0027 §4). Sin DB ni red: lo que se prueba es la
 * POLÍTICA del borde — que el gate corra ANTES de cualquier efecto y que un endpoint público que
 * dispara envíos masivos no quede abierto por una env var olvidada.
 */

const SECRETO = "cron_secret_de_prueba_1234567890";

/** Drenado fake: registra si lo llamaron y devuelve un resumen fijo. */
function drenarFake() {
  return vi.fn().mockResolvedValue({
    enviados: 4,
    fallidos: 1,
    sinResolver: 0,
    detenidoPorCuota: false,
  });
}

/**
 * Planificación fake (F06). Va junto al drenado en cada llamada porque el gate protege a los DOS:
 * el paso que ENCOLA recordatorios es tan masivo como el que envía, y un test que solo mirara el
 * drenado dejaría de ver la mitad del efecto.
 */
function planificarFake() {
  return vi.fn().mockResolvedValue({ encolados: 2, retirados: 0 });
}

function req(headers: Record<string, string>, method = "GET") {
  return { method, headers };
}

describe("server/correo/cronCorreos — gate del endpoint (ADR-0027 §4)", () => {
  // correo.cron.001 — sin autorización no se dispara NADA. El gate va antes del efecto: un
  // endpoint que drena la cola de correos de todas las Tiendas no puede ejecutarse y recién
  // después responder 401.
  it("rechaza con 401 una request sin Authorization y no corre el drenado", async () => {
    const drenar = drenarFake();
    const planificar = planificarFake();
    const res = await manejarCronCorreos({
      req: req({}),
      secret: SECRETO,
      planificar,
      drenar,
    });

    expect(res.status).toBe(401);
    expect(drenar).not.toHaveBeenCalled();
  });

  // correo.cron.002 — un secreto equivocado (y de otro largo, que es el caso que hace explotar a
  // `timingSafeEqual` si se usa mal) también rechaza sin efecto.
  it("rechaza con 401 un secreto equivocado, incluso de largo distinto", async () => {
    const drenar = drenarFake();
    const planificar = planificarFake();
    for (const valor of ["Bearer otro-secreto", "Bearer x", SECRETO]) {
      const res = await manejarCronCorreos({
        req: req({ authorization: valor }),
        secret: SECRETO,
        planificar,
        drenar,
      });
      expect(res.status, valor).toBe(401);
    }
    expect(drenar).not.toHaveBeenCalled();
  });

  // correo.cron.003 — EL test de fail-closed. Si `CRON_SECRET` no está configurada, el endpoint
  // responde 500 y NO drena. La alternativa —"sin secreto, no valido"— dejaría la cola de correos
  // de todas las Tiendas al alcance de cualquiera que adivine la URL (I6).
  it("sin CRON_SECRET configurada responde 500 y NO drena (fail-closed)", async () => {
    const drenar = drenarFake();
    const planificar = planificarFake();
    const res = await manejarCronCorreos({
      req: req({ authorization: "Bearer lo-que-sea" }),
      secret: undefined,
      planificar,
      drenar,
    });

    expect(res.status).toBe(500);
    expect(drenar).not.toHaveBeenCalled();
  });

  // correo.cron.004 — solo el método que usa Vercel Cron dispara el efecto.
  it("rechaza con 405 un método que no sea GET, aun con el secreto correcto", async () => {
    const drenar = drenarFake();
    const planificar = planificarFake();
    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }, "POST"),
      secret: SECRETO,
      planificar,
      drenar,
    });

    expect(res.status).toBe(405);
    expect(drenar).not.toHaveBeenCalled();
  });
});

describe("server/correo/cronCorreos — corrida autorizada", () => {
  // correo.cron.005 — con el secreto correcto corre y devuelve el resumen, que es lo que queda
  // en los logs de Vercel para saber si la cuota se agotó o si algo quedó FALLIDO.
  it("con el secreto correcto drena y devuelve el resumen de la corrida", async () => {
    const drenar = drenarFake();
    const planificar = planificarFake();
    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }),
      secret: SECRETO,
      planificar,
      drenar,
    });

    expect(res.status).toBe(200);
    expect(drenar).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      enviados: 4,
      fallidos: 1,
      detenidoPorCuota: false,
    });
  });

  // correo.cron.007 — el gate protege también al paso que ENCOLA (F06). Es tan masivo como el que
  // envía —escribe una fila por participante de cada sorteo por cerrar— y un gate que solo cubriera
  // el drenado dejaría medio endpoint abierto.
  it("no planifica nada cuando el gate rechaza", async () => {
    for (const { headers, secret } of [
      { headers: {}, secret: SECRETO },
      { headers: { authorization: "Bearer otro" }, secret: SECRETO },
      { headers: { authorization: `Bearer ${SECRETO}` }, secret: undefined },
    ]) {
      const drenar = drenarFake();
      const planificar = planificarFake();
      await manejarCronCorreos({ req: req(headers), secret, planificar, drenar });
      expect(planificar).not.toHaveBeenCalled();
      expect(drenar).not.toHaveBeenCalled();
    }
  });

  // correo.cron.008 — la corrida autorizada planifica ANTES de drenar: lo que se encola en esta
  // corrida sale en esta misma, en vez de esperar la hora siguiente. Y el resumen reporta las dos
  // mitades, porque un `encolados: 0` con `enviados: 0` no es lo mismo que un `encolados: 40`.
  it("planifica antes de drenar y reporta las dos mitades", async () => {
    const orden: string[] = [];
    const planificar = vi.fn().mockImplementation(async () => {
      orden.push("planificar");
      return { encolados: 2, retirados: 1 };
    });
    const drenar = vi.fn().mockImplementation(async () => {
      orden.push("drenar");
      return { enviados: 2, fallidos: 0, sinResolver: 0, detenidoPorCuota: false };
    });

    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }),
      secret: SECRETO,
      planificar,
      drenar,
    });

    expect(orden).toEqual(["planificar", "drenar"]);
    expect(res.body).toMatchObject({ encolados: 2, retirados: 1, enviados: 2 });
  });

  // correo.cron.006 — si el drenado explota, el endpoint responde 500 SIN volcar el error crudo
  // (podría traer el mensaje del proveedor y, en el peor caso, algo sensible — I6).
  it("un fallo del drenado responde 500 sin filtrar el detalle del error", async () => {
    const drenar = vi
      .fn()
      .mockRejectedValue(new Error("Bearer re_key_super_secreta explotó"));
    const planificar = planificarFake();
    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }),
      secret: SECRETO,
      planificar,
      drenar,
    });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("re_key_super_secreta");
  });
});
