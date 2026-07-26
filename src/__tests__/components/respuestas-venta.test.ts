import { describe, expect, it } from "vitest";

import { valorDeRespuesta } from "~/components/admin/respuestas-venta";

/**
 * Helper puro que humaniza el valor CANÓNICO de una Respuesta de checkout para el detalle de venta
 * del panel (F06, tasks/26-07-25-checkout-campos-configurables).
 *
 * La columna `valor` guarda lo canónico y NUNCA lo humanizado (Opción A del usuario, F01): quien
 * traduce `"true"` a «Sí» es esta función. Por eso vive acá y no en el server — el CSV (F07) exporta
 * el MISMO dato sin pasar por ella.
 */
describe("components/admin/respuestas-venta — valorDeRespuesta", () => {
  // campos.detalle.001 — CHECKBOX: el Organizador lee «Sí»/«No», no `true`/`false`
  it("traduce el booleano canónico del CHECKBOX a Sí/No", () => {
    expect(valorDeRespuesta({ tipo: "CHECKBOX", valor: "true" })).toBe("Sí");
    expect(valorDeRespuesta({ tipo: "CHECKBOX", valor: "false" })).toBe("No");
    // La función es TOTAL: cualquier cosa que no sea el `"true"` canónico (un `"1"` de un backfill,
    // un `""`) cae en «No» en vez de pintar el crudo. Misma guarda que la del NUMERO de abajo.
    expect(valorDeRespuesta({ tipo: "CHECKBOX", valor: "1" })).toBe("No");
  });

  // campos.detalle.002 — NUMERO: CRUDO, sin separador de miles (decisión del usuario, F06)
  it("muestra el NUMERO crudo, sin separador de miles", () => {
    //   no aplica acá: es-CL usa punto como separador de miles.
    // Los datos que una Tienda pide de verdad con este tipo son IDENTIFICATORIOS: código postal,
    // RUT sin DV, folios — son los mismos ejemplos por los que F05 midió el tope en DÍGITOS. Con
    // separador se leerían como cantidades y habría que desarmar el formato para copiarlos. Mismo
    // criterio que el TELEFONO de abajo: la UI no interpreta un dato identificatorio.
    expect(valorDeRespuesta({ tipo: "NUMERO", valor: "8320000" })).toBe(
      "8320000",
    );
    expect(valorDeRespuesta({ tipo: "NUMERO", valor: "12345678" })).toBe(
      "12345678",
    );
    expect(valorDeRespuesta({ tipo: "NUMERO", valor: "7" })).toBe("7");
  });

  // campos.detalle.003 — los tipos de texto se muestran tal cual: el canónico YA es lo legible
  it("muestra TEXTO, TELEFONO y SELECT sin tocarlos", () => {
    expect(
      valorDeRespuesta({ tipo: "TEXTO", valor: "Depto 402, torre B" }),
    ).toBe("Depto 402, torre B");
    // El teléfono se congeló normalizado (solo dígitos + `+`): NO se re-formatea acá, porque
    // inventar espacios sería adivinar una numeración que el server decidió no interpretar.
    expect(valorDeRespuesta({ tipo: "TELEFONO", valor: "+56912345678" })).toBe(
      "+56912345678",
    );
    expect(valorDeRespuesta({ tipo: "SELECT", valor: "M" })).toBe("M");
  });

  // campos.detalle.004 — guarda: un valor que no es número NO puede pintar «NaN» en el panel
  it("no pinta «NaN» si un NUMERO del snapshot no es parseable", () => {
    // Hoy la guarda es ESTRUCTURAL —no se parsea nada, así que no hay `NaN` posible—, pero el test
    // se queda: el snapshot es una tabla que va a sobrevivir a migraciones y backfills, y este es
    // el invariante que hay que sostener si alguien vuelve a meter un `Number()` en el camino.
    expect(valorDeRespuesta({ tipo: "NUMERO", valor: "ocho" })).toBe("ocho");
  });
});
