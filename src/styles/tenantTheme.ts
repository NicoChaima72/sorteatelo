import {
  type MantineColorsTuple,
  type MantineThemeOverride,
} from "@mantine/core";

import { type Tema } from "~/lib/pagebuilder/schema";

/**
 * Theming per-tenant del storefront (F06/D2, ADR-0011). El branding de la Tienda es **dato,
 * no código**: estas funciones PURAS derivan un `MantineThemeOverride` de los datos del
 * `Tenant` resueltos server-side, y `_app.tsx` lo mergea sobre el theme base de plataforma
 * con `mergeThemeOverrides`. Jamás un theme hardcodeado por tenant ni hex inline en componentes
 * (I3). Al ser puras y deterministas, SSR y cliente calculan el MISMO theme (sin hydration
 * mismatch): el override es función del `tenantBranding` serializado en `pageProps`.
 *
 * PROHIBIDO importar nada de `~/server` acá: este módulo corre también en el cliente (`_app`).
 */

/**
 * Los campos de marca del `Tenant` que viajan al cliente (vía `pageProps.tenantBranding`) para
 * armar el theme + renderizar el chrome del storefront. Es un subconjunto SERIALIZABLE del
 * modelo — nada sensible (jamás credenciales). Lo puebla el `getServerSideProps` del storefront.
 */
export interface TenantBranding {
  nombre: string;
  slug: string;
  descripcion: string | null;
  logoUrl: string | null;
  /** Color de marca en hex (`#rgb` o `#rrggbb`); `null` ⇒ sin override (theme base de plataforma). */
  colorPrimario: string | null;
  /**
   * Segundo color de marca en hex (builder-tanda-1 F01/D1); `null` ⇒ los esquemas/tonos `acento*`
   * degradan a la escala de marca (I-T2). Tratamiento ESPEJO de `colorPrimario`.
   */
  colorAcento: string | null;
  // El HERO (título/subtítulo/imagen) y el AVISO no viven acá desde admin-bases-pdf F07/D8/D9: son
  // del Documento de Página (`StorefrontPage`, ADR-0016) y se editan en el EDITOR. El branding es
  // solo la MARCA base del Tenant (nombre/logo/colores/redes), que el theming per-request consume.
  // Redes y contacto del footer (plantilla-rica F02/D2). Cada una `null` ⇒ se oculta ese ícono/línea (D7).
  instagramUrl: string | null;
  tiktokUrl: string | null;
  whatsappUrl: string | null;
  contactoEmail: string | null;
}

/** Clave del color de marca en `theme.colors`. Un solo token = un solo color (design.md §2). */
export const COLOR_MARCA = "marca";

/**
 * Clave del SEGUNDO color de marca en `theme.colors` (builder-tanda-1 F01/D1). Cuando el tenant
 * tiene `colorAcento` válido, `overrideDesdeBranding` puebla `colors.acento` ⇒ Mantine emite las CSS
 * vars `--mantine-color-acento-*` (incl. `-filled`/`-contrast` por `autoContrast`). Sin acento, esas
 * vars no existen y los esquemas `acento*` degradan por fallback de `var()` a la escala de marca (I-T2).
 */
export const COLOR_ACENTO = "acento";

const HEX_CORTO = /^#([0-9a-fA-F]{3})$/;
const HEX_LARGO = /^#([0-9a-fA-F]{6})$/;

/**
 * Rampa de la escala Mantine (10 tonos, índices 0→9 de claro a oscuro). La base (el hex del
 * tenant) va en el índice **6** = `primaryShade.light` por defecto en Mantine 7, así que los
 * `filled` (botones, etc.) salen exactamente en el color elegido. Los índices < 6 mezclan hacia
 * blanco (tintes) y los > 6 hacia negro (sombras). Valores fijos ⇒ salida determinista.
 */
const RAMPA: ReadonlyArray<{ hacia: "blanco" | "negro"; cantidad: number }> = [
  { hacia: "blanco", cantidad: 0.9 },
  { hacia: "blanco", cantidad: 0.78 },
  { hacia: "blanco", cantidad: 0.62 },
  { hacia: "blanco", cantidad: 0.44 },
  { hacia: "blanco", cantidad: 0.28 },
  { hacia: "blanco", cantidad: 0.14 },
  { hacia: "blanco", cantidad: 0 }, // índice 6 = base
  { hacia: "negro", cantidad: 0.16 },
  { hacia: "negro", cantidad: 0.34 },
  { hacia: "negro", cantidad: 0.52 },
];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#abc`/`#aabbcc` ⇒ `{r,g,b}`; `null` si no es un hex válido. */
function hexARgb(hex: string): Rgb | null {
  const corto = HEX_CORTO.exec(hex);
  if (corto) {
    const [r, g, b] = corto[1]!.split("").map((c) => parseInt(c + c, 16));
    return { r: r!, g: g!, b: b! };
  }
  const largo = HEX_LARGO.exec(hex);
  if (largo) {
    const n = parseInt(largo[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

function componenteAHex(v: number): string {
  return Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0");
}

function rgbAHex({ r, g, b }: Rgb): string {
  return `#${componenteAHex(r)}${componenteAHex(g)}${componenteAHex(b)}`;
}

/** Mezcla `color` con blanco/negro por `cantidad` (0 = color intacto, 1 = target). */
function mezclar(color: Rgb, hacia: "blanco" | "negro", cantidad: number): Rgb {
  const t = hacia === "blanco" ? 255 : 0;
  const mix = (c: number) => c * (1 - cantidad) + t * cantidad;
  return { r: mix(color.r), g: mix(color.g), b: mix(color.b) };
}

/**
 * Expande un hex de marca a la tupla de 10 tonos de Mantine (base en el índice 6). Determinista.
 * Lanza si el hex es inválido — el caller (`overrideDesdeBranding`) valida antes y degrada limpio.
 */
export function generarEscalaColor(hex: string): MantineColorsTuple {
  const base = hexARgb(hex);
  if (!base) {
    throw new Error(`Color de marca inválido: ${hex}`);
  }
  const tonos = RAMPA.map(({ hacia, cantidad }) =>
    cantidad === 0 ? rgbAHex(base) : rgbAHex(mezclar(base, hacia, cantidad)),
  );
  // RAMPA tiene exactamente 10 entradas ⇒ `tonos` tiene 10; el tipo tuple se pierde en `.map`.
  return tonos as unknown as MantineColorsTuple;
}

/**
 * `true` sii `valor` es un hex de 3 o 6 dígitos. Exportado (builder-tanda-1 F01): el borde valida
 * el `colorAcento` entrante con el MISMO criterio antes de escribir `Tenant.colorAcento`.
 */
export function esHex(valor: string | null | undefined): valor is string {
  return valor != null && (HEX_CORTO.test(valor) || HEX_LARGO.test(valor));
}

/**
 * Construye el theme override del tenant a partir de su branding (D2; +acento en builder-tanda-1
 * F01/D1). Solo los COLORES de marca alteran el theme; el resto del branding (logo/textos) lo consume
 * el chrome del storefront, no el theme. Cada color inválido/ausente se OMITE (degradación limpia, I9):
 * sin `colorPrimario` queda el primario de plataforma; sin `colorAcento` los esquemas `acento*`
 * degradan por fallback CSS a la escala de marca (I-T2). Puro y determinista (mismo branding ⇒ mismo
 * override, sirve SSR + cliente sin mismatch).
 */
export function overrideDesdeBranding(
  branding: TenantBranding,
): MantineThemeOverride {
  const colors: Record<string, ReturnType<typeof generarEscalaColor>> = {};
  if (esHex(branding.colorPrimario)) {
    colors[COLOR_MARCA] = generarEscalaColor(branding.colorPrimario);
  }
  if (esHex(branding.colorAcento)) {
    colors[COLOR_ACENTO] = generarEscalaColor(branding.colorAcento);
  }
  if (Object.keys(colors).length === 0) return {};
  return {
    colors,
    // El primario del storefront solo se mueve si el tenant definió su color de marca; un tenant con
    // solo acento conserva el primario de plataforma (el acento sigue disponible por su token).
    ...(colors[COLOR_MARCA] ? { primaryColor: COLOR_MARCA } : {}),
  };
}

/** Radio global del TemaPagina (enum) → `defaultRadius` de Mantine. `nulo` = sin radio. */
const RADIO_A_MANTINE: Record<string, string | number> = {
  nulo: 0,
  s: "sm",
  m: "md", // = el defaultRadius base de plataforma
  l: "lg",
  completo: "xl",
};

/**
 * Override de theme derivado del `TemaPagina` del documento (catálogo-v2 F02/D3). Aplica el `radio`
 * global (override de `defaultRadius`). El `modo` (claro/oscuro) NO va acá — lo aplica
 * `MantineProvider` vía `forceColorScheme` en `_app`. La `tipografia` tampoco — se swapean las CSS
 * vars `--font-*` en `_app` (el theme ya las consume por var). `vibe` queda reservado (v1: sin efecto
 * visual propio más allá del radio; ampliable sin romper el schema). Puro y determinista.
 */
export function overrideDesdeTema(tema: Tema): MantineThemeOverride {
  return { defaultRadius: RADIO_A_MANTINE[tema.radio] ?? "md" };
}

/**
 * Gradiente temático de la plantilla rica (plantilla-rica F04/D7, design.md §5.2): el fondo con el
 * que degradan los slots de imagen ausentes (hero sin `heroImageUrl`, portada/premio sin imagen).
 * Deriva su color de la ESCALA del `colorPrimario` — **cero hex inline** (design.md §9), solo CSS
 * vars del theme:
 *   - Con color de marca ⇒ la escala vive en `--mantine-color-marca-N` (la generó
 *     `overrideDesdeBranding`); usamos tonos medios→oscuros para un fondo con cuerpo.
 *   - Sin color de marca ⇒ el primario BASE de plataforma (`--mantine-primary-color-*`, que Mantine
 *     siempre define) — el storefront degrada igual de limpio, sobre el theme neutro.
 * Puro y determinista: mismo `colorPrimario` ⇒ mismo string (sirve SSR + cliente sin mismatch).
 */
export function gradienteTematico(colorPrimario: string | null): string {
  if (esHex(colorPrimario)) {
    return `linear-gradient(135deg, var(--mantine-color-${COLOR_MARCA}-5), var(--mantine-color-${COLOR_MARCA}-8))`;
  }
  return "linear-gradient(135deg, var(--mantine-primary-color-filled), var(--mantine-primary-color-filled-hover))";
}

/** Hash FNV-1a estable de una `semilla` (sin dependencias) → uint32. Determinista (SSR = cliente). */
function hashSemilla(semilla: string): number {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Gradiente de PORTADA-placeholder del catálogo (Tanda 2 F13). REEMPLAZA el `hue-rotate` de F12, que
 * rotaba el matiz por el círculo completo e introducía AZULES ajenos a la paleta de marca (bug: las
 * covers lila quedaban azules). Acá el gradiente sale de un SET CURADO acotado a la FAMILIA del tenant
 * (mezclas de la escala primario/acento vía tokens y `color-mix`), elegido por hash del título:
 * coherencia de paleta GARANTIZADA (nada fuera de la marca) con variedad real (6 combinaciones). Cero
 * hex (I-A): todo es `var(--mantine-color-*)`/`color-mix` de tokens. Determinista por `semilla` (mismo
 * título ⇒ mismo gradiente, sirve SSR + cliente sin mismatch).
 *
 * Los tonos primarios usan `--mantine-primary-color-N` (que Mantine aliasa a la escala `marca` del
 * tenant cuando definió su color, o al primario de plataforma si no); el acento usa la escala `acento`
 * con FALLBACK CSS al primario (I-T2: un tenant sin acento degrada dentro de su misma familia). Mismo
 * criterio de tokens que `estiloSeccion.ts`.
 */
export function gradientePortadaDeterminista(
  _colorPrimario: string | null,
  semilla: string,
): string {
  // Tono primario DARK-AWARE (Tanda 2 F15/fidelidad concert): cada stop es `light-dark(claro, oscuro)`
  // donde el tono OSCURO usa un índice MÁS CLARO (más brillo/saturación) ⇒ en modo oscuro las covers
  // salen vivas (rosa/lila del prototipo concert) en vez de apagadas; en modo CLARO se elige el índice
  // de siempre (no-op byte-idéntico, I-H). El acento degrada al primario dentro de la familia (I-T2).
  const p = (nl: number, nd: number) =>
    `light-dark(var(--mantine-primary-color-${nl}), var(--mantine-primary-color-${nd}))`;
  const a = (nl: number, nd: number) =>
    `light-dark(var(--mantine-color-${COLOR_ACENTO}-${nl}, var(--mantine-primary-color-${nl})), var(--mantine-color-${COLOR_ACENTO}-${nd}, var(--mantine-primary-color-${nd})))`;
  const SET = [
    `linear-gradient(140deg, ${p(5, 4)}, ${p(8, 6)})`, // marca media → profunda (el tematico de siempre)
    `linear-gradient(140deg, ${p(6, 4)}, ${p(9, 7)})`, // marca profunda
    `linear-gradient(150deg, ${p(6, 4)}, ${a(7, 5)})`, // primario → acento profundo
    `linear-gradient(150deg, ${a(5, 4)}, ${p(8, 6)})`, // acento → marca profunda
    `linear-gradient(135deg, ${p(4, 3)}, ${p(7, 5)})`, // marca clara → media (pastel con cuerpo)
    `linear-gradient(160deg, color-mix(in srgb, ${p(6, 4)} 60%, ${a(6, 4)}), ${p(9, 7)})`, // mezcla marca/acento → profundo
  ];
  return SET[hashSemilla(semilla) % SET.length]!;
}
