import { describe, expect, it } from "vitest";

import { derivarClaveUnica } from "~/server/domain/camposCheckout/_clave";

/**
 * Tests del helper PURO de derivación de `clave` (F02/D7). La clave es la llave estable del
 * snapshot y el encabezado de columna del CSV (D9) — se deriva de la etiqueta al crear y es
 * INMUTABLE después (D5), así que acá se fija su forma de una vez.
 */

describe("camposCheckout/derivarClaveUnica", () => {
  // campos.clave.001 — snake_case sin acentos desde la etiqueta que escribió el Organizador
  it("deriva una clave snake_case sin acentos desde la etiqueta", () => {
    expect(derivarClaveUnica("Teléfono de contacto", new Set())).toBe(
      "telefono_de_contacto",
    );
  });

  // campos.clave.002 — sufijo anti-colisión contra las claves YA tomadas del tenant
  it("desambigua con sufijo numérico cuando la clave ya está tomada", () => {
    expect(derivarClaveUnica("Teléfono", new Set(["telefono"]))).toBe("telefono_2");
    expect(
      derivarClaveUnica("Teléfono", new Set(["telefono", "telefono_2"])),
    ).toBe("telefono_3");
  });

  // campos.clave.003 — la clave NUNCA queda vacía: es la llave del snapshot
  it("cae a una clave de respaldo cuando la etiqueta no deja alfanuméricos", () => {
    expect(derivarClaveUnica("¿?", new Set())).toBe("campo");
    expect(derivarClaveUnica("—— ——", new Set(["campo"]))).toBe("campo_2");
  });

  // campos.clave.004 — separadores repetidos/bordes no ensucian la clave
  it("colapsa separadores y no deja guiones bajos en los bordes", () => {
    expect(derivarClaveUnica("  ¡Talla / Color!  ", new Set())).toBe("talla_color");
  });
});
