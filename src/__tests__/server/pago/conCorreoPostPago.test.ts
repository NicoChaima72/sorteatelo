import { describe, expect, it, vi } from "vitest";

import type {
  ConfirmarPagoInput,
  TransicionPago,
} from "~/server/domain/pago/confirmarPagoDeOrden";
import { conCorreoPostPago } from "~/server/pago/conCorreoPostPago";
import type { ConfirmarPagoFn } from "~/server/pago/webhookFlow";

/**
 * Tests del decorator POST-COMMIT del correo (F04/D1/D2). Verifican la POLÍTICA "solo en la
 * transición a PAGADO, una vez, y jamás compromete la venta": el envío se dispara exactamente
 * cuando `transicion === "PAGADO" && !yaProcesado`, y un fallo del envío es log-and-continue
 * (el resultado del confirmarPago se devuelve intacto ⇒ el webhook responde 200). El confirmarPago
 * y el envío se inyectan como fakes: acá no hay DB (el circuito real con DB se cubre en el test
 * DB-backed del webhook + correo que falla).
 */

function confirmarPagoFake(
  ret: { yaProcesado: boolean; transicion: TransicionPago },
): ConfirmarPagoFn {
  return vi
    .fn<(input: ConfirmarPagoInput) => Promise<typeof ret>>()
    .mockResolvedValue(ret);
}

const INPUT: ConfirmarPagoInput = {
  commerceOrder: "order-42",
  resultado: "PAGADO",
};

describe("pago/conCorreoPostPago — decorator post-commit del correo (D1/D2)", () => {
  // correo.decorator.001 — PAGADO nuevo ⇒ envía una vez con el orderId de la orden confirmada
  it("dispara el envío exactamente una vez en la transición PENDIENTE→PAGADO, con el orderId confirmado", async () => {
    const enviar = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue();
    const decorado = conCorreoPostPago(
      confirmarPagoFake({ yaProcesado: false, transicion: "PAGADO" }),
      enviar,
    );

    const res = await decorado(INPUT);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith("order-42"); // el orderId autoritativo (server-side)
    expect(res).toEqual({ yaProcesado: false, transicion: "PAGADO" });
  });

  // correo.decorator.002 — replay (yaProcesado) ⇒ NO reenvía
  it("un replay del webhook (yaProcesado) NO reenvía el correo", async () => {
    const enviar = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue();
    const decorado = conCorreoPostPago(
      confirmarPagoFake({ yaProcesado: true, transicion: "NINGUNA" }),
      enviar,
    );

    await decorado(INPUT);

    expect(enviar).not.toHaveBeenCalled();
  });

  // correo.decorator.003 — transición a FALLIDO ⇒ NO envía
  it("una transición a FALLIDO NO envía correo", async () => {
    const enviar = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue();
    const decorado = conCorreoPostPago(
      confirmarPagoFake({ yaProcesado: false, transicion: "FALLIDO" }),
      enviar,
    );

    await decorado({ ...INPUT, resultado: "FALLIDO" });

    expect(enviar).not.toHaveBeenCalled();
  });

  // correo.decorator.004 — el envío falla ASYNC ⇒ el resultado se devuelve intacto y la promesa
  // rechazada no queda sin manejar (F03: el envío es fire-and-forget; el log del fallo async es de
  // QUIEN ENVÍA — enviarConfirmacionDeCompra — no del decorator, y el cron del ledger reintenta).
  it("si el envío falla, NO propaga el error: devuelve el resultado del confirmarPago (⇒ webhook 200)", async () => {
    const tareas: Promise<unknown>[] = [];
    const enviar = vi
      .fn<(orderId: string) => Promise<void>>()
      .mockRejectedValue(new Error("Resend respondió 500."));
    const decorado = conCorreoPostPago(
      confirmarPagoFake({ yaProcesado: false, transicion: "PAGADO" }),
      enviar,
      (tarea) => tareas.push(tarea),
    );

    // NO lanza: el fallo del correo no compromete la confirmación (I1).
    const res = await decorado(INPUT);

    expect(res).toEqual({ yaProcesado: false, transicion: "PAGADO" });
    // La tarea SÍ se programó (con el orderId autoritativo) y su rechazo es observable por el
    // recolector del seam — no por el webhook, que ya respondió.
    expect(tareas).toHaveLength(1);
    expect(enviar).toHaveBeenCalledWith("order-42");
    await expect(tareas[0]).rejects.toThrow("500");
  });

  // correo.decorator.005 — el callback rompe SÍNCRONO ⇒ ese fallo sí lo loguea el decorator (I3:
  // orderId no es secreto; jamás token ni email) y el ack a Flow sale igual.
  it("si programar el envío rompe síncrono, loguea sin secretos y el webhook responde igual", async () => {
    const errores: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errores.push(args.map(String).join(" "));
      });

    const enviar = vi.fn<(orderId: string) => Promise<void>>(() => {
      throw new Error("rompió antes de devolver la promesa");
    });
    const decorado = conCorreoPostPago(
      confirmarPagoFake({ yaProcesado: false, transicion: "PAGADO" }),
      enviar,
    );

    const res = await decorado(INPUT);
    spy.mockRestore();

    expect(res).toEqual({ yaProcesado: false, transicion: "PAGADO" });
    const salida = errores.join("\n");
    expect(salida).toContain("order-42");
    expect(salida).not.toContain("Resend"); // sin detalles del adapter que no vinieron
  });
});
