import { afterEach, describe, expect, it, vi } from "vitest";

import { type CorreoAEnviar } from "~/server/domain/facturacion/procesarNotificacionSuscripcion";
import { enviarCorreosFacturacion } from "~/server/facturacion/enviarCorreosFacturacion";
import { type CorreoInput, type CorreoService } from "~/server/services/correo";

/**
 * Borde de envío de los 4 correos de facturación (F04, D10/I9): redacta con la plantilla pura y manda
 * por el `CorreoService`. Lo que se prueba es que el mapeo llegue completo al proveedor y que un
 * fallo suelto no arrastre al resto.
 */

/**
 * Fake del `CorreoService`. El mock va como PROPIEDAD y con su firma explícita: así las aserciones
 * leen el `CorreoInput` tipado (y no un método desligado de su objeto — `unbound-method`, precedente
 * de F03). Se castea al service porque acá solo importa `enviarCorreo`.
 */
function fakeCorreo(impl?: (input: CorreoInput) => Promise<{ id: string }>) {
  const enviarCorreo = vi
    .fn<(input: CorreoInput) => Promise<{ id: string }>>()
    .mockImplementation(impl ?? (async () => ({ id: "re_1" })));
  return { correo: { enviarCorreo } as unknown as CorreoService, enviarCorreo };
}

const comprobante: CorreoAEnviar = {
  destinatario: "ana@x.cl",
  datos: {
    tipo: "COMPROBANTE_PAGO",
    nombreTienda: "Tienda de Ana",
    montoBruto: "25000",
  },
};

const regularizada: CorreoAEnviar = {
  destinatario: "ana@x.cl",
  datos: { tipo: "TIENDA_REGULARIZADA", nombreTienda: "Tienda de Ana" },
};

describe("facturacion/enviarCorreosFacturacion", () => {
  // facturacion.correosEnvio.001 — el mapeo al proveedor va completo
  it("manda cada correo al Pagador con from, subject, texto y html", async () => {
    const { correo, enviarCorreo } = fakeCorreo();

    const r = await enviarCorreosFacturacion({ correo, correos: [comprobante] });

    expect(r).toEqual({ enviados: 1, fallidos: 0 });
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    const enviado = enviarCorreo.mock.calls[0]![0];
    expect(enviado.to).toBe("ana@x.cl");
    expect(enviado.from).toContain("no-reply@sorteatelo.cl");
    expect(enviado.subject).toContain("Tienda de Ana");
    expect(enviado.text).toContain("$25.000");
    expect(enviado.html).toBeTruthy();
  });

  // facturacion.correosEnvio.002 — un fallo suelto no se lleva al resto
  it("si un envío falla, los demás igual salen y no propaga el error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let llamada = 0;
    const { correo, enviarCorreo } = fakeCorreo(async () => {
      llamada++;
      if (llamada === 1) throw new Error("resend 429");
      return { id: "re_2" };
    });

    const r = await enviarCorreosFacturacion({
      correo,
      correos: [comprobante, regularizada],
    });

    expect(enviarCorreo).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ enviados: 1, fallidos: 1 });
    expect(error).toHaveBeenCalled();
  });

  // facturacion.correosEnvio.003 — el correo del Pagador no se filtra al log
  it("el log de un fallo no incluye el correo del Pagador", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { correo } = fakeCorreo(async () => {
      throw new Error("resend 500");
    });

    await enviarCorreosFacturacion({ correo, correos: [comprobante] });

    const loguedo = JSON.stringify(error.mock.calls);
    expect(loguedo).not.toContain("ana@x.cl");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
