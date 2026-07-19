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
