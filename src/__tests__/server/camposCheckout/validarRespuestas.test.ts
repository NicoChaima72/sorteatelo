import { describe, expect, it } from "vitest";

import {
  validarRespuestasDeCheckout,
  type CampoParaValidar,
} from "~/server/domain/camposCheckout/validarRespuestas";

/**
 * Tests del validador de respuestas del checkout (F05,
 * tasks/26-07-25-checkout-campos-configurables). Es el CORAZÓN de I3: la verdad sobre qué se
 * guarda no la pone el cliente sino esta función, corriendo contra la definición VIGENTE que el
 * use case relee dentro de su `$tx`.
 *
 * Es puro a propósito (sin `db`): recibe las definiciones ya leídas y devuelve las filas a
 * congelar. La tenencia —de qué Tienda son esas definiciones— la resuelve el use case (I1), que es
 * quien tiene el `tenantId`; acá no hay forma de seleccionar una Tienda ni de equivocarse de una.
 */

const campo = (parcial: Partial<CampoParaValidar>): CampoParaValidar => ({
  id: "campo-1",
  clave: "telefono",
  etiqueta: "Teléfono",
  tipo: "TEXTO",
  obligatorio: false,
  opciones: [],
  defaultMarcado: false,
  ...parcial,
});

describe("camposCheckout/validarRespuestasDeCheckout — snapshot (F05)", () => {
  // campos.validar.001 — D2: la fila congelada es AUTOCONTENIDA (clave+etiqueta+tipo+valor) y
  //                     apunta a la definición viva por `fieldId`
  it("congela clave, etiqueta, tipo y valor de la definición vigente, con fieldId poblado", () => {
    const filas = validarRespuestasDeCheckout({
      definiciones: [
        campo({
          id: "campo-tel",
          clave: "telefono",
          etiqueta: "Teléfono de contacto",
          tipo: "TEXTO",
          obligatorio: true,
        }),
      ],
      respuestas: [{ clave: "telefono", valor: "  +56 9 1234 5678  " }],
    });

    expect(filas).toEqual([
      {
        fieldId: "campo-tel",
        clave: "telefono",
        // La etiqueta que el Comprador LEYÓ al responder: si mañana el Organizador la renombra,
        // esta fila sigue diciendo lo que decía el form (D5/I4).
        etiqueta: "Teléfono de contacto",
        tipo: "TEXTO",
        valor: "+56 9 1234 5678", // TEXTO ⇒ trim, sin más transformación
      },
    ]);
  });

  // campos.validar.002 — un OPCIONAL sin responder no deja fila: "sin respuesta" ≠ "respuesta vacía"
  it("no crea fila para un campo opcional que el Comprador no respondió", () => {
    const definiciones = [
      campo({ id: "campo-apodo", clave: "apodo", etiqueta: "Apodo" }),
    ];

    // Las tres formas en que un opcional llega sin responder desde el form: ausente del payload,
    // string vacío (TextInput intacto) y `null` (Select limpiado).
    expect(
      validarRespuestasDeCheckout({ definiciones, respuestas: [] }),
    ).toEqual([]);
    expect(
      validarRespuestasDeCheckout({
        definiciones,
        respuestas: [{ clave: "apodo", valor: "   " }],
      }),
    ).toEqual([]);
    expect(
      validarRespuestasDeCheckout({
        definiciones,
        respuestas: [{ clave: "apodo", valor: null }],
      }),
    ).toEqual([]);
  });

  // campos.validar.003 — obligatorio sin responder ⇒ error de dominio que NOMBRA la etiqueta
  it("rechaza con INVALID un obligatorio sin responder, nombrando el campo", () => {
    const definiciones = [
      campo({
        id: "campo-tel",
        clave: "telefono",
        etiqueta: "Teléfono de contacto",
        obligatorio: true,
      }),
    ];

    // El Comprador SÍ tiene el campo en pantalla (mandó su clave) y lo dejó vacío ⇒ el mensaje
    // llega tal cual a la notificación (runDomain → TRPCError) y tiene que decirle QUÉ campo le
    // falta, no "input inválido". Vacío es tanto `""` como el `null` de un Select deseleccionado.
    for (const valor of ["", null] as const) {
      expect(() =>
        validarRespuestasDeCheckout({
          definiciones,
          respuestas: [{ clave: "telefono", valor }],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "INVALID",
          message: expect.stringContaining("Teléfono de contacto") as string,
        }) as unknown as Error,
      );
    }

    // Caso DISTINTO (nit N2 del backend-reviewer): la clave no vino en el payload ⇒ el cliente ni
    // sabe que ese campo existe, porque el Organizador lo AGREGÓ con el checkout abierto (el form
    // manda todas las claves que renderizó, incluso vacías). Mandarlo a completar un control que no
    // tiene en pantalla sería cruel: lo que necesita es recargar.
    expect(() =>
      validarRespuestasDeCheckout({ definiciones, respuestas: [] }),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID",
        message: expect.stringContaining("Recarga la página") as string,
      }) as unknown as Error,
    );
  });
});

describe("camposCheckout/validarRespuestasDeCheckout — por tipo (F05/D3)", () => {
  /** Atajo: valida UNA respuesta contra UNA definición y devuelve el valor canónico congelado. */
  const canonico = (
    definicion: Partial<CampoParaValidar>,
    valor: string | number | boolean | null,
  ) =>
    validarRespuestasDeCheckout({
      definiciones: [campo({ clave: "x", ...definicion })],
      respuestas: [{ clave: "x", valor }],
    })[0]?.valor;

  // campos.validar.004 — TEXTO: trim y tope de largo (D3: 1..200)
  it("TEXTO acepta hasta 200 caracteres y rechaza el que se pasa", () => {
    expect(canonico({ tipo: "TEXTO" }, "a".repeat(200))).toBe("a".repeat(200));
    expect(() => canonico({ tipo: "TEXTO" }, "a".repeat(201))).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );
    // El tope se mide DESPUÉS del trim: 200 caracteres rodeados de espacios son 200 caracteres.
    expect(canonico({ tipo: "TEXTO" }, `  ${"a".repeat(200)}  `)).toBe(
      "a".repeat(200),
    );
  });

  // campos.validar.005 — TELEFONO: formato LAXO al entrar, valor NORMALIZADO al congelar (D3)
  it("TELEFONO acepta separadores y congela solo los dígitos (con el + si venía)", () => {
    // Lo que un chileno escribe de verdad, en todas sus formas: todas valen y todas terminan en el
    // MISMO valor canónico, que es lo que hace comparable la columna del CSV (D9).
    expect(canonico({ tipo: "TELEFONO" }, "+56 9 1234 5678")).toBe(
      "+56912345678",
    );
    expect(canonico({ tipo: "TELEFONO" }, "+56912345678")).toBe("+56912345678");
    expect(canonico({ tipo: "TELEFONO" }, "(9) 1234-5678")).toBe("912345678");
    expect(canonico({ tipo: "TELEFONO" }, "9.1234.5678")).toBe("912345678");

    // Letras ⇒ no es un teléfono, por laxo que sea el formato.
    expect(() => canonico({ tipo: "TELEFONO" }, "llámame")).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );
    // Largo acotado por los dos lados (D3): ni 4 dígitos ni un número de 20.
    expect(() => canonico({ tipo: "TELEFONO" }, "1234")).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );
    expect(() => canonico({ tipo: "TELEFONO" }, "1".repeat(20))).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );
    // El `+` solo tiene sentido ADELANTE: en el medio es un typo, no un prefijo internacional.
    expect(() => canonico({ tipo: "TELEFONO" }, "56+912345678")).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );
  });

  // campos.validar.006 — NUMERO: entero en rango; llega como `number` O como string (NumberInput
  //                     emite string mientras se escribe) y se congela en base 10 sin separadores
  it("NUMERO acepta el entero venga como número o como texto, y guarda el 0", () => {
    expect(canonico({ tipo: "NUMERO" }, 42)).toBe("42");
    expect(canonico({ tipo: "NUMERO" }, "42")).toBe("42");
    // El 0 es una RESPUESTA, no un hueco (misma guarda que el espejo de cliente, campos.form.003).
    expect(canonico({ tipo: "NUMERO" }, 0)).toBe("0");

    // El techo es alto A PROPÓSITO (nit N3 del backend-reviewer): un tope "razonable" tipo 1.000.000
    // sería una decisión de producto encubierta que vetaría datos chilenos reales.
    expect(canonico({ tipo: "NUMERO" }, "8320000")).toBe("8320000"); // código postal
    expect(canonico({ tipo: "NUMERO" }, "12345678")).toBe("12345678"); // RUT sin DV

    for (const invalido of [
      1.5,
      "1.5",
      "abc",
      "12abc",
      "0x10", // `Number()` lo entiende; el input jamás lo emite
      "1e3",
      -5, // un negativo en un checkout es un typo, no un dato
      10 ** 16, // más de 15 dígitos
    ]) {
      expect(() => canonico({ tipo: "NUMERO" }, invalido)).toThrowError(
        expect.objectContaining({ code: "INVALID" }) as unknown as Error,
      );
    }
  });

  // campos.validar.007 — SELECT: pertenencia ESTRICTA a las opciones VIGENTES (D3/I3)
  it("SELECT solo acepta una de sus opciones vigentes, sin inventar equivalencias", () => {
    const select = { tipo: "SELECT" as const, opciones: ["S", "M", "L"] };

    expect(canonico(select, "M")).toBe("M");
    // El trim del transporte sí (un espacio no cambia la elección)...
    expect(canonico(select, "  M  ")).toBe("M");

    // ...pero NADA más: una opción que no está no existe, y "m" no es "M". Adivinar acá (case
    // insensitive, parecidos) guardaría un valor que el Organizador nunca ofreció.
    for (const fuera of ["XL", "m", "S/M"]) {
      expect(() => canonico(select, fuera)).toThrowError(
        expect.objectContaining({ code: "INVALID" }) as unknown as Error,
      );
    }
  });

  // campos.validar.008 — CHECKBOX: valor canónico "true"/"false", nunca humanizado (Opción A del
  //                     schema: el "Sí"/"No" es cosa de la UI y del CSV)
  it("CHECKBOX congela el booleano como 'true'/'false' y no acepta otra cosa", () => {
    expect(canonico({ tipo: "CHECKBOX" }, true)).toBe("true");
    expect(canonico({ tipo: "CHECKBOX" }, false)).toBe("false");

    // Un Checkbox de Mantine emite booleanos y nada más: un "true" de texto es un cliente inventado.
    for (const raro of ["true", "sí", 1]) {
      expect(() => canonico({ tipo: "CHECKBOX" }, raro)).toThrowError(
        expect.objectContaining({ code: "INVALID" }) as unknown as Error,
      );
    }
  });

  // campos.validar.009 — D4/I5: un CHECKBOX que el input NO trae se MATERIALIZA con su default;
  //                     su respuesta es un hecho, no algo que pueda faltar
  it("CHECKBOX ausente del payload se materializa con el default del Organizador", () => {
    const definiciones = [
      campo({
        id: "campo-regalo",
        clave: "regalo",
        etiqueta: "Envolver para regalo",
        tipo: "CHECKBOX",
        defaultMarcado: true,
      }),
      campo({
        id: "campo-newsletter",
        clave: "newsletter",
        etiqueta: "Quiero novedades",
        tipo: "CHECKBOX",
        defaultMarcado: false,
      }),
    ];

    // Payload VACÍO: ninguna de las dos casillas viajó y las dos quedan igual guardadas.
    expect(
      validarRespuestasDeCheckout({ definiciones, respuestas: [] }),
    ).toEqual([
      {
        fieldId: "campo-regalo",
        clave: "regalo",
        etiqueta: "Envolver para regalo",
        tipo: "CHECKBOX",
        valor: "true",
      },
      {
        fieldId: "campo-newsletter",
        clave: "newsletter",
        etiqueta: "Quiero novedades",
        tipo: "CHECKBOX",
        valor: "false",
      },
    ]);
  });
});

describe("camposCheckout/validarRespuestasDeCheckout — claves (F05/I3)", () => {
  // campos.validar.010 — una clave que no está entre las definiciones VIGENTES se RECHAZA; y un
  //                     campo INACTIVO es exactamente ese caso (el use case solo lee los activos)
  it("rechaza una respuesta cuya clave no es de un campo activo de la Tienda", () => {
    const definiciones = [campo({ clave: "telefono" })];

    // Clave inventada por el cliente.
    expect(() =>
      validarRespuestasDeCheckout({
        definiciones,
        respuestas: [{ clave: "rut", valor: "11111111-1" }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );

    // Clave de un campo que el Organizador DESACTIVÓ mientras el Comprador tenía el form abierto:
    // desde acá es indistinguible de la anterior, y esa es justamente la propiedad (D5/I3) — la
    // definición vigente manda, no lo que el cliente tenía renderizado.
    expect(() =>
      validarRespuestasDeCheckout({
        definiciones,
        respuestas: [
          { clave: "telefono", valor: "912345678" },
          { clave: "campo_desactivado", valor: "algo" },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID" }) as unknown as Error,
    );
  });

  // campos.validar.011 — I9: una Tienda sin campos no congela nada (y el payload vacío es lo normal)
  it("una Tienda sin campos configurados no produce filas", () => {
    expect(
      validarRespuestasDeCheckout({ definiciones: [], respuestas: [] }),
    ).toEqual([]);
  });
});
