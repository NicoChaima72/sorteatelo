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

function req(headers: Record<string, string>, method = "GET") {
  return { method, headers };
}

describe("server/correo/cronCorreos — gate del endpoint (ADR-0027 §4)", () => {
  // correo.cron.001 — sin autorización no se dispara NADA. El gate va antes del efecto: un
  // endpoint que drena la cola de correos de todas las Tiendas no puede ejecutarse y recién
  // después responder 401.
  it("rechaza con 401 una request sin Authorization y no corre el drenado", async () => {
    const drenar = drenarFake();
    const res = await manejarCronCorreos({
      req: req({}),
      secret: SECRETO,
      drenar,
    });

    expect(res.status).toBe(401);
    expect(drenar).not.toHaveBeenCalled();
  });

  // correo.cron.002 — un secreto equivocado (y de otro largo, que es el caso que hace explotar a
  // `timingSafeEqual` si se usa mal) también rechaza sin efecto.
  it("rechaza con 401 un secreto equivocado, incluso de largo distinto", async () => {
    const drenar = drenarFake();
    for (const valor of ["Bearer otro-secreto", "Bearer x", SECRETO]) {
      const res = await manejarCronCorreos({
        req: req({ authorization: valor }),
        secret: SECRETO,
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
    const res = await manejarCronCorreos({
      req: req({ authorization: "Bearer lo-que-sea" }),
      secret: undefined,
      drenar,
    });

    expect(res.status).toBe(500);
    expect(drenar).not.toHaveBeenCalled();
  });

  // correo.cron.004 — solo el método que usa Vercel Cron dispara el efecto.
  it("rechaza con 405 un método que no sea GET, aun con el secreto correcto", async () => {
    const drenar = drenarFake();
    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }, "POST"),
      secret: SECRETO,
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
    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }),
      secret: SECRETO,
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

  // correo.cron.006 — si el drenado explota, el endpoint responde 500 SIN volcar el error crudo
  // (podría traer el mensaje del proveedor y, en el peor caso, algo sensible — I6).
  it("un fallo del drenado responde 500 sin filtrar el detalle del error", async () => {
    const drenar = vi
      .fn()
      .mockRejectedValue(new Error("Bearer re_key_super_secreta explotó"));
    const res = await manejarCronCorreos({
      req: req({ authorization: `Bearer ${SECRETO}` }),
      secret: SECRETO,
      drenar,
    });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("re_key_super_secreta");
  });
});
