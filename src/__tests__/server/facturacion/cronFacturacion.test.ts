import { describe, expect, it, vi } from "vitest";

import { manejarCronFacturacion } from "~/server/facturacion/cronFacturacion";

/**
 * Tests de la POLÍTICA del borde del cron diario de facturación (F09/D11, ADR-0026 + ADR-0027 §4).
 *
 * El endpoint dispara correos a los Pagadores de TODAS las Tiendas, así que el gate se prueba por
 * separado del barrido: método, secreto y —lo que más importa— que **nada corra antes de que el gate
 * pase**. Un cron abierto no es solo ruido: es una superficie para que un tercero le mande correos de
 * cobro a los clientes de la Plataforma.
 */

const SECRET = "secreto-de-cron";
const RESUMEN = { renovaciones: 2, exenciones: 1, enviados: 3, fallidos: 0 };

function req(over: Partial<{ method: string; auth: string }> = {}) {
  return {
    method: over.method ?? "GET",
    headers: { authorization: over.auth ?? `Bearer ${SECRET}` },
  };
}

describe("facturacion/manejarCronFacturacion — el gate del cron diario", () => {
  // facturacion.cronGate.001 — fail-closed: sin CRON_SECRET el endpoint no queda abierto
  it("sin secreto configurado responde 500 y no barre nada", async () => {
    const ejecutar = vi.fn();

    const r = await manejarCronFacturacion({
      req: req(),
      secret: undefined,
      ejecutar,
    });

    expect(r.status).toBe(500);
    // Una env var olvidada no puede convertirse en un disparador público de correos de cobro.
    expect(ejecutar).not.toHaveBeenCalled();
  });

  // facturacion.cronGate.002 — el bearer manda; un secreto ajeno no dispara nada
  it("rechaza sin bearer, con bearer equivocado y con basura", async () => {
    const ejecutar = vi.fn();

    for (const auth of ["", "Bearer otro", "otro", `Basic ${SECRET}`]) {
      const r = await manejarCronFacturacion({
        req: req({ auth }),
        secret: SECRET,
        ejecutar,
      });
      expect(r.status).toBe(401);
    }

    expect(ejecutar).not.toHaveBeenCalled();
  });

  // facturacion.cronGate.003 — solo GET (lo que manda Vercel Cron); un POST curioso no dispara
  it("rechaza cualquier método que no sea GET, aun con el secreto correcto", async () => {
    const ejecutar = vi.fn();

    const r = await manejarCronFacturacion({
      req: req({ method: "POST" }),
      secret: SECRET,
      ejecutar,
    });

    expect(r.status).toBe(405);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  // facturacion.cronGate.004 — el camino feliz devuelve el resumen de la corrida
  it("con método y secreto correctos corre el barrido y responde el resumen", async () => {
    const ejecutar = vi.fn().mockResolvedValue(RESUMEN);

    const r = await manejarCronFacturacion({
      req: req(),
      secret: SECRET,
      ejecutar,
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, ...RESUMEN });
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  // facturacion.cronGate.005 — una corrida que revienta no filtra el detalle al body
  it("si el barrido falla responde 500 sin exponer el error", async () => {
    const ejecutar = vi
      .fn()
      .mockRejectedValue(new Error("password=hunter2 en el DSN"));

    const r = await manejarCronFacturacion({
      req: req(),
      secret: SECRET,
      ejecutar,
    });

    expect(r.status).toBe(500);
    // El detalle va al log del servidor, jamás al body (I7): el mensaje del driver puede arrastrar
    // credenciales o el correo de un Pagador.
    expect(JSON.stringify(r.body)).not.toContain("hunter2");
  });
});
