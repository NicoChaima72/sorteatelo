import { describe, expect, it } from "vitest";

import {
  construirUrlRetorno,
  origenDeRequest,
} from "~/server/pago/urlRetorno";

/**
 * Tests de la derivación de la URL de retorno de Flow (F04/D6). El comprador vuelve de Flow al
 * SUBDOMINIO de su Tienda (`<slug>.<dominio>/checkout/retorno`), no al apex ni a la env global
 * `FLOW_URL_RETURN`. Se deriva del HOST del request (que ya trae el subdominio del tenant) —
 * server-side, sin hardcodear el dominio (nota del usuario) y sin reabrir la decisión #4.
 * El `urlConfirmation` del webhook queda GLOBAL e intacto (no se toca acá).
 */

describe("server/pago/urlRetorno — origenDeRequest", () => {
  // checkout.urlretorno.origen.001 — host de subdominio en dev ⇒ http://<host>
  it("deriva http:// para hosts *.localhost (dev)", () => {
    expect(origenDeRequest({ host: "autora.localhost:3001" })).toBe(
      "http://autora.localhost:3001",
    );
    expect(origenDeRequest({ host: "localhost:3001" })).toBe(
      "http://localhost:3001",
    );
  });

  // checkout.urlretorno.origen.002 — host público sin proxy ⇒ https://
  it("deriva https:// para un host público sin x-forwarded-proto", () => {
    expect(origenDeRequest({ host: "autora.miplataforma.cl" })).toBe(
      "https://autora.miplataforma.cl",
    );
  });

  // checkout.urlretorno.origen.003 — respeta x-forwarded-proto (detrás de proxy/Vercel)
  it("respeta x-forwarded-proto cuando está presente (toma el primero)", () => {
    expect(
      origenDeRequest({
        host: "autora.localhost:3001",
        forwardedProto: "https",
      }),
    ).toBe("https://autora.localhost:3001");
    expect(
      origenDeRequest({
        host: "autora.miplataforma.cl",
        forwardedProto: "https,http",
      }),
    ).toBe("https://autora.miplataforma.cl");
  });

  // checkout.urlretorno.origen.004 — sin host ⇒ null (fail-closed, cae al fallback)
  it("sin host devuelve null", () => {
    expect(origenDeRequest({ host: undefined })).toBeNull();
    expect(origenDeRequest({ host: "" })).toBeNull();
  });
});

describe("server/pago/urlRetorno — construirUrlRetorno", () => {
  // checkout.urlretorno.construir.001 — con origen ⇒ <origen>/checkout/retorno (NO la env global)
  it("con origen construye la URL del subdominio, NO la env global", () => {
    expect(
      construirUrlRetorno(
        "http://autora.localhost:3001",
        "http://localhost:3000/dev/checkout/retorno",
      ),
    ).toBe("http://autora.localhost:3001/checkout/retorno");
  });

  // checkout.urlretorno.construir.002 — sin origen ⇒ cae al fallback (env)
  it("sin origen cae al fallback (env FLOW_URL_RETURN)", () => {
    expect(
      construirUrlRetorno(null, "http://localhost:3000/dev/checkout/retorno"),
    ).toBe("http://localhost:3000/dev/checkout/retorno");
  });

  // checkout.urlretorno.construir.003 — sin origen ni fallback ⇒ undefined (el service hace fail-fast)
  it("sin origen ni fallback devuelve undefined", () => {
    expect(construirUrlRetorno(null, undefined)).toBeUndefined();
  });
});
