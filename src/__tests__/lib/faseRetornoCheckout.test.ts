import { describe, expect, it } from "vitest";

import { faseDelRetorno } from "~/lib/faseRetornoCheckout";

/**
 * Qué está diciendo la pantalla de retorno del checkout (`src/pages/checkout/retorno.tsx`), como
 * función PURA de las tres cosas que la página observa: si vino un token de Flow en la URL, qué
 * respondió la query pública `estadoOrden` y si el polling ya se detuvo.
 *
 * Se testea acá y no en la página porque el riesgo real de esta lógica es el ORDEN de sus ramas:
 * `detenido` se enciende por dos motivos distintos (la orden se resolvió / se acabó el cap de 2 min)
 * y el token puede faltar, así que una precedencia mal puesta hace que alguien vea un final
 * equivocado — que es exactamente el bug que F03 vino a cerrar.
 */

describe("lib/faseRetornoCheckout — faseDelRetorno", () => {
  // retorno.fase.001 — D6: sin `?token=` no hay ninguna compra de la que hablar
  it("sin token en la URL cae en la fase sin_token", () => {
    expect(faseDelRetorno({ token: undefined, estado: null, detenido: false })).toBe(
      "sin_token",
    );
  });

  // retorno.fase.002 — la celebración: el webhook ya confirmó (I2: la página solo LEE ese resultado)
  it("con el pago confirmado celebra", () => {
    expect(faseDelRetorno({ token: "tok", estado: "PAGADO", detenido: true })).toBe(
      "pagado",
    );
  });

  // retorno.fase.003 — final terminal opuesto: el cobro no pasó (copy sin promesa de correo)
  it("con el pago rechazado cierra en fallido", () => {
    expect(faseDelRetorno({ token: "tok", estado: "FALLIDO", detenido: true })).toBe(
      "fallido",
    );
  });

  // retorno.fase.004 — el cap de 2 min venció sin que el webhook resolviera: se deja de sondear,
  // pero NO es un fracaso (la orden todavía puede confirmarse y la entrega va por correo)
  it("con el polling detenido y la orden sin resolver, avisa el timeout", () => {
    expect(faseDelRetorno({ token: "tok", estado: "PENDIENTE", detenido: true })).toBe(
      "timeout",
    );
  });

  // retorno.fase.005 — mientras el polling sigue vivo, la pantalla espera (sin adelantar un final)
  it("con el polling vivo espera, aunque la orden todavía no se sepa", () => {
    expect(faseDelRetorno({ token: "tok", estado: "PENDIENTE", detenido: false })).toBe(
      "esperando",
    );
    // `null` = la query aún no respondió (o el token es de otra Tienda y la respuesta es neutral).
    expect(faseDelRetorno({ token: "tok", estado: null, detenido: false })).toBe(
      "esperando",
    );
  });

  // retorno.fase.006 — LA precedencia, y la razón de que esto sea una función y no un ternario
  // anidado dentro del componente: `detenido` se enciende igual por el cap de 2 min aunque nunca
  // haya habido token, y decirle «la confirmación está tardando» a quien no trae token es
  // inventarle una compra que no hizo. Sin token gana SIEMPRE, esté el polling como esté.
  it("sin token gana sobre el timeout, aunque el cap de tiempo ya haya vencido", () => {
    expect(faseDelRetorno({ token: undefined, estado: null, detenido: true })).toBe(
      "sin_token",
    );
    // Y ni siquiera un estado en la mano lo cambia: sin token esa lectura no es de nadie.
    expect(faseDelRetorno({ token: undefined, estado: "PAGADO", detenido: true })).toBe(
      "sin_token",
    );
  });
});
