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

  // correo.decorator.004 — el envío falla ⇒ log-and-continue: el resultado se devuelve intacto
  it("si el envío falla, NO propaga el error: devuelve el resultado del confirmarPago (⇒ webhook 200) y loguea sin secretos", async () => {
    const errores: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errores.push(args.map(String).join(" "));
      });

    const enviar = vi
      .fn<(orderId: string) => Promise<void>>()
      .mockRejectedValue(new Error("Resend respondió 500."));
    const decorado = conCorreoPostPago(
      confirmarPagoFake({ yaProcesado: false, transicion: "PAGADO" }),
      enviar,
    );

    // NO lanza: el fallo del correo no compromete la confirmación (I1).
    const res = await decorado(INPUT);
    spy.mockRestore();

    expect(res).toEqual({ yaProcesado: false, transicion: "PAGADO" });
    // Se logueó el fallo con el orderId (no secreto), sin token ni email del comprador (I3).
    const salida = errores.join("\n");
    expect(salida).toContain("order-42");
    expect(salida).toContain("500");
  });
});
