import {
  type MantineColorsTuple,
  type MantineThemeOverride,
} from "@mantine/core";

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
  heroTitulo: string | null;
  heroSubtitulo: string | null;
  avisoTexto: string | null;
}

/** Clave del color de marca en `theme.colors`. Un solo token = un solo color (design.md §2). */
export const COLOR_MARCA = "marca";

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

/** `true` sii `valor` es un hex de 3 o 6 dígitos. */
function esHex(valor: string | null): valor is string {
  return valor !== null && (HEX_CORTO.test(valor) || HEX_LARGO.test(valor));
}

/**
 * Construye el theme override del tenant a partir de su branding (D2). Solo el color de marca
 * altera el theme hoy; el resto del branding (logo/textos) lo consume el chrome del storefront,
 * no el theme. Sin color válido ⇒ override vacío ⇒ queda el theme base de plataforma (I9).
 */
export function overrideDesdeBranding(
  branding: TenantBranding,
): MantineThemeOverride {
  if (!esHex(branding.colorPrimario)) return {};
  return {
    colors: { [COLOR_MARCA]: generarEscalaColor(branding.colorPrimario) },
    primaryColor: COLOR_MARCA,
  };
}
