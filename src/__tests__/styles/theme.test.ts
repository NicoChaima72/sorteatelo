import { readFileSync } from "fs";
import { resolve } from "path";

import { OrderStatus, TenantStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  ESTADO_ORDEN_COLOR,
  ESTADO_TIENDA_COLOR,
  theme,
} from "~/styles/theme";

/**
 * Tests de la paleta de plataforma (F01, identidad «El Talonario»). La paleta vive SOLO en
 * el theme de Mantine (design.md §2/§9, I1) — acá se verifica que la tupla de marca (cobalto)
 * existe y ancla en el índice del `primaryShade` (6, alineado con `tenantTheme` — D4), que la
 * semántica de comercio (D3) es EXHAUSTIVA contra los enums reales de Prisma, que las tuplas
 * semánticas quedaron re-ancladas a los hex del talonario, y que las fuentes entran por CSS var
 * (theme importable desde Vitest sin arrastrar `next/font`).
 */
const ES_HEX = /^#[0-9a-f]{6}$/i;

describe("styles/theme — paleta de plataforma (talonario)", () => {
  // styles.theme.001 — la tupla `sorteatelo` (10 tonos hex) es el primaryColor
  it("define la tupla `sorteatelo` de 10 tonos hex y la usa como primaryColor", () => {
    expect(theme.primaryColor).toBe("sorteatelo");
    const tupla = theme.colors?.sorteatelo;
    expect(tupla).toHaveLength(10);
    for (const tono of tupla ?? []) expect(tono).toMatch(ES_HEX);
  });

  // styles.theme.002 — el cobalto #2b3fbf vive en el índice del primaryShade (6, D4)
  it("ancla el cobalto #2b3fbf en el índice 6 y declara primaryShade 6 (alineado con tenantTheme)", () => {
    expect(theme.colors?.sorteatelo?.[6]).toBe("#2b3fbf");
    expect(theme.primaryShade).toBe(6);
  });
});

describe("styles/theme — semántica de comercio (D3, exhaustiva vs Prisma)", () => {
  // styles.theme.003 — ESTADO_ORDEN_COLOR cubre TODOS los OrderStatus
  it("ESTADO_ORDEN_COLOR cubre todos los OrderStatus, cada uno con un token", () => {
    for (const estado of Object.values(OrderStatus)) {
      expect(ESTADO_ORDEN_COLOR[estado]).toBeTruthy();
    }
    expect(Object.keys(ESTADO_ORDEN_COLOR).sort()).toEqual(
      Object.values(OrderStatus).sort(),
    );
  });

  // styles.theme.004 — ESTADO_TIENDA_COLOR cubre TODOS los TenantStatus
  it("ESTADO_TIENDA_COLOR cubre todos los TenantStatus, cada uno con un token", () => {
    for (const estado of Object.values(TenantStatus)) {
      expect(ESTADO_TIENDA_COLOR[estado]).toBeTruthy();
    }
    expect(Object.keys(ESTADO_TIENDA_COLOR).sort()).toEqual(
      Object.values(TenantStatus).sort(),
    );
  });
});

describe("styles/theme — tuplas semánticas re-ancladas al talonario (D3)", () => {
  // styles.theme.005 — exito=teal #1d7a70, pendiente=#a06b08, red=#c03e2e en el índice de ref (6)
  it("re-ancla exito (teal), pendiente (ámbar) y red (ladrillo) a los hex del talonario", () => {
    expect(theme.colors?.exito?.[6]).toBe("#1d7a70");
    expect(theme.colors?.pendiente?.[6]).toBe("#a06b08");
    expect(theme.colors?.red?.[6]).toBe("#c03e2e");
    for (const token of ["exito", "pendiente", "red", "amarillo", "premio"]) {
      const tupla = theme.colors?.[token];
      expect(tupla, `tupla ${token}`).toHaveLength(10);
      for (const tono of tupla ?? []) expect(tono).toMatch(ES_HEX);
    }
  });

  // styles.theme.006 — el amarillo de marca (#ffc530) existe y `premio` se re-ancla a él (D3)
  it("expone el amarillo de marca #ffc530 y re-ancla `premio` al amarillo de marca", () => {
    expect(theme.colors?.amarillo?.[6]).toBe("#ffc530");
    expect(theme.colors?.premio?.[6]).toBe("#ffc530");
  });

  // styles.theme.007 — el negro de marca es la tinta #191b22 (reemplaza el café)
  it("usa la tinta #191b22 como black de marca", () => {
    expect(theme.black).toBe("#191b22");
  });
});

describe("styles/theme — mapeo semántico específico (D3, design.md §5)", () => {
  // styles.estado.001 — orden: pagado→teal(exito), pendiente→ámbar oscuro, fallido→rojo ladrillo
  it("mapea cada estado de orden a su token semántico (I4: fallido en `red`)", () => {
    expect(ESTADO_ORDEN_COLOR.PAGADO).toBe("exito");
    expect(ESTADO_ORDEN_COLOR.PENDIENTE).toBe("pendiente");
    expect(ESTADO_ORDEN_COLOR.FALLIDO).toBe("red");
  });

  // styles.estado.002 — tienda: publicada→teal, configuración→ámbar, suspendida→rojo, alta→gris
  it("mapea cada estado de tienda a su token (pendiente NUNCA en rojo, I4)", () => {
    expect(ESTADO_TIENDA_COLOR.PUBLICADA).toBe("exito");
    expect(ESTADO_TIENDA_COLOR.CONFIGURACION).toBe("pendiente");
    expect(ESTADO_TIENDA_COLOR.SUSPENDIDA).toBe("red");
    expect(ESTADO_TIENDA_COLOR.ALTA).toBe("gray");
    // "pendiente"/"configuración" NUNCA usan el token de error
    expect(ESTADO_ORDEN_COLOR.PENDIENTE).not.toBe("red");
    expect(ESTADO_TIENDA_COLOR.CONFIGURACION).not.toBe("red");
  });
});

describe("styles/theme — tipografía por CSS var (I9, Vitest-safe)", () => {
  // styles.theme.008 — texto Instrument, headings Bricolage, mono Plex, todas por CSS var
  it("consume las 3 fuentes del talonario por CSS var (Instrument/Bricolage/Plex)", () => {
    expect(theme.fontFamily).toContain("var(--font-instrument)");
    expect(theme.headings?.fontFamily).toContain("var(--font-display)");
    expect(theme.fontFamilyMonospace).toContain("var(--font-mono)");
  });

  // styles.theme.009 — theme.ts NO importa next/font (loader vive en fonts.ts/_document.tsx)
  it("no importa `next/font` en theme.ts (importable desde Vitest y el cliente)", () => {
    const src = readFileSync(resolve(__dirname, "../../styles/theme.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']next\/font/);
  });
});
