import { describe, expect, it } from "vitest";

import { TIPO_INLINE, validarMensajeInline } from "~/components/storefront/use-inline-edit";

/**
 * Tests de la validación del mensaje inline entrante al EDITOR (Tanda 3 F12/D19). El editor NUNCA confía
 * en el postMessage: verifica origin + shape + `campo` permitido (plano) antes de emitir la mutación, y
 * APLANA el valor a texto plano. Un campo no-plano (runs/anidado) ⇒ ignorado. PURO (sin DOM).
 */

const ORIGEN = "https://demo.localhost:3001";

describe("components/use-inline-edit (F12) — validarMensajeInline", () => {
  // page.inline.001 — mensaje válido de un campo plano ⇒ pasa
  it("acepta un mensaje válido con campo plano y devuelve el valor", () => {
    const r = validarMensajeInline(
      { origin: ORIGEN, data: { tipo: TIPO_INLINE, nodoId: "sec-cat", campo: "titulo", valor: "Mi catálogo" } },
      ORIGEN,
    );
    expect(r).toEqual({ nodoId: "sec-cat", campo: "titulo", valor: "Mi catálogo" });
  });

  // page.inline.002 — origin distinto ⇒ null (I-T5)
  it("descarta un mensaje de otro origin", () => {
    expect(
      validarMensajeInline(
        { origin: "https://evil.example", data: { tipo: TIPO_INLINE, nodoId: "x", campo: "titulo", valor: "hola" } },
        ORIGEN,
      ),
    ).toBeNull();
  });

  // page.inline.003 — campo NO plano (runs/anidado) ⇒ ignorado
  it("ignora un campo fuera de la whitelist de campos planos (runs/anidado)", () => {
    // `bloques` (texto_rico runs), `destacado` (objeto anidado) NO son planos ⇒ null
    expect(
      validarMensajeInline(
        { origin: ORIGEN, data: { tipo: TIPO_INLINE, nodoId: "x", campo: "bloques", valor: "hack" } },
        ORIGEN,
      ),
    ).toBeNull();
    expect(
      validarMensajeInline(
        { origin: ORIGEN, data: { tipo: TIPO_INLINE, nodoId: "x", campo: "destacado", valor: "hack" } },
        ORIGEN,
      ),
    ).toBeNull();
  });

  // page.inline.004 — valor con HTML se aplana a texto plano (I-U1)
  it("aplana un valor con HTML a texto plano", () => {
    const r = validarMensajeInline(
      { origin: ORIGEN, data: { tipo: TIPO_INLINE, nodoId: "x", campo: "titulo", valor: "  <b>Hola</b> <img src=x> mundo  " } },
      ORIGEN,
    );
    expect(r?.valor).toBe("Hola  mundo");
  });

  // page.inline.005 — shape inválido / tipo equivocado ⇒ null
  it("descarta shape inválido o tipo equivocado", () => {
    expect(validarMensajeInline({ origin: ORIGEN, data: { tipo: "otro", nodoId: "x", campo: "titulo", valor: "y" } }, ORIGEN)).toBeNull();
    expect(validarMensajeInline({ origin: ORIGEN, data: { tipo: TIPO_INLINE, nodoId: 42, campo: "titulo", valor: "y" } }, ORIGEN)).toBeNull();
    expect(validarMensajeInline({ origin: ORIGEN, data: null }, ORIGEN)).toBeNull();
  });
});
