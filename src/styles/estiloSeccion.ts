import { type MantineSpacing, type StyleProp } from "@mantine/core";
import { type CSSProperties } from "react";

import {
  type AmbienteFondo,
  type EsquemaFondo,
  type EstiloSeccion,
  type FondoSeccion,
} from "~/lib/pagebuilder/widgets";

/**
 * Resolución PURA de `estiloSeccion` → CSS (catálogo-v2 F02/D2, síntesis §3). Espejo de
 * `gradienteTematico` (`~/styles/tenantTheme.ts`): mapea cada esquema/gradiente/patrón/imagen a
 * **tokens de la escala del tenant** vía CSS vars — CERO hex inline (I-A). Usa
 * `--mantine-primary-color-*` para el color de marca: cuando el tenant tiene `colorPrimario`, esa
 * escala ES el primario (override en `_app`); sin color, cae al primario de PLATAFORMA — degradación
 * elegante sin ramas (mejor que `gradienteTematico`, que sí ramifica). Determinista ⇒ SSR + cliente
 * calculan el MISMO CSS (sin hydration mismatch). PROHIBIDO importar `~/server` o React runtime acá:
 * corre también en el cliente (solo el tipo `CSSProperties`).
 */

/** Espaciado vertical resuelto a `py` de Mantine (responsive). `l` = el `py` actual por defecto. */
export type PyResuelto = StyleProp<MantineSpacing>;

/** Descriptor resuelto que consume el `<SeccionWrapper>`. */
export interface EstiloSeccionResuelto {
  /** CSS del `<section>` (background + color de texto emparejado + patrón/imagen). */
  fondo: CSSProperties;
  /** `py` responsive de Mantine (default: ambos lados iguales). */
  py: PyResuelto;
  /** Padding-top independiente (Tanda 2 F06/D6). `undefined` ⇒ sin override ⇒ el wrapper usa `py` (no-op). */
  pyTop?: PyResuelto;
  /** Padding-bottom independiente (Tanda 2 F06/D6). `undefined` ⇒ sin override ⇒ el wrapper usa `py`. */
  pyBottom?: PyResuelto;
  /** Tamaño del `Container`; `false` = full-bleed (sin Container). */
  containerSize: "lg" | "xl" | false;
  /** Divisor inferior a dibujar, o `null`. */
  divisor: { forma: string; altura: string; invertir: boolean } | null;
  /** Preset de entrada (F03). `heredar` ⇒ el wrapper toma el default del TemaPagina. */
  entrada: string;
  /** Ancho del FONDO (F02/D4): `completo` = full-bleed (default, comportamiento actual); `contenido` = acotado. */
  anchoFondo: "completo" | "contenido";
  /** Min-height CSS resuelto (F06/D9): `undefined` = auto (sin min-height, comportamiento actual). */
  altoMin?: string;
  /** `justify-content` para alinear el contenido en vertical (F06/D9). Solo aplica con `altoMin` presente. */
  justifyVertical: "flex-start" | "center" | "flex-end";
}

// ── Tokens de fondo emparejados (fondo + color de texto legible por construcción) ─────────────
// Cada esquema empaqueta background + color de texto ⇒ ni el Organizador ni el LLM crean una
// sección ilegible (modelo Shopify color schemes). `tema` = transparente ⇒ hereda el fondo de página.

/** Esquemas con fondo OSCURO (texto claro). El resto lleva texto tinta/heredado. */
const ESQUEMAS_OSCUROS: ReadonlySet<EsquemaFondo> = new Set([
  "marca",
  "marca_profundo",
  "acento_profundo",
  "tinta",
]);

/** CSS de background + color de texto de un esquema sólido. */
function esquemaACss(esquema: EsquemaFondo): CSSProperties {
  switch (esquema) {
    case "tema":
      return {}; // transparente: hereda el fondo de página + el color de texto del shell
    case "superficie":
      return { background: "var(--mantine-color-body)", color: "var(--mantine-color-text)" };
    case "superficie_alt":
      // Banda alterna dark-aware (mismo criterio light-dark() que `superficie` vía --mantine-color-body):
      // clara ⇒ gray-1, oscura ⇒ dark-6. Antes era gray-1 fijo y en modo oscuro aparecía una banda
      // clara que rompía la página (réplica landing_idol, 2026-07-24).
      return {
        background: "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))",
        color: "var(--mantine-color-text)",
      };
    case "marca_suave":
      return { background: "var(--mantine-primary-color-0)", color: "var(--mantine-color-text)" };
    case "marca":
      // Filled del primario + su color de contraste (autoContrast Mantine): legible para marcas
      // claras (amarillo ⇒ texto tinta) y oscuras (cobalto ⇒ texto blanco). Emparejado real.
      return {
        background: "var(--mantine-primary-color-filled)",
        color: "var(--mantine-primary-color-contrast)",
      };
    case "marca_profundo":
      return { background: "var(--mantine-primary-color-8)", color: "var(--mantine-color-white)" };
    // Acento (builder-tanda-1 F01/D1): tokens de la escala `acento` con FALLBACK a la de marca/
    // primario cuando el tenant no tiene acento (I-T2 — nunca opción muda ni sección ilegible).
    case "acento_suave":
      return {
        background: "var(--mantine-color-acento-0, var(--mantine-primary-color-0))",
        color: "var(--mantine-color-text)",
      };
    case "acento":
      // Filled del acento + su contraste (autoContrast del theme emite `--mantine-color-acento-contrast`);
      // sin acento cae al filled/contrast del primario (marca) — emparejado legible en ambos casos.
      return {
        background: "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))",
        color: "var(--mantine-color-acento-contrast, var(--mantine-primary-color-contrast))",
      };
    case "acento_profundo":
      return {
        background: "var(--mantine-color-acento-8, var(--mantine-primary-color-8))",
        color: "var(--mantine-color-white)",
      };
    case "tinta":
      return { background: "var(--mantine-color-gray-9)", color: "var(--mantine-color-white)" };
  }
}

/**
 * CSS público (background + color de texto emparejado) de un esquema sólido. Wrapper de `esquemaACss`
 * para consumidores fuera de este módulo (p.ej. la cinta `aviso_barra` v2, F04) ⇒ el color del widget
 * sale del MISMO mapa de tokens (cero hex en el componente, I-A; degradación acento→marca I-T2).
 */
export function cssDeEsquema(esquema: EsquemaFondo): CSSProperties {
  return esquemaACss(esquema);
}

/** Token de color SÓLIDO de un esquema (para el fill del divisor de la sección siguiente). */
export function colorSolidoDeEsquema(esquema: EsquemaFondo): string {
  switch (esquema) {
    case "tema":
    case "superficie":
      return "var(--mantine-color-body)";
    case "superficie_alt":
      return "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))";
    case "marca_suave":
      return "var(--mantine-primary-color-0)";
    case "marca":
      return "var(--mantine-primary-color-filled)";
    case "marca_profundo":
      return "var(--mantine-primary-color-8)";
    case "acento_suave":
      return "var(--mantine-color-acento-0, var(--mantine-primary-color-0))";
    case "acento":
      return "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";
    case "acento_profundo":
      return "var(--mantine-color-acento-8, var(--mantine-primary-color-8))";
    case "tinta":
      return "var(--mantine-color-gray-9)";
  }
}

/** CSS de un gradiente preset (background + color de texto emparejado). */
function gradienteACss(preset: string): CSSProperties {
  switch (preset) {
    case "marca_suave":
      return {
        background:
          "linear-gradient(135deg, var(--mantine-primary-color-0), var(--mantine-primary-color-2))",
        color: "var(--mantine-color-text)",
      };
    case "marca_vivo": // = gradienteTematico actual (marca-5 → marca-8)
      return {
        background:
          "linear-gradient(135deg, var(--mantine-primary-color-5), var(--mantine-primary-color-8))",
        color: "var(--mantine-color-white)",
      };
    case "tinta":
      return {
        background: "linear-gradient(135deg, var(--mantine-color-gray-8), var(--mantine-color-gray-9))",
        color: "var(--mantine-color-white)",
      };
    case "papel":
      return {
        background: "linear-gradient(135deg, var(--mantine-color-gray-0), var(--mantine-color-gray-2))",
        color: "var(--mantine-color-text)",
      };
    default:
      return {};
  }
}

/** `object-position`-equivalente para el fondo de imagen (enum acotado, no CSS libre). */
const POSICION_CSS: Record<string, string> = {
  centro: "center",
  arriba: "top",
  abajo: "bottom",
  izq: "left",
  der: "right",
};

/** Token del overlay sobre el fondo de imagen. `ninguno` ⇒ sin overlay. */
const OVERLAY_TOKEN: Record<string, string | null> = {
  ninguno: null,
  tinta: "var(--mantine-color-gray-9)",
  marca: "var(--mantine-primary-color-filled)",
  claro: "var(--mantine-color-white)",
};

/** CSS de un fondo de imagen con overlay (para contraste del texto encima). */
function imagenACss(fondo: Extract<FondoSeccion, { tipo: "imagen" }>): CSSProperties {
  const posicion = POSICION_CSS[fondo.posicion] ?? "center";
  const token = OVERLAY_TOKEN[fondo.overlay];
  // `url()` con una URL ya validada por Zod (urlPublica). Comillas para acotar.
  const imgLayer = `url("${fondo.url}")`;
  const backgroundImage = token
    ? `linear-gradient(0deg, color-mix(in srgb, ${token} ${fondo.opacidadOverlay}%, transparent), color-mix(in srgb, ${token} ${fondo.opacidadOverlay}%, transparent)), ${imgLayer}`
    : imgLayer;
  return {
    backgroundImage,
    backgroundSize: "cover",
    backgroundPosition: posicion,
    backgroundRepeat: "no-repeat",
    ...(fondo.fijo ? { backgroundAttachment: "fixed" } : {}),
    // Con overlay tinta/marca (oscurece) ⇒ texto claro; overlay claro/ninguno ⇒ tinta.
    color:
      fondo.overlay === "tinta" || fondo.overlay === "marca"
        ? "var(--mantine-color-white)"
        : "var(--mantine-color-text)",
  };
}

/** CSS de un patrón decorativo sobre un esquema base (SVG-in-CSS acotado, nunca markup del tenant). */
function patronACss(
  patron: string,
  esquema: EsquemaFondo,
): CSSProperties {
  const base = esquemaACss(esquema);
  const oscuro = ESQUEMAS_OSCUROS.has(esquema);
  // Trazo del patrón: claro sobre esquema oscuro, tinta sobre esquema claro (bajo alpha).
  const trazo = oscuro
    ? "color-mix(in srgb, var(--mantine-color-white) 12%, transparent)"
    : "color-mix(in srgb, var(--mantine-color-gray-9) 10%, transparent)";
  let backgroundImage: string | undefined;
  let backgroundSize: string | undefined;
  switch (patron) {
    case "puntos":
      backgroundImage = `radial-gradient(circle, ${trazo} 1.5px, transparent 1.5px)`;
      backgroundSize = "16px 16px";
      break;
    case "grilla":
      backgroundImage = `linear-gradient(${trazo} 1px, transparent 1px), linear-gradient(90deg, ${trazo} 1px, transparent 1px)`;
      backgroundSize = "24px 24px";
      break;
    case "diagonales":
      backgroundImage = `repeating-linear-gradient(45deg, ${trazo} 0, ${trazo} 1px, transparent 1px, transparent 10px)`;
      break;
    case "perforacion": // motivo talonario: puntos grandes tipo troquel
      backgroundImage = `radial-gradient(circle, ${trazo} 2px, transparent 2px)`;
      backgroundSize = "22px 22px";
      break;
    case "cuadricula_papel": // Tanda 2 F07/D7: papel de cuaderno (grilla de token, celda ~28px, v4)
      backgroundImage = `linear-gradient(${trazo} 1px, transparent 1px), linear-gradient(90deg, ${trazo} 1px, transparent 1px)`;
      backgroundSize = "28px 28px";
      break;
    case "arcos": // Tanda 2 F07/D7: motivo scallop/arcos (fila de semicírculos de token, v5)
      backgroundImage = `radial-gradient(circle at 50% 0, transparent 20px, ${trazo} 20px, ${trazo} 21px, transparent 22px)`;
      backgroundSize = "44px 44px";
      break;
    default: // patrón sin soporte ⇒ solo el esquema base (degradación)
      return base;
  }
  return {
    ...base,
    backgroundImage,
    ...(backgroundSize ? { backgroundSize } : {}),
  };
}

/** Ángulo del degradado bicolor por dirección (fijo, no CSS libre). */
const DIRECCION_BICOLOR: Record<string, string> = {
  vertical: "to bottom",
  horizontal: "to right",
  diagonal: "135deg",
};

/**
 * CSS de un fondo BICOLOR (builder-tanda-1 F02/D3; contraste F13/fidelidad). Dos TONOS curados
 * (`colorSolidoDeEsquema` da su token, con degradación acento→marca por fallback CSS, I-T2). `dura` =
 * corte al 50% (dos bandas deliberadas). `suave` = degradado SESGADO hacia `colorA`: colorA se mantiene
 * sólido hasta el 60% y solo entonces transiciona a colorB (que queda como acento hacia el borde). El
 * texto se empareja con `colorA` (`esquemaACss(colorA)`) ⇒ el contenido —típicamente centrado, sobre el
 * 50%— cae SIEMPRE sobre colorA, cuyo color de texto emparejado es legible: legibilidad POR CONSTRUCCIÓN
 * (I-A). Antes el degradado era 0→100 simétrico y un heading blanco (emparejado a colorA oscuro) caía
 * sobre la mitad colorB clara con contraste débil (dif #6 del feature-tester). Cero hex inline (I-A).
 */
function bicolorACss(fondo: Extract<FondoSeccion, { tipo: "bicolor" }>): CSSProperties {
  const a = colorSolidoDeEsquema(fondo.colorA);
  const b = colorSolidoDeEsquema(fondo.colorB);
  const angulo = DIRECCION_BICOLOR[fondo.direccion] ?? "to bottom";
  const background =
    fondo.mezcla === "dura"
      ? `linear-gradient(${angulo}, ${a} 0%, ${a} 50%, ${b} 50%, ${b} 100%)`
      : `linear-gradient(${angulo}, ${a} 0%, ${a} 60%, ${b} 100%)`;
  // `TonoFondo ⊆ EsquemaFondo` ⇒ el color de texto emparejado sale de `esquemaACss(colorA)`.
  const color = esquemaACss(fondo.colorA).color;
  return { background, ...(color ? { color } : {}) };
}

/** CSS de fondo (background + color) para cualquier `FondoSeccion`. */
export function fondoSeccionACss(fondo: FondoSeccion | undefined): CSSProperties {
  if (!fondo) return {}; // ausente ⇒ transparente (hereda el fondo de página) = look actual
  switch (fondo.tipo) {
    case "esquema":
      return esquemaACss(fondo.esquema);
    case "gradiente":
      return gradienteACss(fondo.preset);
    case "bicolor":
      return bicolorACss(fondo);
    case "imagen":
      return imagenACss(fondo);
    case "patron":
      return patronACss(fondo.patron, fondo.esquema);
  }
}

/** Espaciado vertical (enum) → `py` responsive de Mantine. `l` = el default histórico. */
const PY_POR_ESPACIADO: Record<string, PyResuelto> = {
  ninguno: { base: 0, md: 0 },
  s: { base: "md", md: "lg" },
  m: { base: "lg", md: "xl" },
  l: { base: "xl", md: 48 }, // ← default histórico (Box py={{ base:"xl", md:48 }})
  xl: { base: 48, md: 80 },
};

/** Alto mínimo (enum) → min-height CSS (svh, correcto en mobile). `auto` ⇒ sin min-height (no-op). */
const ALTO_MIN_CSS: Record<string, string | undefined> = {
  auto: undefined,
  media: "60svh",
  pantalla: "100svh",
};

/** Alineación vertical (enum) → `justify-content` del `<section>` en flex-column. */
const JUSTIFY_POR_ALINEAR: Record<string, "flex-start" | "center" | "flex-end"> = {
  arriba: "flex-start",
  centro: "center",
  abajo: "flex-end",
};

/** Ancho (enum) → tamaño del `Container` de Mantine; `completo` ⇒ `false` (full-bleed). */
const CONTAINER_POR_ANCHO: Record<string, "lg" | "xl" | false> = {
  contenido: "lg", // ← default histórico (Container size="lg")
  ancho: "xl",
  completo: false,
};

/**
 * Resuelve un `EstiloSeccion` (posiblemente ausente) al descriptor que consume `<SeccionWrapper>`.
 * `estilo` ausente ⇒ defaults IDÉNTICOS al render actual: transparente, `py` L (xl/48), Container lg,
 * sin divisor, entrada `heredar` (migración no-op, I-H).
 */
export function estiloSeccionACss(
  estilo: EstiloSeccion | undefined,
): EstiloSeccionResuelto {
  const padY = estilo?.padY ?? "l";
  const ancho = estilo?.ancho ?? "contenido";
  const divisorInferior = estilo?.divisorInferior;
  const pyBase = PY_POR_ESPACIADO[padY] ?? PY_POR_ESPACIADO.l!;
  // Espaciado fino (F06/D6): con `padTop`/`padBottom` presente, cada lado usa su enum (el lado sin
  // override cae al `padY` base). Sin ninguno ⇒ pyTop/pyBottom undefined ⇒ el wrapper usa `py` (no-op, I-H).
  const tienePadOverride = estilo?.padTop !== undefined || estilo?.padBottom !== undefined;
  return {
    fondo: fondoSeccionACss(estilo?.fondo),
    py: pyBase,
    pyTop: tienePadOverride ? (PY_POR_ESPACIADO[estilo?.padTop ?? padY] ?? pyBase) : undefined,
    pyBottom: tienePadOverride ? (PY_POR_ESPACIADO[estilo?.padBottom ?? padY] ?? pyBase) : undefined,
    containerSize: CONTAINER_POR_ANCHO[ancho] ?? "lg",
    divisor:
      divisorInferior && divisorInferior.forma !== "ninguno"
        ? {
            forma: divisorInferior.forma,
            altura: divisorInferior.altura,
            invertir: divisorInferior.invertir,
          }
        : null,
    entrada: estilo?.entrada ?? "heredar",
    anchoFondo: estilo?.anchoFondo ?? "completo", // default full-bleed = comportamiento actual (I-H)
    altoMin: ALTO_MIN_CSS[estilo?.altoMin ?? "auto"], // undefined con "auto" (no-op, I-H)
    justifyVertical: JUSTIFY_POR_ALINEAR[estilo?.alinearVertical ?? "arriba"] ?? "flex-start",
  };
}

/**
 * Token de color sólido del fondo de una sección (para pintar el divisor de la sección ANTERIOR con
 * el color de ESTA — lee como transición). Gradiente/imagen ⇒ cae al fondo de página (`body`).
 */
export function colorFondoSolido(estilo: EstiloSeccion | undefined): string {
  const fondo = estilo?.fondo;
  if (!fondo) return "var(--mantine-color-body)";
  if (fondo.tipo === "esquema") return colorSolidoDeEsquema(fondo.esquema);
  if (fondo.tipo === "patron") return colorSolidoDeEsquema(fondo.esquema);
  // Bicolor (F02): el divisor de la sección anterior se pinta con el tono SUPERIOR (colorA), donde
  // lande la transición desde arriba (vertical). Aproximación para horizontal/diagonal.
  if (fondo.tipo === "bicolor") return colorSolidoDeEsquema(fondo.colorA);
  return "var(--mantine-color-body)"; // gradiente/imagen ⇒ transición al fondo de página
}

// ── Ambiente del fondo de página · stage-lights (Tanda 2 F05/D5) ───────────────────────────────
//
// Capas de `radial-gradient` FIJAS (posiciones + opacidades curadas) de tokens del tenant, apiladas
// SOBRE el color sólido del `fondoPagina`. CSS 100% estático (sin JS, sin animación) ⇒ SSR-safe y
// reduced-motion-irrelevante. Opacidad por `color-mix(... transparent)` sobre tokens ⇒ CERO hex (I-A).
// `acento*` con fallback a marca (I-T2). El `background` compone `<gradientes>, <color base>` (el color
// va en la capa final, que es la background-color del shorthand).

const AMBIENTE_CAPAS: Record<AmbienteFondo, string | null> = {
  ninguno: null,
  focos_marca: [
    "radial-gradient(60% 45% at 18% 0%, color-mix(in srgb, var(--mantine-primary-color-5) 22%, transparent), transparent 70%)",
    "radial-gradient(50% 40% at 85% 12%, color-mix(in srgb, var(--mantine-primary-color-7) 16%, transparent), transparent 65%)",
    "radial-gradient(55% 45% at 50% 100%, color-mix(in srgb, var(--mantine-primary-color-8) 14%, transparent), transparent 75%)",
  ].join(", "),
  focos_acento: [
    "radial-gradient(60% 45% at 18% 0%, color-mix(in srgb, var(--mantine-color-acento-5, var(--mantine-primary-color-5)) 22%, transparent), transparent 70%)",
    "radial-gradient(50% 40% at 85% 12%, color-mix(in srgb, var(--mantine-color-acento-7, var(--mantine-primary-color-7)) 16%, transparent), transparent 65%)",
    "radial-gradient(55% 45% at 50% 100%, color-mix(in srgb, var(--mantine-color-acento-8, var(--mantine-primary-color-8)) 14%, transparent), transparent 75%)",
  ].join(", "),
  aurora: [
    "radial-gradient(55% 45% at 15% 8%, color-mix(in srgb, var(--mantine-primary-color-5) 20%, transparent), transparent 70%)",
    "radial-gradient(50% 45% at 85% 18%, color-mix(in srgb, var(--mantine-color-acento-5, var(--mantine-primary-color-5)) 20%, transparent), transparent 70%)",
    "radial-gradient(60% 50% at 50% 100%, color-mix(in srgb, var(--mantine-primary-color-8) 16%, transparent), transparent 75%)",
  ].join(", "),
};

/**
 * Fondo del shell del storefront con el ambiente aplicado (Tanda 2 F05/D5). `ambiente:"ninguno"` ⇒ solo
 * el color sólido del `fondoPagina` (idéntico al shell actual, no-op I-H). Otro ambiente ⇒ los
 * radial-gradients de tokens del tenant apilados sobre ese color base. PURO (SSR + cliente igual).
 */
export function fondoShellConAmbiente(
  fondoPagina: EsquemaFondo,
  ambiente: AmbienteFondo,
): CSSProperties {
  const base = colorSolidoDeEsquema(fondoPagina);
  const capas = AMBIENTE_CAPAS[ambiente];
  return { background: capas ? `${capas}, ${base}` : base };
}
