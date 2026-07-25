#!/usr/bin/env node
/**
 * build-tokens.mjs — genera `_brand/brand.tokens.css` (variables `--st-*`) de la fábrica.
 *
 *   node videos/hyperframes/build-tokens.mjs [--check]
 *
 * FUENTE DE VERDAD DE LOS COLORES: `src/styles/theme.ts` (D4). Este script NO copia hex a mano:
 * importa el theme real de Mantine con `npx tsx` (dependencia ya presente del repo) y emite las
 * tuplas de 10 tonos + `black`/`white` como CSS vars. Cambiar la paleta = editar `theme.ts` y
 * re-correr esto. Cero drift entre la marca de la app y la de los videos.
 *
 * Lo que NO existe en `theme.ts` porque es exclusivo del medio video (canvas 1920×1080, medidas
 * del chrome mockeado, radios/sombras/plumón en px, nombres reales de las 4 familias) sale de
 * `_brand/tokens.local.json`. Ese archivo NO contiene hex: las sombras declaran color por NOMBRE
 * de token derivado + alpha, y acá se resuelven a `rgba()`.
 *
 * Degradación documentada (D4): si el import de `theme.ts` fallara (cambio de stack, tsx ausente),
 * este script FALLA RUIDOSO en vez de emitir un CSS mudo. El fallback aprobado sería copiar los hex
 * a mano en `tokens.local.json` con el comentario "sincronizar a mano con theme.ts" — pero mientras
 * el import ande, no se hace.
 *
 * Gate extra: verifica que las constantes `CHROME` de `_lib/tour-kit.js` coincidan con
 * `tokens.local.json → chrome` (la geometría la consumen CSS y JS; si divergen, el mock se
 * desalinea en silencio).
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));      // videos/hyperframes
const REPO = join(HERE, "..", "..");                        // raíz del repo
const BRAND = join(HERE, "_brand");
const SALIDA = join(BRAND, "brand.tokens.css");

const soloChequear = process.argv.includes("--check");

// ── 1. tokens.local.json ─────────────────────────────────────────────────────
const local = JSON.parse(readFileSync(join(BRAND, "tokens.local.json"), "utf8"));

// ── 2. theme.ts (via tsx) ────────────────────────────────────────────────────
/**
 * Mapa `clave de theme.colors` → `prefijo del token de video`. El renombre es deliberado: en el
 * video los nombres son de MARCA (cobalto/ladrillo/gris), no de framework.
 */
const NOMBRE = {
  sorteatelo: "cobalto",
  amarillo: "amarillo",
  exito: "exito",
  premio: "premio",
  pendiente: "pendiente",
  red: "ladrillo",
  gray: "gris",
  hundido: "hundido",
};

function leerTheme() {
  // Extractor EFÍMERO: `.mts` (el `include` del tsconfig de la app es `**/*.ts`, no matchea `.mts`)
  // y se borra en el finally, así no agrega superficie al `check:types` del repo (I2).
  const tmp = join(BRAND, ".extraer-theme.mts");
  // Import RELATIVO al archivo temporal (no al cwd) — `_brand/` está 3 niveles bajo la raíz.
  const rel = relative(BRAND, join(REPO, "src", "styles", "theme")).split(sep).join("/");
  writeFileSync(
    tmp,
    `import { theme } from "${rel}";\n` +
      `process.stdout.write(JSON.stringify({\n` +
      `  primaryColor: theme.primaryColor,\n` +
      `  primaryShade: theme.primaryShade,\n` +
      `  black: theme.black,\n` +
      `  white: theme.white,\n` +
      `  colors: theme.colors,\n` +
      `}));\n`,
  );
  try {
    const r = spawnSync("npx", ["tsx", tmp], {
      cwd: REPO,
      encoding: "utf8",
      shell: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (r.status !== 0 || !r.stdout) {
      console.error("✗ No pude importar src/styles/theme.ts con tsx (D4).");
      console.error(r.stderr ?? "");
      console.error(
        "  Fallback aprobado: copiar los hex a mano en tokens.local.json con el comentario\n" +
          '  "sincronizar a mano con theme.ts". NO se hace en silencio.',
      );
      process.exit(1);
    }
    return JSON.parse(r.stdout.trim());
  } finally {
    rmSync(tmp, { force: true });
  }
}

const theme = leerTheme();
const shade = typeof theme.primaryShade === "number" ? theme.primaryShade : 6;

// ── 3. resolución de color por NOMBRE de token (para las sombras de tokens.local.json) ───────
const hexPorToken = new Map();
hexPorToken.set("tinta", theme.black);
hexPorToken.set("blanco", theme.white);
for (const [clave, prefijo] of Object.entries(NOMBRE)) {
  const tupla = theme.colors?.[clave];
  if (!tupla) continue;
  tupla.forEach((hex, i) => hexPorToken.set(`${prefijo}-${i}`, hex));
}

const aRgb = (hex) => {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (token, alpha) => {
  const hex = hexPorToken.get(token);
  if (!hex) {
    console.error(`✗ tokens.local.json refiere el color "${token}", que no existe en theme.ts.`);
    process.exit(1);
  }
  const [r, g, b] = aRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const sombra = (capas) =>
  capas.map((c) => `${c.x}px ${c.y}px ${c.blur}px ${rgba(c.color, c.alpha)}`).join(", ");

// ── 4. gate de drift: CHROME de tour-kit.js == chrome de tokens.local.json ───────────────────
function verificarChrome() {
  const kit = join(HERE, "_lib", "tour-kit.js");
  if (!existsSync(kit)) return; // todavía no portado (F02)
  const src = readFileSync(kit, "utf8");
  const bloque = src.match(/const CHROME = \{([\s\S]*?)\};/);
  if (!bloque) {
    console.error("✗ _lib/tour-kit.js no declara `const CHROME = { … }` — el gate de drift no puede correr.");
    process.exit(1);
  }
  const malos = [];
  for (const [k, v] of Object.entries(local.chrome)) {
    if (k.startsWith("_")) continue;
    const m = bloque[1].match(new RegExp(`\\b${k}\\s*:\\s*(\\d+)`));
    if (!m) malos.push(`${k}: falta en tour-kit.js`);
    else if (Number(m[1]) !== v) malos.push(`${k}: tour-kit.js=${m[1]} vs tokens.local.json=${v}`);
  }
  if (malos.length) {
    console.error("✗ Drift de geometría del chrome entre _lib/tour-kit.js y _brand/tokens.local.json:");
    for (const m of malos) console.error(`    ${m}`);
    process.exit(1);
  }
}
verificarChrome();

// ── 5. emisión del CSS ───────────────────────────────────────────────────────
const L = [];
L.push("/* ============================================================================");
L.push("   brand.tokens.css — GENERADO por videos/hyperframes/build-tokens.mjs. NO editar a mano.");
L.push("");
L.push("   Colores  → derivados de `src/styles/theme.ts` (fuente única de la paleta «El Talonario»).");
L.push("   Lo demás → `_brand/tokens.local.json` (exclusivo del medio video).");
L.push("   Regenerar: node videos/hyperframes/build-tokens.mjs");
L.push("   ============================================================================ */");
L.push(":root {");

L.push("  /* ── Paleta derivada de theme.ts (tuplas de 10 tonos de Mantine) ────────────────── */");
for (const [clave, prefijo] of Object.entries(NOMBRE)) {
  const tupla = theme.colors?.[clave];
  if (!tupla) continue;
  L.push(`  /* ${clave} → ${prefijo} */`);
  tupla.forEach((hex, i) => L.push(`  --st-${prefijo}-${i}: ${hex};`));
}
L.push("");
L.push(`  --st-tinta: ${theme.black};`);
L.push(`  --st-blanco: ${theme.white};`);

L.push("");
L.push("  /* ── Roles semánticos (design.md §2). El acento del kit es el COBALTO de plataforma, */");
L.push(`  /*    anclado en el índice ${shade} = primaryShade del theme. */`);
L.push(`  --st-acento: var(--st-cobalto-${shade});`);
L.push(`  --st-acento-fuerte: var(--st-cobalto-${shade + 1});`);
L.push("  --st-acento-claro: var(--st-cobalto-4);");
L.push("  --st-acento-tenue: var(--st-cobalto-0);");
L.push(`  --st-premio: var(--st-premio-${shade});`);
L.push(`  --st-exito: var(--st-exito-${shade});`);
L.push(`  --st-pendiente: var(--st-pendiente-${shade});`);
L.push(`  --st-ladrillo: var(--st-ladrillo-${shade});`);
L.push("");
L.push("  --st-texto: var(--st-tinta);");
L.push("  --st-texto-suave: var(--st-gris-6);");
L.push("  --st-texto-tenue: var(--st-gris-4);");
L.push("  --st-texto-invertido: var(--st-blanco);");
L.push("  --st-borde: var(--st-gris-2);");
L.push("  --st-superficie: var(--st-blanco);");
L.push("  --st-canvas: var(--st-gris-0);       /* fondo del área de contenido del panel (§4) */");
L.push("  --st-banda: var(--st-gris-1);        /* gris banda de las secciones claras */");
L.push("  --st-hundido: var(--st-hundido-1);   /* celeste del chrome de marca (landing/login) */");
L.push("  --st-stage: var(--st-gris-1);        /* fondo del escenario del video */");

L.push("");
L.push("  /* ── Rail tinta del panel «Oscuro + calmo» (§4) ─────────────────────────────────── */");
L.push("  --st-rail-bg: var(--st-tinta);");
L.push("  --st-rail-texto: var(--st-gris-4);");
L.push(`  --st-rail-activo-bg: ${rgba(local.tintes.railActivo.color, local.tintes.railActivo.alpha)};`);
L.push(`  --st-rail-hover-bg: ${rgba(local.tintes.railHover.color, local.tintes.railHover.alpha)};`);
L.push("  --st-rail-activo-texto: var(--st-blanco);");
L.push("  --st-rail-activo-barra: var(--st-cobalto-4);");
L.push("  --st-rail-divisor: var(--st-gris-8);");
L.push("  --st-navegador-bg: var(--st-gris-2);  /* barra del browser chrome */");

L.push("");
L.push("  /* ── Tipografía (design.md §3 — familias reales; la app las cablea por next/font) ── */");
for (const [rol, f] of Object.entries(local.fuentes)) {
  if (rol.startsWith("_")) continue;
  L.push(`  --st-font-${rol}: "${f.familia}", ${f.fallback};`);
}

L.push("");
L.push("  /* ── Geometría del medio video (tokens.local.json) ──────────────────────────────── */");
L.push(`  --st-video-ancho: ${local.video.ancho}px;`);
L.push(`  --st-video-alto: ${local.video.alto}px;`);
L.push(`  --st-rail-ancho: ${local.chrome.railAncho}px;`);
L.push(`  --st-rail-colapsado: ${local.chrome.railColapsado}px;`);
L.push(`  --st-topbar-alto: ${local.chrome.topbarAlto}px;`);
L.push(`  --st-navegador-alto: ${local.chrome.navegadorAlto}px;`);

L.push("");
L.push("  /* ── Gramática suave de marca (§4): radios, sombras difusas, plumón ─────────────── */");
for (const [k, v] of Object.entries(local.gramatica.radios)) L.push(`  --st-radio-${k}: ${v}px;`);
L.push(`  --st-plumon-alto: ${local.gramatica.plumonAlto}px;`);
for (const [k, capas] of Object.entries(local.gramatica.sombras)) {
  L.push(`  --st-sombra-${k}: ${sombra(capas)};`);
}
L.push(`  --st-velo: ${rgba(local.gramatica.velo.color, local.gramatica.velo.alpha)};`);
L.push("}");
L.push("");

const css = L.join("\n");

if (soloChequear) {
  const actual = existsSync(SALIDA) ? readFileSync(SALIDA, "utf8") : "";
  if (actual !== css) {
    console.error("✗ _brand/brand.tokens.css está DESACTUALIZADO respecto de theme.ts/tokens.local.json.");
    console.error("  Corré: node videos/hyperframes/build-tokens.mjs");
    process.exit(1);
  }
  console.log("✓ brand.tokens.css al día con theme.ts + tokens.local.json");
  process.exit(0);
}

writeFileSync(SALIDA, css);

const nTokens = css.split("\n").filter((l) => l.trim().startsWith("--st-")).length;
console.log(`✓ _brand/brand.tokens.css — ${nTokens} tokens --st-*`);
console.log(`  paleta desde src/styles/theme.ts (primary "${theme.primaryColor}", shade ${shade})`);
console.log(`  cobalto ${hexPorToken.get(`cobalto-${shade}`)} · amarillo ${hexPorToken.get(`amarillo-${shade}`)} · tinta ${theme.black}`);
console.log(`  fuentes: ${Object.values(local.fuentes).filter((f) => f.familia).map((f) => f.familia).join(" · ")}`);
