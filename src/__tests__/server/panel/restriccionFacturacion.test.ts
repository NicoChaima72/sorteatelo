import { describe, expect, it } from "vitest";

import {
  decidirRestriccionFacturacion,
  RUTA_PLAN,
} from "~/server/panel/restriccionFacturacion";

/**
 * Tests del modo RESTRINGIDO del panel (F05/D4): con la Tienda en pausa por facturación, la única
 * página que responde es «Plan» — la que tiene el `paymentLink` para regularizar. El resto redirige.
 *
 * Es una decisión PURA y va SEPARADA de `decidirAccesoAdmin` a propósito: esa resuelve autorización
 * (host + sesión + membresía) y esta resuelve estado COMERCIAL. El orden importa y lo fija el borde —
 * primero se autoriza, y solo después se le cuenta a un miembro legítimo que su tienda está en pausa.
 */

describe("panel/decidirRestriccionFacturacion", () => {
  // panel.restriccion.001 — en pausa, cualquier ruta del panel cae en la página Plan
  it("con la tienda en pausa, las rutas del panel redirigen a Plan", () => {
    for (const ruta of [
      "/admin",
      "/admin/productos",
      "/admin/ventas",
      "/admin/sorteo",
      "/admin/configuracion",
    ]) {
      expect(decidirRestriccionFacturacion({ enPausa: true, ruta })).toEqual({
        destino: RUTA_PLAN,
      });
    }
  });

  // panel.restriccion.002 — la página Plan y sus subrutas SÍ responden (si no, sería un loop)
  it("la página Plan y sus subrutas responden con la tienda en pausa", () => {
    expect(
      decidirRestriccionFacturacion({ enPausa: true, ruta: RUTA_PLAN }),
    ).toBeNull();
    // `/admin/plan/retorno` es la vuelta de Flow tras re-registrar la tarjeta: si redirigiera, el
    // Organizador en pausa no podría cambiar el medio de pago, o sea no podría salir de la pausa.
    expect(
      decidirRestriccionFacturacion({ enPausa: true, ruta: "/admin/plan/retorno" }),
    ).toBeNull();
  });

  // panel.restriccion.003 — el permiso es por SEGMENTO, no por prefijo de texto
  it("una ruta que solo EMPIEZA con las letras de plan no queda liberada", () => {
    // Sin este cuidado, `startsWith("/admin/plan")` abriría de par en par cualquier ruta futura que
    // arrancara igual — la restricción se volvería una coladera por un descuido de naming.
    expect(
      decidirRestriccionFacturacion({ enPausa: true, ruta: "/admin/planificacion" }),
    ).toEqual({ destino: RUTA_PLAN });
  });

  // panel.restriccion.004 — sin pausa no hay restricción: cero regresión para la tienda al día
  it("sin pausa ninguna ruta se restringe", () => {
    for (const ruta of ["/admin", "/admin/productos", RUTA_PLAN]) {
      expect(decidirRestriccionFacturacion({ enPausa: false, ruta })).toBeNull();
    }
  });
});
