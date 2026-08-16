import { describe, expect, it } from "vitest";

import {
  construirUrlRetorno,
  destinoRetornoDesdePost,
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

/**
 * Puente POST→GET del retorno (incidente 2026-08-16): Flow devuelve al Comprador con un POST
 * (auto-submit, `token` en el body urlencoded), no con `?token=`. Sin el puente, TODO comprador
 * real caía en la fase `sin_token` («No encontramos tu compra») con su pago/ticket/correo
 * perfectos. El destino del 303 lo decide este núcleo puro.
 */
describe("server/pago/urlRetorno — destinoRetornoDesdePost", () => {
  // checkout.urlretorno.post.001 — el shape REAL del form de Flow ⇒ redirige con el token
  it("extrae el token del body urlencoded real de Flow", () => {
    expect(
      destinoRetornoDesdePost("token=E539F5A2AC2081CF4068F3F49208B4CFAEC071CO"),
    ).toBe("/checkout/retorno?token=E539F5A2AC2081CF4068F3F49208B4CFAEC071CO");
  });

  // checkout.urlretorno.post.002 — body con campos extra: el token igual se recupera
  it("recupera el token aunque el body traiga otros campos", () => {
    expect(destinoRetornoDesdePost("otro=x&token=ABC123&mas=y")).toBe(
      "/checkout/retorno?token=ABC123",
    );
  });

  // checkout.urlretorno.post.003 — sin token legible ⇒ el path pelado (fase sin_token, degradación honesta)
  it("sin token legible devuelve el path pelado", () => {
    expect(destinoRetornoDesdePost(null)).toBe("/checkout/retorno");
    expect(destinoRetornoDesdePost(undefined)).toBe("/checkout/retorno");
    expect(destinoRetornoDesdePost("")).toBe("/checkout/retorno");
    expect(destinoRetornoDesdePost("otro=x")).toBe("/checkout/retorno");
    expect(destinoRetornoDesdePost("token=")).toBe("/checkout/retorno");
    expect(destinoRetornoDesdePost("token=   ")).toBe("/checkout/retorno");
  });

  // checkout.urlretorno.post.004 — un "token" absurdamente largo NO se refleja en el redirect (abuso)
  it("descarta tokens más largos que el techo (no refleja basura en la URL)", () => {
    expect(destinoRetornoDesdePost(`token=${"A".repeat(201)}`)).toBe(
      "/checkout/retorno",
    );
  });

  // checkout.urlretorno.post.005 — caracteres raros quedan URL-encodeados, nunca crudos en el destino
  it("URL-encodea el token al re-emitirlo", () => {
    expect(destinoRetornoDesdePost("token=a%26b%3Dc")).toBe(
      `/checkout/retorno?token=${encodeURIComponent("a&b=c")}`,
    );
  });
});
