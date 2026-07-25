import { describe, expect, it } from "vitest";

import {
  esHex,
  generarEscalaColor,
  gradientePortadaDeterminista,
  gradienteTematico,
  overrideDesdeBranding,
  type TenantBranding,
} from "~/styles/tenantTheme";

/**
 * Tests del theming per-tenant (F01/D2, ADR-0011). El override es DATO derivado del branding
 * del `Tenant`, no código: mismo branding ⇒ mismo theme, sin divergencia SSR/cliente (I3).
 * Cubre las Validaciones F01: hex ⇒ tupla de 10 tonos + `primaryColor`; null ⇒ sin override;
 * función pura y determinista.
 */

const branding = (
  colorPrimario: string | null,
  colorAcento: string | null = null,
): TenantBranding => ({
  nombre: "Tienda X",
  slug: "x",
  descripcion: null,
  logoUrl: null,
  colorPrimario,
  colorAcento,
  heroTitulo: null,
  heroSubtitulo: null,
  heroImageUrl: null,
  avisoTexto: null,
  instagramUrl: null,
  tiktokUrl: null,
  whatsappUrl: null,
  contactoEmail: null,
});

const ES_HEX = /^#[0-9a-f]{6}$/;

describe("styles/tenantTheme — gradientePortadaDeterminista (covers de libro, familia de marca, Tanda 2 F13)", () => {
  const ES_GRADIENTE = /^linear-gradient\(/;

  // covers.gradiente.001 — determinista (mismo título ⇒ mismo gradiente) + variedad real entre títulos
  it("es determinista por semilla y reparte gradientes distintos entre títulos", () => {
    // determinista: mismo string ⇒ mismo gradiente (SSR = cliente, sin hydration mismatch)
    expect(gradientePortadaDeterminista("#7c3aed", "Cartas a los 7")).toBe(
      gradientePortadaDeterminista("#7c3aed", "Cartas a los 7"),
    );
    // reparte variedad: un catálogo de 5 títulos NO cae todo en el mismo gradiente
    const titulos = [
      "Cómo enriquecer a tu idol favorito",
      "Cartas a los 7",
      "Mi era favorita",
      "Diario de una ARMY",
      "Borahae: ensayos de fandom",
    ];
    const grads = new Set(titulos.map((t) => gradientePortadaDeterminista("#7c3aed", t)));
    expect(grads.size).toBeGreaterThan(1);
  });

  // covers.gradiente.002 — familia acotada: SOLO tokens Mantine (primario/acento), CERO hex, CERO hue-rotate
  it("emite un linear-gradient de tokens del tenant, sin hex ni hue-rotate (paleta acotada a la familia)", () => {
    for (const s of ["", "x", "Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "42"]) {
      const g = gradientePortadaDeterminista("#7c3aed", s);
      expect(g).toMatch(ES_GRADIENTE);
      expect(g).toContain("var(--mantine-"); // tokens del tenant
      expect(g).not.toContain("#"); // cero hex inline (I-A)
      expect(g).not.toContain("hue-rotate"); // ya NO rota el matiz por el círculo completo (metía azules)
    }
  });

  // covers.gradiente.003 — sin color de marca degrada limpio (tokens del primario base, salida válida)
  it("con colorPrimario null degrada a tokens del primario base (salida válida, cero hex)", () => {
    const g = gradientePortadaDeterminista(null, "Sin marca");
    expect(g).toMatch(ES_GRADIENTE);
    expect(g).toContain("var(--mantine-primary-color-");
    expect(g).not.toContain("#");
  });
});

describe("styles/tenantTheme — generarEscalaColor", () => {
  // storefront.theming.escala.001 — 10 tonos hex válidos, base en el índice 6
  it("expande un hex a una tupla de 10 tonos hex, con la base en el índice 6", () => {
    const escala = generarEscalaColor("#4f46e5");
    expect(escala).toHaveLength(10);
    for (const tono of escala) expect(tono).toMatch(ES_HEX);
    expect(escala[6]).toBe("#4f46e5"); // el shade por defecto de Mantine (light) apunta a la base
  });

  // storefront.theming.escala.002 — la rampa va de claro (0) a oscuro (9), monótona en luminancia
  it("produce una rampa monótona: los índices bajos más claros que los altos", () => {
    const escala = generarEscalaColor("#4f46e5");
    const luminancia = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    for (let i = 1; i < escala.length; i++) {
      expect(luminancia(escala[i]!)).toBeLessThan(luminancia(escala[i - 1]!));
    }
  });

  // storefront.theming.escala.003 — acepta hex de 3 chars (#abc)
  it("acepta la forma corta de 3 caracteres (#abc)", () => {
    const escala = generarEscalaColor("#abc");
    expect(escala).toHaveLength(10);
    expect(escala[6]).toBe("#aabbcc");
  });
});

describe("styles/tenantTheme — overrideDesdeBranding", () => {
  // storefront.theming.override.001 — hex ⇒ override con primaryColor apuntando a tupla de 10
  it("con colorPrimario hex produce un override con primaryColor sobre una tupla de 10 tonos del hex", () => {
    const override = overrideDesdeBranding(branding("#4f46e5"));
    expect(override.primaryColor).toBe("marca");
    expect(override.colors?.marca).toHaveLength(10);
    expect(override.colors?.marca?.[6]).toBe("#4f46e5");
  });

  // storefront.theming.override.002 — null ⇒ sin override (theme base intacto)
  it("con colorPrimario null no produce override (theme base intacto)", () => {
    const override = overrideDesdeBranding(branding(null));
    expect(override.primaryColor).toBeUndefined();
    expect(override.colors).toBeUndefined();
  });

  // storefront.theming.override.003 — hex inválido ⇒ sin override (no crashea con dato malo)
  it("con colorPrimario inválido degrada a sin override (no rompe el storefront)", () => {
    const override = overrideDesdeBranding(branding("no-es-hex"));
    expect(override.primaryColor).toBeUndefined();
    expect(override.colors).toBeUndefined();
  });

  // storefront.theming.override.004 — puro y determinista (mismo branding ⇒ mismo override)
  it("es puro y determinista: mismo branding ⇒ override deep-equal (sirve SSR + cliente)", () => {
    const a = overrideDesdeBranding(branding("#4f46e5"));
    const b = overrideDesdeBranding(branding("#4f46e5"));
    expect(a).toEqual(b);
  });

  // ── builder-tanda-1 F01/D1: segundo color de marca (acento) ──────────────────────────────────

  // acento.override.001 — marca + acento hex ⇒ override con AMBAS escalas de 10 tonos + primaryColor marca
  it("con colorPrimario Y colorAcento hex emite la escala `acento` de 10 tonos ADEMÁS de la de marca", () => {
    const override = overrideDesdeBranding(branding("#4f46e5", "#f59e0b"));
    expect(override.primaryColor).toBe("marca");
    expect(override.colors?.marca).toHaveLength(10);
    expect(override.colors?.acento).toHaveLength(10);
    expect(override.colors?.acento?.[6]).toBe("#f59e0b"); // base del acento en el índice 6
  });

  // acento.override.002 — acento inválido/ausente ⇒ override IDÉNTICO al actual (solo marca, sin acento)
  it("con colorAcento null o inválido el override es idéntico al de solo marca (no agrega `acento`)", () => {
    const soloMarca = overrideDesdeBranding(branding("#4f46e5"));
    expect(soloMarca.colors?.acento).toBeUndefined();
    expect(overrideDesdeBranding(branding("#4f46e5", "no-es-hex"))).toEqual(soloMarca);
    expect(overrideDesdeBranding(branding("#4f46e5", null))).toEqual(soloMarca);
  });

  // acento.override.003 — solo acento (sin marca) ⇒ escala acento presente, primaryColor SIN override (plataforma)
  it("con solo colorAcento (sin marca) agrega la escala acento pero NO mueve el primario", () => {
    const override = overrideDesdeBranding(branding(null, "#f59e0b"));
    expect(override.colors?.acento).toHaveLength(10);
    expect(override.colors?.marca).toBeUndefined();
    expect(override.primaryColor).toBeUndefined(); // conserva el primario de plataforma
  });

  // acento.override.004 — sin ningún color ⇒ override vacío (theme base intacto)
  it("sin colorPrimario ni colorAcento no produce override alguno", () => {
    expect(overrideDesdeBranding(branding(null, null))).toEqual({});
  });
});

describe("styles/tenantTheme — esHex (builder-tanda-1 F01)", () => {
  // acento.eshex.001 — acepta hex de 3 y 6 dígitos, rechaza el resto
  it("valida hex de 3/6 dígitos y rechaza null/vacío/no-hex", () => {
    expect(esHex("#abc")).toBe(true);
    expect(esHex("#4f46e5")).toBe(true);
    expect(esHex(null)).toBe(false);
    expect(esHex(undefined)).toBe(false);
    expect(esHex("")).toBe(false);
    expect(esHex("4f46e5")).toBe(false);
    expect(esHex("#12")).toBe(false);
  });
});

describe("styles/tenantTheme — gradienteTematico (degradación elegante, design.md §5.2)", () => {
  const ES_GRADIENTE = /^linear-gradient\(/;

  // storefront.gradiente.001 — con color de marca deriva de la escala `marca-N` (cero hex inline)
  it("con colorPrimario hex usa las CSS vars de la escala `marca`, sin ningún hex inline", () => {
    const g = gradienteTematico("#4f46e5");
    expect(g).toMatch(ES_GRADIENTE);
    expect(g).toContain("var(--mantine-color-marca-");
    // Cero hex inline (design.md §9): el gradiente NO incrusta el color del tenant como literal.
    expect(g).not.toContain("#");
  });

  // storefront.gradiente.002 — sin color de marca cae al primario base (siempre válido, sin imagen)
  it("con colorPrimario null degrada al primario base de plataforma (produce salida válida)", () => {
    const g = gradienteTematico(null);
    expect(g).toMatch(ES_GRADIENTE);
    expect(g).toContain("var(--mantine-primary-color-");
    expect(g).not.toContain("#");
  });

  // storefront.gradiente.003 — hex inválido degrada como null (no rompe con dato malo)
  it("con colorPrimario inválido degrada igual que null (no crashea)", () => {
    expect(gradienteTematico("no-es-hex")).toBe(gradienteTematico(null));
  });

  // storefront.gradiente.004 — determinista (mismo input ⇒ mismo string, sirve SSR + cliente)
  it("es determinista: mismo colorPrimario ⇒ mismo string", () => {
    expect(gradienteTematico("#4f46e5")).toBe(gradienteTematico("#4f46e5"));
  });
});
