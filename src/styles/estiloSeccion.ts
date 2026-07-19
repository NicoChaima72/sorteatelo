import { type MantineSpacing, type StyleProp } from "@mantine/core";
import { type CSSProperties } from "react";

import {
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
  /** `py` responsive de Mantine. */
  py: PyResuelto;
  /** Tamaño del `Container`; `false` = full-bleed (sin Container). */
  containerSize: "lg" | "xl" | false;
  /** Divisor inferior a dibujar, o `null`. */
  divisor: { forma: string; altura: string; invertir: boolean } | null;
  /** Preset de entrada (F03). `heredar` ⇒ el wrapper toma el default del TemaPagina. */
  entrada: string;
}

// ── Tokens de fondo emparejados (fondo + color de texto legible por construcción) ─────────────
// Cada esquema empaqueta background + color de texto ⇒ ni el Organizador ni el LLM crean una
// sección ilegible (modelo Shopify color schemes). `tema` = transparente ⇒ hereda el fondo de página.

/** Esquemas con fondo OSCURO (texto claro). El resto lleva texto tinta/heredado. */
const ESQUEMAS_OSCUROS: ReadonlySet<EsquemaFondo> = new Set([
  "marca",
  "marca_profundo",
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
      return { background: "var(--mantine-color-gray-1)", color: "var(--mantine-color-text)" };
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
    case "tinta":
      return { background: "var(--mantine-color-gray-9)", color: "var(--mantine-color-white)" };
  }
}

/** Token de color SÓLIDO de un esquema (para el fill del divisor de la sección siguiente). */
export function colorSolidoDeEsquema(esquema: EsquemaFondo): string {
  switch (esquema) {
    case "tema":
    case "superficie":
      return "var(--mantine-color-body)";
    case "superficie_alt":
      return "var(--mantine-color-gray-1)";
    case "marca_suave":
      return "var(--mantine-primary-color-0)";
    case "marca":
      return "var(--mantine-primary-color-filled)";
    case "marca_profundo":
      return "var(--mantine-primary-color-8)";
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
    default: // patrón sin soporte ⇒ solo el esquema base (degradación)
      return base;
  }
  return {
    ...base,
    backgroundImage,
    ...(backgroundSize ? { backgroundSize } : {}),
  };
}

/** CSS de fondo (background + color) para cualquier `FondoSeccion`. */
export function fondoSeccionACss(fondo: FondoSeccion | undefined): CSSProperties {
  if (!fondo) return {}; // ausente ⇒ transparente (hereda el fondo de página) = look actual
  switch (fondo.tipo) {
    case "esquema":
      return esquemaACss(fondo.esquema);
    case "gradiente":
      return gradienteACss(fondo.preset);
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
  return {
    fondo: fondoSeccionACss(estilo?.fondo),
    py: PY_POR_ESPACIADO[padY] ?? PY_POR_ESPACIADO.l!,
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
  return "var(--mantine-color-body)"; // gradiente/imagen ⇒ transición al fondo de página
}
