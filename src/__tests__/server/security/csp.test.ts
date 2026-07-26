import { describe, expect, it } from "vitest";

import { ORIGENES_EMBED } from "~/lib/pagebuilder/embeds";
import { CSP_HEADER, construirCSP } from "~/server/security/csp";

/**
 * Tests de la CSP (F07/D9, ADR-0018). El header emitido debe contener las directivas de seguridad
 * críticas: `frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self'` y la allowlist EXACTA
 * de `frame-src` (los orígenes de embeds, fuente única con `embeds.ts`). Arranca en Report-Only.
 */
describe("security/csp — construirCSP", () => {
  // page.csp.001 — el header contiene las directivas críticas + la allowlist de frame-src
  it("emite frame-ancestors 'none', object-src 'none', connect-src 'self' y la allowlist de frame-src", () => {
    const csp = construirCSP({ esDev: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    // frame-src incluye 'self' + cada origen de embed EXACTO.
    for (const origen of ORIGENES_EMBED) {
      expect(csp).toContain(origen);
    }
    expect(csp).toContain("frame-src 'self' https://www.youtube-nocookie.com");
  });

  // page.csp.002 — arranca en Report-Only (no bloquea)
  it("el header es Report-Only (arranque, no bloquea)", () => {
    expect(CSP_HEADER).toBe("Content-Security-Policy-Report-Only");
  });

  // page.csp.004 (catálogo-v2 F09/D7) — la preview emite frame-ancestors 'self'; el resto 'none'
  it("las respuestas de preview relajan frame-ancestors a 'self'; el resto conserva 'none'", () => {
    const preview = construirCSP({ esDev: false, esPreview: true });
    const normal = construirCSP({ esDev: false });
    expect(preview).toContain("frame-ancestors 'self'");
    expect(preview).not.toContain("frame-ancestors 'none'");
    expect(normal).toContain("frame-ancestors 'none'");
    expect(normal).not.toContain("frame-ancestors 'self'");
  });

  // page.csp.003 — en dev afloja script-src (unsafe-eval) y connect-src (ws) para HMR; en prod no
  it("en dev permite unsafe-eval + ws (HMR); en prod no", () => {
    const dev = construirCSP({ esDev: true });
    const prod = construirCSP({ esDev: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("ws:");
    // La directiva de aislamiento no cambia entre entornos.
    expect(prod).toContain("frame-ancestors 'none'");
  });
});

describe("security/csp — origen del bucket público en frame-src (admin-bases-pdf F04/D6)", () => {
  // page.csp.005 — el visor de `/bases` embebe el PDF del bucket público en un <iframe>
  // Sin este origen en `frame-src`, la CSP (hoy Report-Only, mañana enforcing) mataría el visor.
  it("agrega el ORIGEN del bucket público a frame-src, sin la key ni el path", () => {
    const csp = construirCSP({
      esDev: false,
      baseUrlAssetsPublicos: "https://pub-abc123.r2.dev",
    });
    expect(csp).toContain("frame-src 'self' https://pub-abc123.r2.dev");
    // Sigue siendo una allowlist: los embeds no se pierden.
    for (const origen of ORIGENES_EMBED) {
      expect(csp).toContain(origen);
    }
    // `object-src 'none'` NO se afloja: el visor usa <iframe>, no <object>.
    expect(csp).toContain("object-src 'none'");
  });

  // page.csp.006 — solo el ORIGEN, aunque la base venga con path/barra final
  it("normaliza la base a su origen (descarta path, barra final y query)", () => {
    const conPath = construirCSP({
      esDev: false,
      baseUrlAssetsPublicos: "https://pub-abc123.r2.dev/algo/mas/",
    });
    expect(conPath).toContain("https://pub-abc123.r2.dev");
    expect(conPath).not.toContain("/algo/mas");
  });

  // page.csp.007 — sin la env (o con basura) la CSP queda IGUAL que antes (no se rompe ni se afloja)
  it("sin base configurada o con un valor inválido, frame-src queda como antes", () => {
    const base = construirCSP({ esDev: false });
    expect(construirCSP({ esDev: false, baseUrlAssetsPublicos: undefined })).toBe(base);
    expect(construirCSP({ esDev: false, baseUrlAssetsPublicos: "" })).toBe(base);
    expect(construirCSP({ esDev: false, baseUrlAssetsPublicos: "no-es-una-url" })).toBe(base);
  });
});
