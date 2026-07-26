import { describe, expect, it } from "vitest";

import {
  erroresDeCampos,
  respuestasParaEnviar,
  valoresInicialesDeCampos,
} from "~/components/storefront/respuestas-checkout";
import { type CampoDelCheckout } from "~/server/domain/camposCheckout/camposActivos";

/**
 * Tests de los helpers PUROS del checkout dinámico (F04,
 * tasks/26-07-25-checkout-campos-configurables). Son la única lógica testeable de F04: el resto
 * es render Mantine (cubierto por E2E). La VERDAD sobre las respuestas la pone el server dentro
 * de la `$tx` (I3/F05) — esto es el espejo de cliente que hace usable el form, no la validación.
 */

const campo = (parcial: Partial<CampoDelCheckout>): CampoDelCheckout => ({
  clave: "telefono",
  etiqueta: "Teléfono",
  tipo: "TEXTO",
  obligatorio: false,
  placeholder: null,
  textoAyuda: null,
  opciones: [],
  defaultMarcado: false,
  ...parcial,
});

describe("respuestas-checkout — valoresInicialesDeCampos (F04)", () => {
  // campos.form.001 — CHECKBOX arranca con su default (D4: su respuesta SIEMPRE existe); el resto vacío
  it("arranca cada campo en su valor inicial por tipo", () => {
    const valores = valoresInicialesDeCampos([
      campo({ clave: "telefono", tipo: "TELEFONO" }),
      campo({ clave: "edad", tipo: "NUMERO" }),
      campo({ clave: "talla", tipo: "SELECT", opciones: ["S", "M"] }),
      campo({ clave: "regalo", tipo: "CHECKBOX", defaultMarcado: true }),
      campo({ clave: "envoltorio", tipo: "CHECKBOX", defaultMarcado: false }),
    ]);

    expect(valores).toEqual({
      telefono: "",
      edad: "",
      talla: "",
      // D4: el CHECKBOX no arranca vacío — arranca en el default que puso el Organizador, porque
      // su respuesta es un hecho (true/false) desde el primer render, no algo que "falte".
      regalo: true,
      envoltorio: false,
    });
  });
});

describe("respuestas-checkout — erroresDeCampos (F04)", () => {
  // campos.form.002 — obligatorio sin responder ⇒ error en SU clave; el opcional vacío no molesta
  it("marca los obligatorios sin responder y deja pasar los opcionales", () => {
    const campos = [
      campo({ clave: "telefono", tipo: "TELEFONO", obligatorio: true }),
      campo({ clave: "apodo", tipo: "TEXTO", obligatorio: false }),
    ];

    expect(erroresDeCampos(campos, { telefono: "", apodo: "" })).toEqual({
      telefono: expect.any(String) as unknown as string,
    });
    expect(
      erroresDeCampos(campos, { telefono: "+56 9 1234 5678", apodo: "" }),
    ).toEqual({});
  });

  // campos.form.003 — GUARDA del `!valor`: `false` y `0` son RESPUESTAS, no huecos
  it("no confunde un valor falsy con una respuesta faltante", () => {
    // Escribir `if (!valores[clave])` en vez de `estaVacia` es el atajo que rompe D4: dejaría un
    // CHECKBOX desmarcado como "sin responder" (y su respuesta SIEMPRE existe), y un NUMERO con
    // 0 como vacío. `obligatorio: true` en el CHECKBOX no debería llegar nunca —el use case lo
    // normaliza a false (D4/_normalizar)— y justamente por eso el render no puede DEPENDER de eso.
    const campos = [
      campo({ clave: "regalo", tipo: "CHECKBOX", obligatorio: true }),
      campo({ clave: "edad", tipo: "NUMERO", obligatorio: true }),
    ];

    expect(erroresDeCampos(campos, { regalo: false, edad: 0 })).toEqual({});
  });

  // campos.form.004 — I9: una Tienda sin campos no tiene nada que validar ni que inicializar
  it("una Tienda sin campos deja el form exactamente como el de hoy", () => {
    expect(valoresInicialesDeCampos([])).toEqual({});
    expect(erroresDeCampos([], {})).toEqual({});
  });

  // campos.form.005 — F05: un Select LIMPIADO emite `null`, y eso es "sin responder"
  it("trata como vacío el Select que el Comprador limpió", () => {
    const campos = [
      campo({ clave: "talla", tipo: "SELECT", obligatorio: true }),
    ];

    expect(erroresDeCampos(campos, { talla: null })).toEqual({
      talla: expect.any(String) as unknown as string,
    });
  });
});

describe("respuestas-checkout — respuestasParaEnviar (F05)", () => {
  // campos.form.006 — el form guarda por clave, el input viaja como lista {clave, valor}
  it("convierte los valores del form en la lista {clave, valor} que espera el server", () => {
    expect(
      respuestasParaEnviar({
        telefono: "+56 9 1234 5678",
        edad: 30,
        regalo: false,
        apodo: "",
      }),
    ).toEqual([
      { clave: "telefono", valor: "+56 9 1234 5678" },
      { clave: "edad", valor: 30 },
      // `false` y `""` viajan igual: filtrar acá sería que el cliente decida qué es una respuesta,
      // y eso lo decide el server contra la definición vigente (I3). Un CHECKBOX en `false` ES una
      // respuesta (D4); un texto vacío el server lo lee como "sin responder".
      { clave: "regalo", valor: false },
      { clave: "apodo", valor: "" },
    ]);
  });

  // campos.form.007 — I9: sin campos, el payload es el de siempre
  it("sin campos no manda nada", () => {
    expect(respuestasParaEnviar({})).toEqual([]);
  });
});
